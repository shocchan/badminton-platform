// 会話力の成長計算層（純関数・UIから完全分離）。
//
// 方針（§15/§23）:
// - 会話力を1つの曖昧な点数にせず、複数軸で表す
// - 発話文字数が多いだけで高評価にしない（自力使用・会話継続・再使用・定着を重視）
// - 発話ログが不十分でも壊れない（sufficient=false を返す）
// - 実データ（セッションのフラグ・mastery・発話メトリクス）だけを根拠にする。捏造しない

import { COURSE_MISSIONS } from './courseMissionIndex.generated';
import { atLeast, isRetained } from './courseEngine';
import type { CourseMasteryState, CourseSessionRecord, CourseUtterance, ItemProgress, MissionCategory, SpeechMetrics } from './types';

/** 成長を「分析中」ではなく表示し始める最小セッション数 */
export const MIN_SESSIONS_FOR_GROWTH = 3;

const REASON_RE = /(から|ので|ため|理由|例えば|たとえば|なぜなら)/;
const ASKBACK_RE = /(もう一度|もういちど|どういう意味|どうい う|なんですか|何ですか|ですか？|ますか？|わかりません|分かりません|聞き取れ)/;
// 低信頼とみなす発話（文字起こしの断片・相槌のみ）は成長根拠から除外する
const isLowConfidence = (u: CourseUtterance): boolean =>
  !u.isFinal || u.transcript.trim().length < 2;

/**
 * 会話ログから、そのセッションの発話メトリクスを算出（生徒の確定発話のみ）。
 * 低信頼な断片は除外する。
 */
export const computeSpeechMetrics = (utterances: CourseUtterance[]): SpeechMetrics => {
  const clean = utterances.filter((u) => u.speaker !== 'system' && !isLowConfidence(u));
  const studentTurns = clean.filter((u) => u.speaker === 'student');
  const totalStudentChars = studentTurns.reduce((s, u) => s + u.transcript.trim().length, 0);
  const longestAnswerChars = studentTurns.reduce((m, u) => Math.max(m, u.transcript.trim().length), 0);
  let roundtrips = 0;
  for (let i = 1; i < clean.length; i++) {
    if (clean[i].speaker === 'student' && clean[i - 1].speaker === 'tutor') roundtrips += 1;
  }
  const studentText = studentTurns.map((u) => u.transcript).join('\n');
  return {
    studentTurns: studentTurns.length,
    totalStudentChars,
    longestAnswerChars,
    roundtrips,
    gaveReason: REASON_RE.test(studentText),
    askedBack: ASKBACK_RE.test(studentText),
  };
};

const readMetrics = (s: CourseSessionRecord): SpeechMetrics | null => {
  const m = s.speechMetrics;
  if (!m || typeof m.studentTurns !== 'number') return null;
  return m;
};

const completedNew = (sessions: CourseSessionRecord[]): CourseSessionRecord[] =>
  sessions.filter((s) => s.completionStatus === 'completed');

// ── 個別の成長指標（§15） ──

/** 自力で話せた割合（完了セッション中、目標を自力使用できた割合） */
export const calculateIndependentSpeakingRate = (sessions: CourseSessionRecord[]): number => {
  const c = completedNew(sessions);
  if (!c.length) return 0;
  return c.filter((s) => s.targetUsedIndependently).length / c.length;
};

/** 会話を続けられた往復数（発話メトリクスがあるセッションの平均往復数を 0..1 に正規化） */
export const calculateConversationContinuationScore = (sessions: CourseSessionRecord[]): { score: number; avgRoundtrips: number; sampled: number } => {
  const withM = sessions.map(readMetrics).filter((m): m is SpeechMetrics => m !== null);
  if (!withM.length) return { score: 0, avgRoundtrips: 0, sampled: 0 };
  const avg = withM.reduce((s, m) => s + m.roundtrips, 0) / withM.length;
  // 往復8回で満点の目安（3〜4分レッスン）
  return { score: Math.min(avg / 8, 1), avgRoundtrips: avg, sampled: withM.length };
};

/** 習った表現の再使用率（学習済みのうち、復習成功や別場面で再び使えたものの割合） */
export const calculateExpressionReuseRate = (progresses: ItemProgress[]): number => {
  const learned = progresses.filter((p) => atLeast(p.masteryState, 'initial'));
  if (!learned.length) return 0;
  const reused = learned.filter((p) => p.successfulReviews > 0 || atLeast(p.masteryState, 'reviewed_day1'));
  return reused.length / learned.length;
};

/** 中国語補助なしで進められた割合（直近ほど重視） */
export const calculateSupportReduction = (sessions: CourseSessionRecord[]): { withoutZhRate: number; improved: boolean } => {
  const c = completedNew(sessions);
  if (!c.length) return { withoutZhRate: 0, improved: false };
  const withoutZhRate = c.filter((s) => !s.chineseSupportUsed).length / c.length;
  // 直近5回 vs それ以前で、補助なし率が上がったか
  const recent = c.slice(0, 5);
  const older = c.slice(5, 15);
  const rate = (arr: CourseSessionRecord[]) => (arr.length ? arr.filter((s) => !s.chineseSupportUsed).length / arr.length : 0);
  const improved = older.length > 0 && rate(recent) > rate(older);
  return { withoutZhRate, improved };
};

