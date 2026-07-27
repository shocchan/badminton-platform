// Phase 2E-1.14 §5: 部分成功Recoveryの判定。
// 「どこまで成功したか」を保存済みの事実だけから決め、学習をやり直させないことを担保する。
import { describe, it, expect } from 'vitest';
import { planJourneyRepair, resolveSnapshot } from './journeyRecovery';
import type { JourneyTaskContract, JourneyResultSnapshot } from './journeyTaskContract';

const snapshot: JourneyResultSnapshot = {
  checkedCount: 3, independentCount: 2, supportedCount: 0, needsReviewCount: 1, partial: false,
};

const contract = (over: Partial<JourneyTaskContract> = {}): JourneyTaskContract => ({
  schemaVersion: 2,
  journeyId: 'j1',
  activeTaskType: 'practice',
  activeTaskId: 'practice-1',
  activeTaskStatus: 'in_progress',
  taskStartedAt: '2026-07-28T00:00:00.000Z',
  taskCompletedAt: null,
  returnStep: 'done',
  completionToken: 'tok-1',
  usedTokens: [],
  completedTaskIds: [],
  completionSnapshot: null,
  ...over,
});

const input = (over: Partial<Parameters<typeof planJourneyRepair>[0]> = {}) => ({
  contract: contract(),
  step: 'practice' as const,
  journeyCompleted: false,
  currentView: 'daily',
  hasLearningResult: false,
  ...over,
});

describe('planJourneyRepair', () => {
  it('契約が無ければ何もしない', () => {
    expect(planJourneyRepair(input({ contract: null })).kind).toBe('none');
  });

  it('Journeyが完了済みなら触れない（完了を作り直さない）', () => {
    const plan = planJourneyRepair(input({
      journeyCompleted: true,
      contract: contract({ activeTaskStatus: 'completed', completedTaskIds: ['practice-1'], completionSnapshot: snapshot }),
    }));
    expect(plan.kind).toBe('none');
  });

  it('契約completed・stepが前 → stepだけ直し、tokenを再消費しない', () => {
    const plan = planJourneyRepair(input({
      step: 'practice',
      contract: contract({ activeTaskStatus: 'completed', completedTaskIds: ['practice-1'], completionSnapshot: snapshot }),
    }));
    expect(plan.kind).toBe('step_behind');
    expect(plan.setStep).toBe('done');
    expect(plan.retryContractCompletion).toBe(false);
  });

  it('診断の契約なら戻り先はStep3（practice）', () => {
    const plan = planJourneyRepair(input({
      step: 'check',
      contract: contract({
        activeTaskType: 'diagnostic', activeTaskId: 'diag-1', returnStep: 'practice',
        activeTaskStatus: 'completed', completedTaskIds: ['diag-1'], completionSnapshot: snapshot,
      }),
    }));
    expect(plan.setStep).toBe('practice');
  });

  it('契約completed・step正しい・画面だけ前 → 表示するだけで完了処理を再実行しない', () => {
    const plan = planJourneyRepair(input({
      step: 'done', currentView: 'daily',
      contract: contract({ activeTaskStatus: 'completed', completedTaskIds: ['practice-1'], completionSnapshot: snapshot }),
    }));
    expect(plan.kind).toBe('view_behind');
    expect(plan.showView).toBe('firstrun');
    expect(plan.retryContractCompletion).toBe(false);
  });

  it('契約completed・結果が無い → 欠損として扱い、0と断定しない', () => {
    const plan = planJourneyRepair(input({
      step: 'done', currentView: 'firstrun',
      contract: contract({ activeTaskStatus: 'completed', completedTaskIds: ['practice-1'], completionSnapshot: null }),
    }));
    expect(plan.kind).toBe('snapshot_missing');
    expect(plan.snapshotMissing).toBe(true);
    expect(plan.retryContractCompletion).toBe(false);
  });

  it('学習は終わっているのに契約未完了 → 契約完了だけ再試行する（学習はやり直させない）', () => {
    const plan = planJourneyRepair(input({ hasLearningResult: true }));
    expect(plan.kind).toBe('contract_pending');
    expect(plan.retryContractCompletion).toBe(true);
    expect(plan.setStep).toBeNull();
  });

  it('学習途中（結果なし・契約in_progress）は修復対象にしない', () => {
    expect(planJourneyRepair(input({ hasLearningResult: false })).kind).toBe('none');
  });

  it('completedTaskIdsに入っていれば status が古くても完了として扱う', () => {
    const plan = planJourneyRepair(input({
      step: 'practice',
      contract: contract({ activeTaskStatus: 'in_progress', completedTaskIds: ['practice-1'], completionSnapshot: snapshot }),
    }));
    expect(plan.kind).toBe('step_behind');
  });

  it('同じ入力なら必ず同じ計画になる（決定的）', () => {
    const i = input({ hasLearningResult: true });
    expect(planJourneyRepair(i)).toEqual(planJourneyRepair(i));
  });
});

describe('resolveSnapshot', () => {
  it('保存済みの結果があればそのまま使う', () => {
    expect(resolveSnapshot(snapshot, null)).toEqual(snapshot);
  });

  it('再導出できた場合は partial を立てて、作り直しであることを隠さない', () => {
    const r = resolveSnapshot(null, { ...snapshot, partial: false });
    expect(r.checkedCount).toBe(3);
    expect(r.partial).toBe(true);
  });

  it('再導出できない場合は 0 と断定せず null のままにする', () => {
    const r = resolveSnapshot(null, null);
    expect(r.checkedCount).toBeNull();
    expect(r.independentCount).toBeNull();
    expect(r.supportedCount).toBeNull();
    expect(r.needsReviewCount).toBeNull();
    expect(r.partial).toBe(true);
  });
});
