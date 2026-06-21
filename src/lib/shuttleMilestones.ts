// 節目の定義。supabase/migrations/20260621_shuttle_counter.sql の
// milestones 配列と必ず同じ値にしておくこと。
// 表示ラベルは src/lib/shuttleCounterI18n.ts の milestoneLabel() で
// 言語ごとに生成する。

export interface Milestone {
  count: number;
  tier: 'small' | 'big';
}

export const SHUTTLE_MILESTONES: Milestone[] = [
  { count: 50, tier: 'small' },
  { count: 100, tier: 'small' },
  { count: 300, tier: 'big' },
  { count: 500, tier: 'big' },
  { count: 1000, tier: 'big' },
];

export function getNextMilestone(total: number): Milestone | null {
  return SHUTTLE_MILESTONES.find((m) => m.count > total) ?? null;
}

export function getCurrentMilestone(total: number): Milestone | null {
  const reached = SHUTTLE_MILESTONES.filter((m) => m.count <= total);
  return reached.length ? reached[reached.length - 1] : null;
}
