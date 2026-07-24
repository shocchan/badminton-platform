// 学習記録を「復習へつなげる」ための計画層（純関数・UI非依存）。
// 既存データ（ItemProgress の nextReviewAt / mastery、CourseSessionRecord の usage フラグ、
// learner.settings.practiceAgainIds）だけから、今日の復習・分類・優先度を計算する。
// 新規DBテーブルは追加しない。

import { COURSE_MISSIONS } from './courseData';
import { atLeast, isReviewKind } from './courseEngine';
import type { CourseMasteryState, CourseSessionRecord, ItemProgress } from './types';

export type ReviewReason = 'overdue' | 'due' | 'practiceAgain' | 'hint' | 'notIndependent' | 'recent';
export type ReviewUsage = 'self' | 'hint' | 'none';

export interface ReviewItem {
  missionId: string;
  targetExpression: string;
  themeJa: string;
  themeZh: string;
  /** この表現の最新の完了セッション（復習ノートを開く先）。無ければ null */
  sessionId: string | null;
  dateISO: string | null;
  nextReviewISO: string | null;
  masteryState: CourseMasteryState;
  usage: ReviewUsage;
  reasons: ReviewReason[];
  priority: number; // 大きいほど優先
}

export interface ReviewPlan {
  today: ReviewItem[];        // 今日復習する（期限到来＋高優先）
  waiting: ReviewItem[];      // 復習待ち（未来の予定）
  recent: ReviewItem[];       // 最近学んだ
  practiceAgain: ReviewItem[]; // 本人が「もう一度」を選択
  all: ReviewItem[];          // すべての記録（完了セッション、新しい順）
  /** 今日の復習の所要時間の目安（分） */
  estMinutes: number;
}

const todayISO = (now: Date): string =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const usageOf = (s: CourseSessionRecord | undefined): ReviewUsage =>
  !s ? 'none' : s.targetUsedIndependently ? 'self' : s.targetUsed ? 'hint' : 'none';

/** missionId → 最新の完了セッション */
const latestSessionByMission = (sessions: CourseSessionRecord[]): Map<string, CourseSessionRecord> => {
  const map = new Map<string, CourseSessionRecord>();
  // sessions は新しい順の想定。古い順でも「より新しい startedAt」を優先する
  for (const s of sessions) {
    if (s.completionStatus !== 'completed') continue;
    const cur = map.get(s.missionId);
    if (!cur || s.startedAt > cur.startedAt) map.set(s.missionId, s);
  }
  return map;
};

const REASON_WEIGHT: Record<ReviewReason, number> = {
  overdue: 100, due: 60, practiceAgain: 50, notIndependent: 30, hint: 20, recent: 5,
};

/**
 * 学習記録から復習計画を作る。
 * - today: nextReviewAt <= today の期限到来（overdue/due）＋ ヒント多用/自力未達 の高優先を補充
 * - 同じ missionId は重複表示しない（最優先の理由に集約）
 */
export const buildReviewPlan = (
  progresses: ItemProgress[],
  sessions: CourseSessionRecord[],
  practiceAgainIds: string[] = [],
  now: Date = new Date(),
): ReviewPlan => {
  const today = todayISO(now);
  const byMission = latestSessionByMission(sessions);
  const againSet = new Set(practiceAgainIds);

  const itemFor = (p: ItemProgress): ReviewItem | null => {
    const mission = COURSE_MISSIONS.find((m) => m.id === p.itemId);
    if (!mission) return null;
    const s = byMission.get(p.itemId);
    const usage = usageOf(s);
    const reasons: ReviewReason[] = [];
    const due = !!p.nextReviewAt && p.reviewStage !== 'none' && p.nextReviewAt <= today;
    if (due && p.nextReviewAt! < today) reasons.push('overdue');
    else if (due) reasons.push('due');
    if (againSet.has(p.itemId)) reasons.push('practiceAgain');
    if (!atLeast(p.masteryState, 'used_independently')) reasons.push('notIndependent');
    if (usage === 'hint') reasons.push('hint');
    if (reasons.length === 0) reasons.push('recent');
    const priority = reasons.reduce((sum, r) => sum + REASON_WEIGHT[r], 0);
    return {
      missionId: p.itemId, targetExpression: mission.targetExpression,
      themeJa: mission.titleJa, themeZh: mission.titleZh,
      sessionId: s?.id ?? null, dateISO: s?.startedAt.slice(0, 10) ?? p.lastPracticedAt.slice(0, 10),
      nextReviewISO: p.nextReviewAt, masteryState: p.masteryState, usage, reasons, priority,
    };
  };

  const items = progresses.map(itemFor).filter((x): x is ReviewItem => x !== null);
  const byPriority = (a: ReviewItem, b: ReviewItem) => b.priority - a.priority
    || (a.nextReviewISO ?? '9999').localeCompare(b.nextReviewISO ?? '9999');

  const isDue = (it: ReviewItem) => it.reasons.includes('overdue') || it.reasons.includes('due');

  // today: 期限到来を最優先に、無ければ「もう一度」「自力未達」「ヒント」を補充（重複なし）
  const dueItems = items.filter(isDue).sort(byPriority);
  const boostItems = items
    .filter((it) => !isDue(it) && (it.reasons.includes('practiceAgain') || it.reasons.includes('notIndependent') || it.reasons.includes('hint')))
    .sort(byPriority);
  const todayItems = [...dueItems, ...boostItems].slice(0, 8);

  const waiting = items
    .filter((it) => !isDue(it) && it.nextReviewISO && it.nextReviewISO > today)
    .sort((a, b) => (a.nextReviewISO ?? '').localeCompare(b.nextReviewISO ?? ''));

  const recent = [...items]
    .sort((a, b) => (b.dateISO ?? '').localeCompare(a.dateISO ?? ''))
    .slice(0, 12);

  const practiceAgain = items.filter((it) => it.reasons.includes('practiceAgain')).sort(byPriority);

  // すべての記録: 完了セッションを新しい順（セッション単位。表現重複は許容）
  const all: ReviewItem[] = sessions
    .filter((s) => s.completionStatus === 'completed')
    .map((s): ReviewItem | null => {
      const mission = COURSE_MISSIONS.find((m) => m.id === s.missionId);
      const p = progresses.find((x) => x.itemId === s.missionId);
      if (!mission) return null;
      return {
        missionId: s.missionId, targetExpression: s.targetExpression || mission.targetExpression,
        themeJa: mission.titleJa, themeZh: mission.titleZh, sessionId: s.id, dateISO: s.startedAt.slice(0, 10),
        nextReviewISO: p?.nextReviewAt ?? null, masteryState: p?.masteryState ?? 'initial',
        usage: usageOf(s), reasons: [isReviewKind(s.lessonKind) ? 'due' : 'recent'], priority: 0,
      };
    })
    .filter((x): x is ReviewItem => x !== null);

  const estMinutes = todayItems.length === 0 ? 0 : Math.max(1, Math.round(todayItems.length * 0.7));

  return { today: todayItems, waiting, recent, practiceAgain, all, estMinutes };
};
