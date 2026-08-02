// コースの学習ロジック（すべて純関数）
// UI・保存層から独立させ、テストしやすくする。
//   selectDueReviews()     … 期日到来した復習を優先度順に返す
//   calculateWeakItems()   … 苦手項目（学習済みだが自力使用未達）
//   selectNextMission()    … 次に学ぶ新規ミッション
//   buildLessonPlan()      … 復習1＋新規1を基本にプランを組む
//   updateMasteryState()   … レッスン/復習結果で状態を昇格（降格しない）
//   adjustDifficulty()     … 直近成績で難易度を±1

import {
  COURSE_MASTERY_ORDER,
  DIFFICULTY_ADJUST,
  RETAINED_STATES,
  REVIEW_INTERVALS,
} from './courseConfig';
import { COURSE_MISSIONS } from './courseMissionIndex.generated';
import type {
  CourseMasteryState,
  CourseSessionRecord,
  ItemProgress,
  Learner,
  LessonKind,
  LessonPlan,
  LessonPlanStep,
  Mission,
  ReviewStage,
} from './types';

export const missionById = (id: string): Mission | undefined =>
  COURSE_MISSIONS.find((m) => m.id === id);

const rank = (s: CourseMasteryState): number => COURSE_MASTERY_ORDER.indexOf(s);
export const atLeast = (s: CourseMasteryState, min: CourseMasteryState): boolean => rank(s) >= rank(min);
export const isRetained = (s: CourseMasteryState): boolean => RETAINED_STATES.includes(s);

/** そのレッスン種別が「復習」か（ホームの主要CTA・レポートの表示切替に使う） */
export const isReviewKind = (kind: LessonKind): boolean => kind.startsWith('review') || kind === 'extra';

const todayISO = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
const addDays = (baseISO: string, days: number): string => {
  const d = new Date(baseISO + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return todayISO(d);
};

/** 復習ステージ → レッスン種別 */
const reviewStageToKind = (stage: ReviewStage): LessonKind => {
  switch (stage) {
    case 'day1': return 'review_day1';
    case 'day3': return 'review_day3';
    case 'day7': return 'review_day7';
    case 'day30': return 'review_day30';
    default: return 'extra';
  }
};

/** 週の5番目は「週間総合実践」。通常の新規ミッションとは別種別として扱う */
export const WEEKLY_PRACTICE_ORDER = 5;
export const isWeeklyMission = (m: Mission): boolean => m.order === WEEKLY_PRACTICE_ORDER;

/** コース期間（12週）。30日後復習をこの期間内に収められるかの判定に使う */
export const COURSE_TOTAL_DAYS = 12 * 7;

/**
 * 週間総合実践で扱う表現を選ぶ（2〜4個）。
 * - その週の1〜4番目のうち、学習済みのものを対象にする
 * - 定着が弱い／失敗が多いものを優先（苦手表現を優先）
 */
export const selectWeeklyPracticeItems = (
  week: number,
  progresses: ItemProgress[],
): Mission[] => {
  const weekMissions = COURSE_MISSIONS
    .filter((m) => m.week === week && m.order < WEEKLY_PRACTICE_ORDER && m.isPublished)
    .sort((a, b) => a.order - b.order);
  const learned = weekMissions.filter((m) => progresses.some((p) => p.itemId === m.id));
  const pool = learned.length > 0 ? learned : weekMissions;

  // 弱い順（未学習 → 状態が低い → 失敗が多い）に並べる
  const weakness = (m: Mission): number => {
    const p = progresses.find((x) => x.itemId === m.id);
    if (!p) return -1;
    return rank(p.masteryState) - p.failedReviews * 2;
  };
  const sorted = [...pool].sort((a, b) => weakness(a) - weakness(b) || a.order - b.order);
  const take = Math.min(4, Math.max(2, sorted.length));
  return sorted.slice(0, take);
};

export interface DueReview {
  progress: ItemProgress;
  mission: Mission;
  overdue: boolean;   // 期限を過ぎている
  kind: LessonKind;
}

/** 期日到来（当日含む）の復習を、期限超過→当日、翌日→3日→7日 の順で返す */
export const selectDueReviews = (progresses: ItemProgress[], now = new Date()): DueReview[] => {
  const today = todayISO(now);
  const due: DueReview[] = [];
  for (const p of progresses) {
    if (!p.nextReviewAt || p.reviewStage === 'none') continue;
    if (p.nextReviewAt <= today) {
      const mission = missionById(p.itemId);
      if (!mission) continue;
      due.push({ progress: p, mission, overdue: p.nextReviewAt < today, kind: reviewStageToKind(p.reviewStage) });
    }
  }
  const stageOrder: ReviewStage[] = ['day1', 'day3', 'day7', 'day30', 'extra'];
  return due.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1; // 期限超過を最優先
    return stageOrder.indexOf(a.progress.reviewStage) - stageOrder.indexOf(b.progress.reviewStage);
  });
};

