export interface Milestone {
  count: number;
  label: string;
  tier: 'small' | 'big';
}

export const SHUTTLE_MILESTONES: Milestone[] = [
  { count: 50, label: '50個達成', tier: 'small' },
  { count: 100, label: '100個達成', tier: 'small' },
  { count: 300, label: '300個達成', tier: 'big' },
  { count: 500, label: '500個達成', tier: 'big' },
  { count: 1000, label: '1000個突破', tier: 'big' },
];

export function getNextMilestone(total: number): Milestone | null {
  return SHUTTLE_MILESTONES.find((m) => m.count > total) ?? null;
}

export function getCurrentMilestone(total: number): Milestone | null {
  const reached = SHUTTLE_MILESTONES.filter((m) => m.count <= total);
  return reached.length ? reached[reached.length - 1] : null;
}