/** 理由・具体例を付けられた割合（発話メトリクスから） */
export const calculateReasonRate = (sessions: CourseSessionRecord[]): number => {
  const withM = sessions.map(readMetrics).filter((m): m is SpeechMetrics => m !== null);
  if (!withM.length) return 0;
  return withM.filter((m) => m.gaveReason).length / withM.length;
};

/** 聞き返し・確認の力（発話メトリクスから） */
export const calculateAskBackRate = (sessions: CourseSessionRecord[]): number => {
  const withM = sessions.map(readMetrics).filter((m): m is SpeechMetrics => m !== null);
  if (!withM.length) return 0;
  return withM.filter((m) => m.askedBack).length / withM.length;
};

/** 1回の回答の平均文字数（発話量そのものは主指標にしない。参考値） */
export const calculateAverageAnswerLength = (sessions: CourseSessionRecord[]): number => {
  const withM = sessions.map(readMetrics).filter((m): m is SpeechMetrics => m !== null);
  const turns = withM.reduce((s, m) => s + m.studentTurns, 0);
  if (!turns) return 0;
  return withM.reduce((s, m) => s + m.totalStudentChars, 0) / turns;
};

/** ヒントなしで使えた表現数（used_independently 以上に到達した項目） */
export const countIndependentExpressions = (progresses: ItemProgress[]): number =>
  progresses.filter((p) => atLeast(p.masteryState, 'used_independently')).length;

/** 7日後も使えた表現数（retained_day7 以上） */
export const countRetainedExpressions = (progresses: ItemProgress[]): number =>
  progresses.filter((p) => isRetained(p.masteryState)).length;

// ── 会話力スキル6軸（§18 レーダー用。カテゴリ mastery ＋ 会話メトリクス） ──
export type SpeakingSkillKey = 'experience' | 'request' | 'opinion' | 'consult' | 'askBack' | 'continue';

export interface SpeakingSkill {
  key: SpeakingSkillKey;
  /** 0..1。カテゴリは mastery 平均、会話系は発話メトリクス */
  score: number;
  /** 根拠があるか（データ不足なら false） */
  grounded: boolean;
}

/**
 * スキルの見せ方（スコア競争にしない・§3）。
 * - 根拠が弱い → analyzing（分析中）
 * - しっかりできている → strength（強み）
 * - それ以外 → growing（伸びている途中）。※「弱い/失敗」という区分は作らない
 */
export type SkillLevel = 'strength' | 'growing' | 'analyzing';
export const skillLevel = (s: SpeakingSkill): SkillLevel =>
  !s.grounded ? 'analyzing' : s.score >= 0.7 ? 'strength' : 'growing';

const CATEGORY_OF_SKILL: Record<Exclude<SpeakingSkillKey, 'askBack' | 'continue'>, MissionCategory[]> = {
  experience: ['experience', 'change'],
  request: ['permission'],
  opinion: ['opinion', 'comparison', 'guess'],
  consult: ['trouble', 'workLife'],
};

const MASTERY_SCORE: Record<CourseMasteryState, number> = {
  initial: 0.15, understood: 0.3, used_with_hint: 0.45, used_independently: 0.65,
  reviewed_day1: 0.75, reviewed_day3: 0.85, retained_day7: 0.95, retained_day30: 1,
};

const categorySkillScore = (categories: MissionCategory[], progresses: ItemProgress[]): { score: number; grounded: boolean } => {
  const ids = COURSE_MISSIONS.filter((m) => categories.includes(m.category)).map((m) => m.id);
  const touched = progresses.filter((p) => ids.includes(p.itemId));
  if (!touched.length) return { score: 0, grounded: false };
  const score = touched.reduce((s, p) => s + (MASTERY_SCORE[p.masteryState] ?? 0), 0) / touched.length;
  return { score, grounded: true };
};

export const buildSpeakingSkills = (sessions: CourseSessionRecord[], progresses: ItemProgress[]): SpeakingSkill[] => {
  const skills: SpeakingSkill[] = [];
  (Object.keys(CATEGORY_OF_SKILL) as (keyof typeof CATEGORY_OF_SKILL)[]).forEach((key) => {
    const { score, grounded } = categorySkillScore(CATEGORY_OF_SKILL[key], progresses);
    skills.push({ key, score, grounded });
  });
  const askBack = calculateAskBackRate(sessions);
  const cont = calculateConversationContinuationScore(sessions);
  skills.push({ key: 'askBack', score: askBack, grounded: cont.sampled > 0 });
  skills.push({ key: 'continue', score: cont.score, grounded: cont.sampled > 0 });
  return skills;
};

