// Phase 2E-1.12 §18: Journey往復契約とローカル状態分離のテスト。
// R9（検証操作で学習進捗を消した事故）の再発防止テストを含む。
import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEY_REGISTRY, JOURNEY_RESET_ALLOWLIST, LEARNER_PROGRESS_KEYS,
  safeResetKeys, resetJourneyState, createJourneySandbox,
  JOURNEY_TASK_KEY, JOURNEY_SANDBOX_KEY,
} from './courseStorageRegistry';
import { createJourneyTaskRepository } from './journeyTaskContract';
import { createVocabProgressRepository, VOCAB_STORAGE_KEY } from './vocabProgress';
import { createVocabSpacedReviewRepository, VOCAB_REVIEW_SCHEDULE_KEY } from './vocabSpacedReview';
import { createVocabDecisionRepository, VOCAB_DECISION_LOCAL_KEY } from './vocabDecisionStore';
import { createLearningClock } from './learningClock';
import { FIRST_RUN_STORAGE_KEY } from './firstRunJourney';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    keys: () => [...m.keys()],
    raw: m,
  };
};
const clock = createLearningClock(new Date(2026, 6, 28, 9));
const fixedNow = () => new Date(2026, 6, 28, 9);

describe('Storage key registry（§11）', () => {
  it('全キーが登録され、重複がなく、所有者と影響が明記されている', () => {
    const keys = STORAGE_KEY_REGISTRY.map((k) => k.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of STORAGE_KEY_REGISTRY) {
      expect(k.learnerImpactJa.length).toBeGreaterThan(0);
      expect(['learner_progress', 'learner_journey', 'lab_review', 'lab_ui']).toContain(k.owner);
      expect(['session', 'local']).toContain(k.storage);
    }
  });
  it('学習進捗キーは journeyResettable=false（Journeyのresetで消えない）', () => {
    expect(LEARNER_PROGRESS_KEYS).toContain(VOCAB_STORAGE_KEY);
    expect(LEARNER_PROGRESS_KEYS).toContain(VOCAB_REVIEW_SCHEDULE_KEY);
    for (const k of LEARNER_PROGRESS_KEYS) expect(JOURNEY_RESET_ALLOWLIST).not.toContain(k);
  });
  it('allowlistはJourney用キーだけ（学習進捗・レビュー・判断ドラフトを含まない）', () => {
    expect(JOURNEY_RESET_ALLOWLIST).toEqual(
      expect.arrayContaining([FIRST_RUN_STORAGE_KEY, JOURNEY_TASK_KEY, JOURNEY_SANDBOX_KEY]));
    expect(JOURNEY_RESET_ALLOWLIST).not.toContain(VOCAB_STORAGE_KEY);
    expect(JOURNEY_RESET_ALLOWLIST).not.toContain(VOCAB_REVIEW_SCHEDULE_KEY);
    expect(JOURNEY_RESET_ALLOWLIST).not.toContain(VOCAB_DECISION_LOCAL_KEY);
  });
});

describe('R9 再発防止（§18 Incident Regression）', () => {
  const seedAll = () => {
    const st = mem();
    const progress = createVocabProgressRepository(st);
    const schedule = createVocabSpacedReviewRepository(st, clock);
    const decision = createVocabDecisionRepository(st);
    progress.recordEncounter('fi-sumu');
    schedule.recordResult({ itemId: 'fi-iku', result: 'wrong', source: 'daily' });
    decision.setStatus('fi-namae:example', 'keep_current');
    st.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, step: 'check', goal: 'work' }));
    st.setItem(JOURNEY_TASK_KEY, JSON.stringify({ schemaVersion: 1, journeyId: 'j1' }));
    st.setItem('unrelated_app_key', 'keep me');
    return { st, progress, schedule, decision };
  };
  it('onboarding reset never deletes vocabulary progress', () => {
    const { st, progress } = seedAll();
    resetJourneyState(st);
    expect(st.getItem(VOCAB_STORAGE_KEY)).toBeTruthy();
    expect(progress.getStats().seenCount).toBeGreaterThan(0);
  });
  it('onboarding reset never deletes review schedule', () => {
    const { st, schedule } = seedAll();
    resetJourneyState(st);
    expect(st.getItem(VOCAB_REVIEW_SCHEDULE_KEY)).toBeTruthy();
    expect(schedule.getAll().length).toBe(1);
  });
  it('onboarding resetはJourneyキーだけを消し、レビュー・判断・無関係キーを残す', () => {
    const { st } = seedAll();
    const res = resetJourneyState(st);
    expect(res.removed).toEqual(expect.arrayContaining([FIRST_RUN_STORAGE_KEY, JOURNEY_TASK_KEY]));
    expect(res.refused).toEqual([]);
    expect(st.getItem(VOCAB_DECISION_LOCAL_KEY)).toBeTruthy();
    expect(st.getItem('unrelated_app_key')).toBe('keep me');
  });
  it('allowlist外のキー削除は拒否される（部分一致・全消去の代わりに明示拒否）', () => {
    const { st } = seedAll();
    const res = safeResetKeys(st, [VOCAB_STORAGE_KEY, VOCAB_REVIEW_SCHEDULE_KEY, 'unrelated_app_key']);
    expect(res.removed).toEqual([]);
    expect(res.refused.length).toBe(3);
    expect(st.getItem(VOCAB_STORAGE_KEY)).toBeTruthy();
  });
  it('preview journey uses isolated namespace（通常キーを読まない・書かない）', () => {
    const { st } = seedAll();
    const before = st.keys().sort();
    const sandbox = createJourneySandbox(st);
    // sandbox内で初回Journeyを進めても通常キーは変わらない
    sandbox.storage.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, step: 'done' }));
    expect(JSON.parse(st.getItem(FIRST_RUN_STORAGE_KEY)!).step).toBe('check');   // 通常側は元のまま
    expect(sandbox.storage.getItem(VOCAB_STORAGE_KEY)).toBeNull();               // 通常進捗を読まない
    // 終了時はsandboxキーだけ消える
    const res = sandbox.end();
    expect(res.removed).toEqual([JOURNEY_SANDBOX_KEY]);
    expect(st.keys().sort()).toEqual(before);
  });
  it('no storage clear operations（registry経由の削除しか行わない）', () => {
    const st = mem();
    // clear相当のAPIを持たないStorageLikeで動作する＝clearを使っていない
    expect(Object.keys(st)).not.toContain('clear');
    expect(() => resetJourneyState(st)).not.toThrow();
  });
});

