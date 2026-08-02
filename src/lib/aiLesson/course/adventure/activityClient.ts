// 学習アクティビティの client 入口（P0）。
//
// client には教材が無い。出題・採点・音声はすべてこのモジュール経由でサーバーから受け取る。
// **画面から直接 fetch を書かない**。ここを唯一の入口にしておくと、
// 「どこかで生の fetch を書いて認証を忘れる」経路が生まれない。
//
// 返る問題には正解・解説が**入っていない**。採点（grade）が回答後にだけ返す。

import type { AdvEnemyTier } from './advTypes';
import type { ExamSkill } from './advExamSkills';

// ── サーバーから返る形 ───────────────────────────────

export interface ServerChoice { key: string; textJa: string; textZh?: string }

/** 正解・解説を含まない出題形 */
export interface ServerQuestion {
  attemptToken: string;
  /** 偽名化された問題キー（既出管理・mastery台帳用） */
  key: string;
  type: string;
  skill: string;
  level: string;
  targetJapanese: string | null;
  questionJa: string | null;
  questionZh: string;
  choices: ServerChoice[];
  timed: boolean;
}

/** 読解・聴解の set 型出題（表示用フィールドつき） */
export interface ServerSetQuestion extends ServerQuestion {
  passageJa?: string;
  situationJa?: string;
  situationZh?: string;
  contextZh?: string;
  typeId?: string;
  estimatedSeconds?: number;
  durationSeconds?: number;
  playLimit?: number;
  audioToken?: string;
}

export interface ServerBattle {
  activity: 'battle';
  tier: AdvEnemyTier;
  timed: boolean;
  timeLimitSec: number | null;
  unseenRatio: number;
  skills: ExamSkill[];
  attemptSeed: number;
  questions: ServerQuestion[];
}

export interface ServerMockSection {
  sectionId: string; labelJa: string; labelZh: string;
  skills: string[]; timeLimitSec: number;
  questions: ServerQuestion[];
}

export interface ServerMock {
  activity: 'mock';
  attemptSeed: number;
  mode: 'short' | 'fullTime';
  level: 'N2' | 'N3';
  mockId: string;
  sections: ServerMockSection[];
}

export interface ServerDiagnosisQuestion {
  attemptToken: string;
  key: string;
  level: 'foundation' | 'n3' | 'n2';
  skill: 'vocabulary' | 'grammar';
  refId: string;
  promptJa: string;
  promptZh: string;
  choices: { key: string; text: string }[];
}

/** 採点結果。正解・解説はここで初めて返る */
export interface GradeResult {
  correct: boolean;
  correctKey: string;
  explanationJa?: string;
  explanationZh?: string;
  meaningZh?: string;
  exampleJa?: string | null;
  exampleZh?: string | null;
  sourceLabel?: string;
  rationaleSpan?: string | null;
  transcriptJa?: string | null;
  whyWrong?: { key: string; textJa: string; whyWrongJa: string; whyWrongZh: string }[];
}

export interface StageContentResponse {
  battleTargetIds: string[];
  nextGrammarIds: string[];
  nextUnitIds: string[];
  conversationTargets: { refId: string; expression: string; themeJa: string; themeZh: string }[];
  readingTargetIds: string[];
  listeningTargetIds: string[];
}

export type ActivityDenial =
  | 'unauthenticated' | 'invalid_session' | 'session_not_owned' | 'session_stale'
  | 'no_entitlement' | 'trial_not_started' | 'trial_expired' | 'trial_consumed'
  | 'stage_locked' | 'rate_limited' | 'not_found' | 'unavailable' | 'network';

export type ActivityResult<T> =
  | { ok: true; data: T }
  | { ok: false; denial: ActivityDenial; retryAfterSeconds: number };

/** 「もう一度やれば直る」種類の拒否か。利用権切れは再試行しても直らない */
export const isRetryable = (denial: ActivityDenial): boolean =>
  denial === 'network' || denial === 'rate_limited' || denial === 'unavailable';

// ── 呼び出し ─────────────────────────────────────────

export interface RuntimeAuth {
  /** Supabase の access token を返す（無ければ null＝未ログイン） */
  getAccessToken: () => Promise<string | null>;
  /** サーバーが署名したセッショントークン */
  sessionToken: string | null;
}

interface CallDeps { fetchFn?: typeof fetch; baseUrl?: string }

