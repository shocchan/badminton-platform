// XPルールとゲージ計算
// 設計方針: 時間経過では増えず、「自力使用」「復習成功」を最も高く評価する。

import type { ExpressionRecord, ProgressState, SessionRecord } from './types';

export const XP_RULES = {
  lessonComplete: 10,
  newExpression: 5,
  hintUse: 8,
  selfUse: 12,
  reviewSuccess: 10,
  streakBonusMax: 5,
} as const;

export interface XpResult {
  earned: number;
  breakdown: { key: string; count: number; xp: number }[];
}

/** レッスン1回分のXPを計算する */
export const calcSessionXp = (
  expressions: ExpressionRecord[],
  lessonCompleted: boolean,
  streakDays: number,
  reviewSuccessCount = 0,
): XpResult => {
  const learned = expressions.filter((e) => e.usage === 'learned').length;
  const hintUsed = expressions.filter((e) => e.usage === 'hint').length;
  const selfUsed = expressions.filter((e) => e.usage === 'self').length;
  const streakBonus = Math.min(Math.max(streakDays - 1, 0), XP_RULES.streakBonusMax);

  const breakdown = [
    { key: 'lessonComplete', count: lessonCompleted ? 1 : 0, xp: lessonCompleted ? XP_RULES.lessonComplete : 0 },
    { key: 'newExpression', count: learned, xp: learned * XP_RULES.newExpression },
    { key: 'hintUse', count: hintUsed, xp: hintUsed * XP_RULES.hintUse },
    { key: 'selfUse', count: selfUsed, xp: selfUsed * XP_RULES.selfUse },
    { key: 'reviewSuccess', count: reviewSuccessCount, xp: reviewSuccessCount * XP_RULES.reviewSuccess },
    { key: 'streakBonus', count: streakBonus > 0 ? 1 : 0, xp: streakBonus },
  ].filter((b) => b.xp > 0);

  return { earned: breakdown.reduce((sum, b) => sum + b.xp, 0), breakdown };
};

/** 今日のレッスンを反映した新しい連続日数を返す */
export const nextStreak = (progress: ProgressState, todayISO: string): number => {
  if (progress.lastLessonDateISO === todayISO) return Math.max(progress.streakDays, 1);
  if (!progress.lastLessonDateISO) return 1;
  const last = new Date(progress.lastLessonDateISO + 'T00:00:00');
  const today = new Date(todayISO + 'T00:00:00');
  const diffDays = Math.round((today.getTime() - last.getTime()) / 86400000);
  return diffDays === 1 ? progress.streakDays + 1 : 1;
};

export interface Gauges {
  /** 習慣: 連続日数 / 7日 */
  habit: number;
  /** 成長: 現レベル内のXP進捗（100XPごとにレベルアップ） */
  growth: number;
  growthLevel: number;
  /** 定着: 学んだ表現のうち自力で使えた割合 */
  retention: number;
}

export const calcGauges = (progress: ProgressState): Gauges => {
  const habit = Math.min(progress.streakDays / 7, 1);
  const growthLevel = Math.floor(progress.totalXp / 100) + 1;
  const growth = (progress.totalXp % 100) / 100;
  const retention = progress.totalLearned > 0
    ? Math.min(progress.totalSelfUsed / progress.totalLearned, 1)
    : 0;
  return { habit, growth, growthLevel, retention };
};

/** セッション結果を累積進捗へ反映する */
export const applySessionToProgress = (
  progress: ProgressState,
  session: SessionRecord,
  todayISO: string,
): ProgressState => ({
  totalXp: progress.totalXp + session.earnedXp,
  streakDays: nextStreak(progress, todayISO),
  lastLessonDateISO: todayISO,
  totalLearned: progress.totalLearned + session.expressions.length,
  totalSelfUsed: progress.totalSelfUsed + session.expressions.filter((e) => e.usage === 'self').length,
  totalReviewSuccess: progress.totalReviewSuccess,
});