describe('Journey Task Contract（§4-§5）', () => {
  const setup = () => {
    const st = mem();
    let n = 0;
    const repo = createJourneyTaskRepository(st, fixedNow, () => `tok${++n}`);
    return { st, repo };
  };
  const snap = { checkedCount: 3, independentCount: 2, supportedCount: 0, needsReviewCount: 1, partial: false };

  it('タスク開始で使い捨てトークンを発行し、正しい組み合わせでのみ完了できる', () => {
    const { repo } = setup();
    const c = repo.startTask({ journeyId: 'j1', taskType: 'diagnostic', taskId: 'd1', returnStep: 'practice' });
    expect(c.activeTaskStatus).toBe('in_progress');
    const ok = repo.completeTask({ journeyId: 'j1', taskId: 'd1', token: c.completionToken, snapshot: snap });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.contract.activeTaskStatus).toBe('completed');
      expect(ok.contract.completionSnapshot).toEqual(snap);
    }
  });
  it('journeyId/taskIdが違えば完了しない（URL書換えだけで完了扱いにしない・§5）', () => {
    const { repo } = setup();
    const c = repo.startTask({ journeyId: 'j1', taskType: 'diagnostic', taskId: 'd1', returnStep: 'practice' });
    expect(repo.completeTask({ journeyId: 'other', taskId: 'd1', token: c.completionToken, snapshot: snap }))
      .toMatchObject({ ok: false, reason: 'journey_mismatch' });
    expect(repo.completeTask({ journeyId: 'j1', taskId: 'wrong', token: c.completionToken, snapshot: snap }))
      .toMatchObject({ ok: false, reason: 'task_mismatch' });
    expect(repo.get()!.activeTaskStatus).toBe('in_progress');   // 状態は変わらない
  });
  it('同じトークンの再利用を拒否（browser back・完了画面再表示で二重完了しない・§10）', () => {
    const { repo } = setup();
    const c = repo.startTask({ journeyId: 'j1', taskType: 'practice', taskId: 'p1', returnStep: 'done' });
    expect(repo.completeTask({ journeyId: 'j1', taskId: 'p1', token: c.completionToken, snapshot: snap }).ok).toBe(true);
    const second = repo.completeTask({ journeyId: 'j1', taskId: 'p1', token: c.completionToken, snapshot: snap });
    expect(second).toMatchObject({ ok: false });
    expect(repo.get()!.completedTaskIds).toEqual(['p1']);   // 二重記録しない
  });
  it('中断・失敗は完了にしない／完了済みを中断へ戻さない', () => {
    const { repo } = setup();
    const c = repo.startTask({ journeyId: 'j1', taskType: 'diagnostic', taskId: 'd1', returnStep: 'practice' });
    expect(repo.markInterrupted()!.activeTaskStatus).toBe('interrupted');
    expect(repo.markFailed()!.activeTaskStatus).toBe('failed');
    repo.completeTask({ journeyId: 'j1', taskId: 'd1', token: c.completionToken, snapshot: snap });
    expect(repo.markInterrupted()!.activeTaskStatus).toBe('completed');   // 完了は巻き戻さない
  });
  it('契約がない/別schemaでは完了しない（壊れた状態で完了を偽らない）', () => {
    const { st, repo } = setup();
    expect(repo.completeTask({ journeyId: 'j1', taskId: 'd1', token: 'x', snapshot: snap }))
      .toMatchObject({ ok: false, reason: 'no_contract' });
    st.setItem(JOURNEY_TASK_KEY, JSON.stringify({ schemaVersion: 99, journeyId: 'j1' }));
    expect(repo.get()).toBeNull();
  });
  it('保存に失敗したら完了成功を返さない（§15）', () => {
    const failing = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} };
    const repo = createJourneyTaskRepository(failing, fixedNow, () => 'tok');
    repo.startTask({ journeyId: 'j1', taskType: 'diagnostic', taskId: 'd1', returnStep: 'practice' });
    // 契約自体が保存できていないので完了できない（完了を偽らない）
    expect(repo.completeTask({ journeyId: 'j1', taskId: 'd1', token: 'tok', snapshot: snap }).ok).toBe(false);
  });
  it('結果が一部欠けている場合は0と断定せずpartialで伝える（§8）', () => {
    const { repo } = setup();
    const c = repo.startTask({ journeyId: 'j1', taskType: 'practice', taskId: 'p1', returnStep: 'done' });
    const partialSnap = { checkedCount: 2, independentCount: null, supportedCount: null, needsReviewCount: null, partial: true };
    const r = repo.completeTask({ journeyId: 'j1', taskId: 'p1', token: c.completionToken, snapshot: partialSnap });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.contract.completionSnapshot!.partial).toBe(true);
      expect(r.contract.completionSnapshot!.independentCount).toBeNull();   // 0にしない
    }
  });
});