// ── 総合の成長メトリクス ──
export interface GrowthMetrics {
  sufficient: boolean;
  sessionsAnalyzed: number;
  sessionsUntilReady: number;    // あと何回で表示できるか
  independentRate: number;
  reuseRate: number;
  withoutZhRate: number;
  zhReductionImproved: boolean;
  reasonRate: number;
  askBackRate: number;
  avgAnswerLength: number;
  avgRoundtrips: number;
  independentExpressions: number;
  retainedExpressions: number;
  /** 合成した「会話力の伸び」0..1（発話量偏重にしない加重） */
  overall: number;
  skills: SpeakingSkill[];
}

/**
 * 会話力の合成スコア（0..1）。
 * 発話量そのものは入れない。自力使用・会話継続・再使用・定着・補助なしを重視。
 */
export const calculateSpeakingGrowth = (sessions: CourseSessionRecord[], progresses: ItemProgress[]): GrowthMetrics => {
  const completed = completedNew(sessions);
  const analyzed = completed.length;
  const sufficient = analyzed >= MIN_SESSIONS_FOR_GROWTH;

  const independentRate = calculateIndependentSpeakingRate(sessions);
  const reuseRate = calculateExpressionReuseRate(progresses);
  const support = calculateSupportReduction(sessions);
  const reasonRate = calculateReasonRate(sessions);
  const askBackRate = calculateAskBackRate(sessions);
  const cont = calculateConversationContinuationScore(sessions);
  const learnedCount = progresses.filter((p) => atLeast(p.masteryState, 'initial')).length;
  const retained = countRetainedExpressions(progresses);
  const retainRate = learnedCount ? retained / learnedCount : 0;

  // 加重（合計1.0）。自力使用と定着・会話継続を主役に。理由/聞き返しは補助。
  const overall =
    independentRate * 0.30 +
    retainRate * 0.20 +
    reuseRate * 0.15 +
    cont.score * 0.15 +
    support.withoutZhRate * 0.10 +
    reasonRate * 0.05 +
    askBackRate * 0.05;

  return {
    sufficient,
    sessionsAnalyzed: analyzed,
    sessionsUntilReady: Math.max(MIN_SESSIONS_FOR_GROWTH - analyzed, 0),
    independentRate,
    reuseRate,
    withoutZhRate: support.withoutZhRate,
    zhReductionImproved: support.improved,
    reasonRate,
    askBackRate,
    avgAnswerLength: calculateAverageAnswerLength(sessions),
    avgRoundtrips: cont.avgRoundtrips,
    independentExpressions: countIndependentExpressions(progresses),
    retainedExpressions: retained,
    overall: Math.min(overall, 1),
    skills: buildSpeakingSkills(sessions, progresses),
  };
};

// ── 成長スナップショット（§16。時系列で保存） ──
export type SnapshotTrigger =
  | 'diagnosis' | 'after5' | 'after20' | 'midcourse' | 'final' | 'manual'
  | `week${number}`;

export interface GrowthSnapshot {
  createdAtISO: string;
  triggerKind: SnapshotTrigger;
  sessionCount: number;
  metrics: GrowthMetrics;
  /** 到達済みの can-do id（courseCanDo と対応） */
  canDoIds: string[];
  nextAbilityId: string | null;
  /** 代表的な生徒の実発話（低信頼を除外済み）。無ければ null */
  representativeUtterance: string | null;
}

export const buildGrowthSnapshot = (params: {
  trigger: SnapshotTrigger;
  sessions: CourseSessionRecord[];
  progresses: ItemProgress[];
  canDoIds: string[];
  nextAbilityId: string | null;
  representativeUtterance: string | null;
  now?: Date;
}): GrowthSnapshot => ({
  createdAtISO: (params.now ?? new Date()).toISOString(),
  triggerKind: params.trigger,
  sessionCount: params.sessions.filter((s) => s.completionStatus === 'completed').length,
  metrics: calculateSpeakingGrowth(params.sessions, params.progresses),
  canDoIds: params.canDoIds,
  nextAbilityId: params.nextAbilityId,
  representativeUtterance: params.representativeUtterance,
});

/**
 * この完了回数で、どのマイルストーン・スナップショットを撮るべきか（未取得なら）。
 * diagnosis(0) / after5(5) / after20(20) / midcourse(30) / final(60) と各週末。
 */
export const dueSnapshotTrigger = (completedSessions: number, currentWeek: number, existing: Set<string>): SnapshotTrigger | null => {
  const candidates: { trigger: SnapshotTrigger; at: number }[] = [
    { trigger: 'after5', at: 5 },
    { trigger: 'after20', at: 20 },
    { trigger: 'midcourse', at: 30 },
    { trigger: 'final', at: 60 },
  ];
  for (const c of candidates) {
    if (completedSessions >= c.at && !existing.has(c.trigger)) return c.trigger;
  }
  // 週末スナップショット（現在の週の1つ前まで＝その週を終えた）
  const weekTrigger = `week${Math.max(currentWeek - 1, 0)}` as SnapshotTrigger;
  if (currentWeek > 1 && !existing.has(weekTrigger)) return weekTrigger;
  return null;
};