const call = async <T,>(
  auth: RuntimeAuth, path: string, body: Record<string, unknown>, deps: CallDeps = {},
): Promise<ActivityResult<T>> => {
  const doFetch = deps.fetchFn ?? fetch;
  const token = await auth.getAccessToken();
  if (!token) return { ok: false, denial: 'unauthenticated', retryAfterSeconds: 0 };
  if (!auth.sessionToken) return { ok: false, denial: 'invalid_session', retryAfterSeconds: 0 };
  let res: Response;
  try {
    res = await doFetch(`${deps.baseUrl ?? ''}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, sessionToken: auth.sessionToken }),
    });
  } catch {
    return { ok: false, denial: 'network', retryAfterSeconds: 3 };
  }
  if (res.ok) {
    try {
      return { ok: true, data: await res.json() as T };
    } catch {
      return { ok: false, denial: 'unavailable', retryAfterSeconds: 3 };
    }
  }
  let denial: ActivityDenial = 'unavailable';
  try {
    const b = await res.json() as { error?: string };
    if (b?.error) denial = b.error as ActivityDenial;
  } catch { /* 本文なし */ }
  if (res.status === 401) denial = 'unauthenticated';
  if (res.status === 429) denial = 'rate_limited';
  const retry = Number(res.headers.get('Retry-After') ?? 0) || (res.status === 429 ? 30 : 0);
  return { ok: false, denial, retryAfterSeconds: retry };
};

export const startBattle = (auth: RuntimeAuth, input: {
  tier: AdvEnemyTier; targetIds: string[];
  seenKeys: string[]; recentWrongKeys: string[]; attemptSeed?: number;
}, deps?: CallDeps): Promise<ActivityResult<ServerBattle>> =>
  call(auth, '/api/ai-course/activity/start', { activity: 'battle', ...input }, deps);

export const startReading = (auth: RuntimeAuth, input: { seenKeys: string[]; count?: number }, deps?: CallDeps) =>
  call<{ questions: ServerSetQuestion[] }>(auth, '/api/ai-course/activity/start', { activity: 'reading', ...input }, deps);

export const startListening = (auth: RuntimeAuth, input: { seenKeys: string[]; count?: number }, deps?: CallDeps) =>
  call<{ questions: ServerSetQuestion[] }>(auth, '/api/ai-course/activity/start', { activity: 'listening', ...input }, deps);

export const startMock = (auth: RuntimeAuth, input: {
  mode: 'short' | 'fullTime'; attemptSeed?: number;
}, deps?: CallDeps): Promise<ActivityResult<ServerMock>> =>
  call(auth, '/api/ai-course/activity/start', { activity: 'mock', ...input }, deps);

export const startDiagnosis = (auth: RuntimeAuth, input: {
  targetJlpt: 'N2' | 'N3' | null; goalType: string;
}, deps?: CallDeps): Promise<ActivityResult<{ questions: ServerDiagnosisQuestion[] }>> =>
  call(auth, '/api/ai-course/activity/start', { activity: 'diagnosis', ...input }, deps);

export const gradeAttempt = (auth: RuntimeAuth, input: {
  attemptToken: string; choiceKey: string | null;
}, deps?: CallDeps): Promise<ActivityResult<GradeResult>> =>
  call(auth, '/api/ai-course/activity/grade', input, deps);

export const gradeMockSession = (auth: RuntimeAuth, input: {
  attemptSeed: number; mode: 'short' | 'fullTime'; startedAt: string;
  answers: Record<string, string>; seenKeys: string[]; remainingSecBySection?: number[];
}, deps?: CallDeps): Promise<ActivityResult<{
  result: {
    totalCorrect: number; totalQuestions: number; totalUnanswered: number;
    sections: unknown[]; bySkill: Record<string, { correct: number; total: number; unseen: number }>;
    skills: string[]; allQuestionKeys: string[]; unseenRatio: number;
    mockId: string; level: 'N2' | 'N3'; mode: 'short' | 'fullTime';
  };
  reveal: Record<string, { correctKey: string; correct: boolean; explanationJa: string; explanationZh: string }>;
}>> =>
  call(auth, '/api/ai-course/activity/mock-grade', input, deps);

export const fetchStageContent = (auth: RuntimeAuth, input: {
  targets: { n3UnitIds?: string[]; n3GrammarIds?: string[]; n2Units?: number[] };
  stageKind?: string;
  masteredIds: string[];
}, deps?: CallDeps): Promise<ActivityResult<StageContentResponse>> =>
  call(auth, '/api/ai-course/stage-content', input, deps);

export interface GrammarDocPayload {
  grammarId: string; pattern: string; meaningJa: string; explanationZh: string;
  formation: string; examplesJa: string[]; examplesZh: string[];
  commonMistakesZh?: string; contrast?: string;
}

export const fetchGrammarDoc = (auth: RuntimeAuth, grammarId: string, deps?: CallDeps): Promise<ActivityResult<{ doc: GrammarDocPayload }>> =>
  call(auth, '/api/ai-course/grammar-doc', { grammarId }, deps);

/** 聴解音声のURL。audio要素の src へそのまま渡す */
export const audioUrl = (audioToken: string, baseUrl = ''): string =>
  `${baseUrl}/api/ai-course/audio?t=${encodeURIComponent(audioToken)}`;
