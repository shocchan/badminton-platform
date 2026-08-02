// 進捗の集計・統計（純関数）。ホーム/ロードマップ/管理ビュー/コスト計算で共用。

import { COURSE_MISSIONS, COURSE_WEEKS } from './courseMissionIndex.generated';
import { COURSE_MASTERY_WEIGHTS, REALTIME_COST, RETAINED_STATES } from './courseConfig';
import { atLeast, isRetained } from './courseEngine';
import type { CourseSessionRecord, ItemProgress } from './types';

const todayISO = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 連続学習日数（セッションの日付から算出） */
export const calcStreak = (sessionDates: string[], now = new Date()): number => {
  const days = new Set(sessionDates.map((s) => s.slice(0, 10)));
  let streak = 0;
  const cur = new Date(now);
  // 今日やっていなくても、昨日まで続いていれば継続とみなす（今日ぶんは未実施でも維持）
  if (!days.has(todayISO(cur))) cur.setDate(cur.getDate() - 1);
  for (;;) {
    if (days.has(todayISO(cur))) { streak += 1; cur.setDate(cur.getDate() - 1); } else break;
  }
  return streak;
};

/** 今週（月曜始まり）のセッション数 */
export const sessionsThisWeek = (sessionDates: string[], now = new Date()): number => {
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return sessionDates.filter((s) => new Date(s) >= monday).length;
};

export interface WeekStat {
  week: number;
  themeJa: string;
  themeZh: string;
  total: number;
  learned: number;   // 学習開始以上
  retained: number;  // 定着
  reviewing: number; // 復習中（学習済みだが未定着）
  weakLabels: string[];
  state: 'locked' | 'notStarted' | 'inProgress' | 'learned' | 'reviewing' | 'retained';
}

/** 週ごとの状態（ロードマップ用）。前週を1つも学習していない週はロック */
export const weekStats = (progresses: ItemProgress[]): WeekStat[] => {
  const stateOf = (id: string) => progresses.find((p) => p.itemId === id)?.masteryState;
  const stats: WeekStat[] = [];
  for (const w of COURSE_WEEKS) {
    const missions = COURSE_MISSIONS.filter((m) => m.week === w.week);
    let learned = 0, retained = 0, reviewing = 0;
    const weakLabels: string[] = [];
    for (const m of missions) {
      const s = stateOf(m.id);
      if (!s) continue;
      learned += 1;
      if (isRetained(s)) retained += 1;
      else {
        reviewing += 1;
        if (!atLeast(s, 'used_independently')) weakLabels.push(m.targetExpression);
      }
    }
    stats.push({
      week: w.week, themeJa: w.themeJa, themeZh: w.themeZh, total: missions.length,
      learned, retained, reviewing, weakLabels, state: 'notStarted',
    });
  }
  // 状態判定（前週に学習実績がなければロック。ただしWeek1は常に開放）
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const prevLearned = i === 0 ? true : stats[i - 1].learned > 0;
    if (s.learned === 0) { s.state = prevLearned ? 'notStarted' : 'locked'; continue; }
    if (s.retained === s.total) s.state = 'retained';
    else if (s.learned === s.total && s.reviewing > 0) s.state = 'reviewing';
    else if (s.learned === s.total) s.state = 'learned';
    else s.state = 'inProgress';
  }
  return stats;
};

export interface LearnerStats {
  totalSessions: number;
  weekSessions: number;
  streak: number;
  learnedCount: number;
  retainedCount: number;
  overdueReviews: number;
  selfRate: number;      // 自力使用率（完了セッション中）
  hintRate: number;
  zhRate: number;
  errorCount: number;
  interruptedCount: number;
  lastActiveISO: string | null;
}

export const learnerStats = (
  sessions: CourseSessionRecord[],
  progresses: ItemProgress[],
  now = new Date(),
): LearnerStats => {
  const completed = sessions.filter((s) => s.completionStatus === 'completed');
  const dates = sessions.map((s) => s.startedAt);
  const today = todayISO(now);
  return {
    totalSessions: sessions.length,
    weekSessions: sessionsThisWeek(dates, now),
    streak: calcStreak(dates, now),
    learnedCount: progresses.filter((p) => atLeast(p.masteryState, 'initial')).length,
    retainedCount: progresses.filter((p) => RETAINED_STATES.includes(p.masteryState)).length,
    overdueReviews: progresses.filter((p) => p.nextReviewAt && p.nextReviewAt < today && p.reviewStage !== 'none').length,
    selfRate: completed.length ? completed.filter((s) => s.targetUsedIndependently).length / completed.length : 0,
    hintRate: completed.length ? completed.filter((s) => s.targetUsed && !s.targetUsedIndependently).length / completed.length : 0,
    zhRate: completed.length ? completed.filter((s) => s.chineseSupportUsed).length / completed.length : 0,
    errorCount: sessions.filter((s) => s.completionStatus === 'error').length,
    interruptedCount: sessions.filter((s) => s.completionStatus === 'interrupted').length,
    lastActiveISO: sessions[0]?.startedAt ?? null,
  };
};

/** 全体進捗率（定着度で重み付け。全60項目に対する割合） */
export const overallProgress = (progresses: ItemProgress[]): number => {
  const total = COURSE_MISSIONS.length;
  const sum = progresses.reduce((acc, p) => acc + (COURSE_MASTERY_WEIGHTS[p.masteryState] ?? 0), 0);
  return total > 0 ? sum / total : 0;
};

/** 3〜4分レッスンの概算コスト（USD）。実測で REALTIME_COST を調整 */
export const estimateSessionCost = (durationSeconds: number): number => {
  const minutes = Math.max(durationSeconds, 0) / 60;
  const inTok = minutes * REALTIME_COST.approxInputTokensPerMin;
  const outTok = minutes * REALTIME_COST.approxOutputTokensPerMin;
  return (inTok * REALTIME_COST.inputPerMillion + outTok * REALTIME_COST.outputPerMillion) / 1_000_000;
};