/** 苦手項目: 学習済みだが自力使用に届いていない（失敗回数が多い順） */
export const calculateWeakItems = (progresses: ItemProgress[]): ItemProgress[] =>
  progresses
    .filter((p) => atLeast(p.masteryState, 'initial') && !atLeast(p.masteryState, 'used_independently'))
    .sort((a, b) => (b.failedReviews - a.failedReviews) || (rank(a.masteryState) - rank(b.masteryState)));

/** 次の新規ミッション:
 *  管理者指定 > 未学習の最小(week,order) を返す。requiredPreviousItems を満たすもののみ。 */
export const selectNextMission = (learner: Learner, progresses: ItemProgress[]): Mission | null => {
  const stateOf = (id: string) => progresses.find((p) => p.itemId === id)?.masteryState;
  const learned = (id: string) => stateOf(id) !== undefined;

  if (learner.adminOverrides.nextMissionId) {
    const forced = missionById(learner.adminOverrides.nextMissionId);
    if (forced) return forced;
  }
  const ordered = [...COURSE_MISSIONS]
    .filter((m) => m.isPublished)
    .sort((a, b) => a.week - b.week || a.order - b.order);

  for (const m of ordered) {
    if (learned(m.id)) continue;
    const prereqOk = m.requiredPreviousItems.every((req) => learned(req));
    if (prereqOk) return m;
  }
  // 全て学習済みなら未定着のうち最初のものを再提示
  const notRetained = ordered.find((m) => !isRetained(stateOf(m.id) ?? 'initial'));
  return notRetained ?? null;
};

/** 今日のレッスンプラン: 復習1（あれば）＋メイン（新規 or 期日復習）。3〜4分に収めるため詰め込まない。 */
export const buildLessonPlan = (
  learner: Learner,
  progresses: ItemProgress[],
  now = new Date(),
): LessonPlan | null => {
  const dueReviews = selectDueReviews(progresses, now);
  const weak = calculateWeakItems(progresses);
  const nextNew = selectNextMission(learner, progresses);

  // 7日後・30日後復習と週間総合実践は、答え（表現名）を先に見せず自由会話で使わせる
  const HIDE_TARGET_KINDS: LessonKind[] = ['review_day7', 'review_day30', 'weekly_practice'];

  const stepFor = (mission: Mission, kind: LessonKind): LessonPlanStep => ({
    mission,
    kind,
    hideTarget: HIDE_TARGET_KINDS.includes(kind),
    ...(kind === 'weekly_practice'
      ? { weeklyTargets: selectWeeklyPracticeItems(mission.week, progresses) }
      : {}),
  });

  /** 新規枠のミッションは、週の5番目なら週間総合実践として扱う */
  const newStepFor = (mission: Mission): LessonPlanStep =>
    stepFor(mission, isWeeklyMission(mission) ? 'weekly_practice' : 'new');

  // 優先度1: 期限超過復習がある → それをメインに、別の復習をウォームアップに
  const overdue = dueReviews.filter((d) => d.overdue);
  if (overdue.length > 0) {
    const main = overdue[0];
    const warm = dueReviews.find((d) => d.mission.id !== main.mission.id) ?? null;
    return {
      review: warm ? stepFor(warm.mission, warm.kind) : null,
      main: stepFor(main.mission, main.kind),
      reasonKey: 'overdue_review',
    };
  }

  // 優先度2-3: 当日予定の復習があり、新規もある → 復習をウォームアップ＋新規をメイン（バランス）
  if (dueReviews.length > 0 && nextNew) {
    return {
      review: stepFor(dueReviews[0].mission, dueReviews[0].kind),
      main: newStepFor(nextNew),
      reasonKey: 'due_review_plus_new',
    };
  }
  // 当日復習のみ（新規が尽きている）
  if (dueReviews.length > 0) {
    const main = dueReviews[0];
    const warm = dueReviews.find((d) => d.mission.id !== main.mission.id) ?? null;
    return {
      review: warm ? stepFor(warm.mission, warm.kind) : null,
      main: stepFor(main.mission, main.kind),
      reasonKey: 'due_review',
    };
  }

  // 優先度4: 前回うまく言えなかった弱点があり、新規もある → 弱点をウォームアップ＋新規
  if (weak.length > 0 && nextNew) {
    const weakMission = missionById(weak[0].itemId);
    return {
      review: weakMission ? stepFor(weakMission, 'extra') : null,
      main: newStepFor(nextNew),
      reasonKey: 'weak_plus_new',
    };
  }

  // 優先度5: 通常の新規
  if (nextNew) {
    return { review: null, main: newStepFor(nextNew), reasonKey: 'next_new' };
  }

  // 優先度6: 弱点補強のみ
  if (weak.length > 0) {
    const weakMission = missionById(weak[0].itemId);
    if (weakMission) return { review: null, main: stepFor(weakMission, 'extra'), reasonKey: 'weak_item' };
  }
  return null;
};

