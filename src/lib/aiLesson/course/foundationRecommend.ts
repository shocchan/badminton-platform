// しくみラボ「今日」の決定的推薦（Phase 2B §20・LLM/架空AI分析なし）
import type { FoundationUnitMeta } from './foundationRegistry';
import type { FoundationUnitSummary } from './foundationProgress';

export interface TodayRecommendation {
  kind: 'review_due' | 'resume_unit' | 'next_unit' | 'first_unit' | 'all_done_review';
  unitId: string | null;
  dueCount: number;
  estimatedMinutes: number;
}

const SECONDS_PER_REVIEW_QUESTION = 40; // 固定値（架空の個人化をしない）

export const recommendToday = (
  meta: FoundationUnitMeta[],
  summaries: Record<string, FoundationUnitSummary>,
  dueCount: number,
): TodayRecommendation => {
  // 1. due復習が最優先
  if (dueCount > 0) return { kind: 'review_due', unitId: null, dueCount, estimatedMinutes: Math.max(1, Math.ceil((dueCount * SECONDS_PER_REVIEW_QUESTION) / 60)) };
  // 2. 途中の単元
  const inProgress = meta.find((m) => summaries[m.id]?.inProgress);
  if (inProgress) return { kind: 'resume_unit', unitId: inProgress.id, dueCount, estimatedMinutes: inProgress.estimatedMinutes };
  const done = (id: string) => (summaries[id]?.completedCount ?? 0) > 0;
  // 3. 前提を満たした未着手単元（メタ定義順）
  const ready = meta.find((m) => !done(m.id) && m.prerequisiteUnitIds.every(done));
  if (ready) {
    const anyDone = meta.some((m) => done(m.id));
    return { kind: anyDone ? 'next_unit' : 'first_unit', unitId: ready.id, dueCount, estimatedMinutes: ready.estimatedMinutes };
  }
  // 4. 前提未達でも未着手が残っていれば先頭を案内（ソフト前提・ハードロックしない）
  const untouched = meta.find((m) => !done(m.id));
  if (untouched) return { kind: 'next_unit', unitId: untouched.id, dueCount, estimatedMinutes: untouched.estimatedMinutes };
  // 5. 全単元完了→復習
  return { kind: 'all_done_review', unitId: null, dueCount, estimatedMinutes: 5 };
};
