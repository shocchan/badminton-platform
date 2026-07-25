// 保存層（repository パターン）
// MVP: localStorage 実装。将来は同じ interface のまま Supabase 実装
// （students / ai_lesson_sessions / ai_lesson_progress テーブル）へ差し替える。
// UIコンポーネントは必ずこの repository 経由で読み書きし、localStorage を直接触らない。

import type { HearingAnswers, LearningPlan, ProgressState, SessionRecord } from './types';

export interface StudentProfile {
  answers: HearingAnswers;
  plan: LearningPlan;
  createdAtISO: string;
}

export interface AiLessonRepository {
  loadProfile(): StudentProfile | null;
  saveProfile(profile: StudentProfile): void;
  loadProgress(): ProgressState;
  saveProgress(progress: ProgressState): void;
  appendSession(session: SessionRecord): void;
  listSessions(): SessionRecord[];
  clearAll(): void;
}

const PREFIX = 'kawabado.aiLesson.v1.';
const KEY_PROFILE = PREFIX + 'profile';
const KEY_PROGRESS = PREFIX + 'progress';
const KEY_SESSIONS = PREFIX + 'sessions';

export const EMPTY_PROGRESS: ProgressState = {
  totalXp: 0,
  streakDays: 0,
  lastLessonDateISO: null,
  totalLearned: 0,
  totalSelfUsed: 0,
  totalReviewSuccess: 0,
};

const readJson = <T>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ストレージ不可（プライベートモード等）でもデモは続行できるよう黙って無視
  }
};

// LearningPlan.target.detect は RegExp のため JSON 化で失われる。復元して返す。
const reviveProfile = (p: StudentProfile | null): StudentProfile | null => {
  if (!p) return null;
  const d = p.plan.target.detect as unknown;
  if (!(d instanceof RegExp)) {
    // 保存形式 { source, flags } または欠損からの復元
    const src = typeof d === 'object' && d !== null && 'source' in d
      ? (d as { source: string }).source
      : String(p.plan.target.label).replace(/[「」〜]/g, '');
    p.plan.target.detect = new RegExp(src);
  }
  return p;
};

const createLocalStorageRepository = (): AiLessonRepository => ({
  loadProfile() {
    return reviveProfile(readJson<StudentProfile>(KEY_PROFILE));
  },
  saveProfile(profile) {
    // RegExp は JSON.stringify で {} になるため source/flags 形式で保存する
    const serializable = {
      ...profile,
      plan: {
        ...profile.plan,
        target: {
          ...profile.plan.target,
          detect: { source: profile.plan.target.detect.source, flags: profile.plan.target.detect.flags },
        },
      },
    };
    writeJson(KEY_PROFILE, serializable);
  },
  loadProgress() {
    return readJson<ProgressState>(KEY_PROGRESS) ?? { ...EMPTY_PROGRESS };
  },
  saveProgress(progress) {
    writeJson(KEY_PROGRESS, progress);
  },
  appendSession(session) {
    const sessions = readJson<SessionRecord[]>(KEY_SESSIONS) ?? [];
    sessions.push(session);
    writeJson(KEY_SESSIONS, sessions.slice(-50)); // デモなので直近50件まで
  },
  listSessions() {
    return readJson<SessionRecord[]>(KEY_SESSIONS) ?? [];
  },
  clearAll() {
    [KEY_PROFILE, KEY_PROGRESS, KEY_SESSIONS].forEach((k) => {
      try { localStorage.removeItem(k); } catch { /* noop */ }
    });
  },
});

export const aiLessonRepository: AiLessonRepository = createLocalStorageRepository();

// ── パスコードゲート通過状態（タブを閉じるまで有効） ──
const GATE_KEY = PREFIX + 'gatePassed';

export const isGatePassed = (): boolean => {
  try {
    return sessionStorage.getItem(GATE_KEY) === '1';
  } catch {
    return false;
  }
};

export const markGatePassed = (): void => {
  try {
    sessionStorage.setItem(GATE_KEY, '1');
  } catch {
    // noop
  }
};

/** ローカル日付（端末TZ）の YYYY-MM-DD */
export const todayISO = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ── 音声セッションログ（MVP: localStorage保存。将来 ai_lesson_voice_logs テーブルへ） ──
// 文字起こし・目標表現の使用・エラー等の記録のみ。秘密情報（client secret等）は絶対に含めない。

export interface VoiceLogEntry {
  /** 発話者（system = 接続・タイマー等のイベント） */
  speaker: 'student' | 'tutor' | 'system';
  text: string;
  /** セッション開始からの経過ミリ秒 */
  atMs: number;
  /** 生徒の発話に目標表現が含まれていたか */
  targetUse?: boolean;
  /** 中国語（簡体字）が含まれていたか（簡易判定） */
  hasZh?: boolean;
}

export interface VoiceSessionLog {
  startedAtISO: string;
  endedAtISO: string;
  /** completed / manual / timeout / error / fallback-to-text */
  endReason: string;
  entries: VoiceLogEntry[];
  targetUseCount: number;
  /** 目標表現の初回使用が自力かヒントありか（未使用は null） */
  targetUsage: 'self' | 'hint' | null;
  connectionErrors: string[];
}

const KEY_VOICE_LOGS = PREFIX + 'voiceLogs';

export const appendVoiceLog = (log: VoiceSessionLog): void => {
  const logs = readJson<VoiceSessionLog[]>(KEY_VOICE_LOGS) ?? [];
  logs.push(log);
  writeJson(KEY_VOICE_LOGS, logs.slice(-10)); // デモなので直近10セッションまで
};

export const listVoiceLogs = (): VoiceSessionLog[] => readJson<VoiceSessionLog[]>(KEY_VOICE_LOGS) ?? [];