// ── 状態更新 ──

/** レッスン/復習の結果 */
export interface LessonResult {
  kind: LessonKind;
  /** 目標表現を使えたか（self=自力 / hint=ヒントあり / none=未使用） */
  usage: 'self' | 'hint' | 'none';
  succeeded: boolean; // 復習の場合、成功したか
}

/** 新規学習時の到達状態 */
const stateFromNewUsage = (usage: LessonResult['usage']): CourseMasteryState => {
  switch (usage) {
    case 'self': return 'used_independently';
    case 'hint': return 'used_with_hint';
    case 'none': return 'understood';
  }
};

/** 復習成功時に進む状態 */
const nextReviewState: Record<'day1' | 'day3' | 'day7' | 'day30' | 'extra', CourseMasteryState> = {
  day1: 'reviewed_day1',
  day3: 'reviewed_day3',
  day7: 'retained_day7',
  day30: 'retained_day30',
  extra: 'used_independently',
};

/** 状態を昇格（候補が現在より下なら維持＝降格しない） */
const promote = (current: CourseMasteryState, candidate: CourseMasteryState): CourseMasteryState =>
  rank(candidate) > rank(current) ? candidate : current;

/**
 * レッスン結果で ItemProgress を更新して返す（純関数）。
 * - 新規: usage に応じて understood/used_with_hint/used_independently へ
 * - 復習成功: 次の定着状態へ昇格し、次の復習日を設定
 * - 復習失敗: 昇格させず、失敗回数を増やし、翌日(extra)へ再設定
 */
export const updateMasteryState = (
  prev: ItemProgress | null,
  itemId: string,
  result: LessonResult,
  now = new Date(),
  /**
   * コース終了日（YYYY-MM-DD）。30日後復習がこの日を越える項目には予約しない
   * （3か月コース内で実施できない復習を表示しないため）。null なら制限しない。
   */
  courseEndISO: string | null = null,
): ItemProgress => {
  const today = todayISO(now);
  const nowISO = now.toISOString();
  const base: ItemProgress = prev ?? {
    itemId,
    masteryState: 'initial',
    masteryScore: 0,
    firstLearnedAt: nowISO,
    lastPracticedAt: nowISO,
    nextReviewAt: null,
    reviewStage: 'none',
    successfulReviews: 0,
    failedReviews: 0,
  };

  const isReview = result.kind.startsWith('review') || result.kind === 'extra';

  if (!isReview) {
    // 新規学習: 状態を昇格し、翌日復習をセット
    const target = stateFromNewUsage(result.usage);
    return {
      ...base,
      masteryState: promote(base.masteryState, target),
      lastPracticedAt: nowISO,
      nextReviewAt: addDays(today, REVIEW_INTERVALS.day1),
      reviewStage: 'day1',
      firstLearnedAt: prev ? base.firstLearnedAt : nowISO,
    };
  }

  // 復習
  const stageKey = (result.kind === 'review_day1' ? 'day1'
    : result.kind === 'review_day3' ? 'day3'
      : result.kind === 'review_day7' ? 'day7'
        : result.kind === 'review_day30' ? 'day30'
          : 'extra') as 'day1' | 'day3' | 'day7' | 'day30' | 'extra';

  if (!result.succeeded) {
    // 失敗: 昇格させず、2日後(extra)に再設定
    return {
      ...base,
      lastPracticedAt: nowISO,
      failedReviews: base.failedReviews + 1,
      nextReviewAt: addDays(today, REVIEW_INTERVALS.extra),
      reviewStage: 'extra',
    };
  }

  // 成功: 次の定着状態へ、次の復習日を設定
  const newState = promote(base.masteryState, nextReviewState[stageKey]);

  // day30 成功でこの項目の復習は完了。以降は予約しない
  if (stageKey === 'day30') {
    return {
      ...base,
      masteryState: newState,
      lastPracticedAt: nowISO,
      successfulReviews: base.successfulReviews + 1,
      nextReviewAt: null,
      reviewStage: 'none',
    };
  }

  const nextStage: ReviewStage =
    stageKey === 'day1' ? 'day3'
      : stageKey === 'day3' ? 'day7'
        : stageKey === 'day7' ? 'day30' : 'day7';
  const nextInterval =
    nextStage === 'day3' ? REVIEW_INTERVALS.day3
      : nextStage === 'day7' ? REVIEW_INTERVALS.day7
        : REVIEW_INTERVALS.day30;
  const nextDate = addDays(today, nextInterval);

  // 30日後復習がコース期間を越える項目には予約しない（実施できない復習を出さない）
  if (nextStage === 'day30' && courseEndISO && nextDate > courseEndISO) {
    return {
      ...base,
      masteryState: newState,
      lastPracticedAt: nowISO,
      successfulReviews: base.successfulReviews + 1,
      nextReviewAt: null,
      reviewStage: 'none',
    };
  }

  return {
    ...base,
    masteryState: newState,
    lastPracticedAt: nowISO,
    successfulReviews: base.successfulReviews + 1,
    nextReviewAt: nextDate,
    reviewStage: nextStage,
  };
};

/** learner の開始日から、コース終了日（YYYY-MM-DD）を求める */
export const courseEndDateISO = (learner: Learner): string | null => {
  if (!learner.startedAtISO) return null;
  const start = new Date(learner.startedAtISO);
  if (Number.isNaN(start.getTime())) return null;
  return addDays(todayISO(start), COURSE_TOTAL_DAYS);
};

/**
 * 難易度調整（直近セッションの自力成功率で±1）。
 * - 直近 window 件の自力成功率が upSelfRate 以上が minConsistent 回続けば +1
 * - downSelfRate 未満が minConsistent 回続けば -1
 * - 1回だけの失敗では下げない
 */
export const adjustDifficulty = (
  current: number,
  recentSessions: CourseSessionRecord[],
): { level: number; changed: boolean; direction: 'up' | 'down' | 'none' } => {
  const news = recentSessions
    .filter((s) => s.completionStatus === 'completed' && s.lessonKind === 'new')
    .slice(0, DIFFICULTY_ADJUST.window);
  if (news.length < DIFFICULTY_ADJUST.minConsistent) {
    return { level: current, changed: false, direction: 'none' };
  }
  const window = news.slice(0, DIFFICULTY_ADJUST.minConsistent);
  const allUp = window.every((s) => s.targetUsed && s.targetUsedIndependently);
  const allDown = window.every((s) => !s.targetUsedIndependently);

  if (allUp && current < 5) return { level: current + 1, changed: true, direction: 'up' };
  if (allDown && current > 1) return { level: current - 1, changed: true, direction: 'down' };
  return { level: current, changed: false, direction: 'none' };
};
