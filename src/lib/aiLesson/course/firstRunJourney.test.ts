// Phase 2E-1.11 §16: 初回判定と4ステップJourney状態のテスト。
// returning learnerを初回へ戻さない／壊れた状態でも既存進捗を消さない、を担保する。
import { describe, it, expect } from 'vitest';
import {
  createFirstRunRepository, detectFirstRunState, FIRST_RUN_STORAGE_KEY,
  trackForGoal, stepIndexOf, TOTAL_STEPS, LEARNING_GOALS,
} from './firstRunJourney';
import { createVocabProgressRepository, VOCAB_STORAGE_KEY } from './vocabProgress';
import { createVocabSpacedReviewRepository } from './vocabSpacedReview';
import { createLearningClock } from './learningClock';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    raw: m,
  };
};
const clock = createLearningClock(new Date(2026, 6, 28, 9));
const setup = () => {
  const st = mem();
  const progress = createVocabProgressRepository(st);
  const schedule = createVocabSpacedReviewRepository(st, clock);
  const repo = createFirstRunRepository(st, progress, schedule, () => new Date(2026, 6, 28, 9));
  return { st, progress, schedule, repo };
};

describe('初回判定（§3・6状態を決定的に区別）', () => {
  it('履歴なし＝true_first_run', () => {
    const { repo } = setup();
    expect(repo.load().state).toBe('true_first_run');
  });
  it('学習履歴がある人は初回へ戻さない＝returning_learner', () => {
    const { st, progress, schedule } = setup();
    progress.recordEncounter('fi-sumu');
    expect(detectFirstRunState(st, progress, schedule).state).toBe('returning_learner');
  });
  it('復習予定だけがある人もreturning_learner', () => {
    const { st, progress, schedule } = setup();
    schedule.recordResult({ itemId: 'fi-sumu', result: 'wrong', source: 'daily' });
    expect(detectFirstRunState(st, progress, schedule).state).toBe('returning_learner');
  });
  it('Journey途中＝onboarding_in_progress／完了後＝onboarding_completed', () => {
    const { repo } = setup();
    repo.setGoal('daily_conversation');
    expect(repo.load().state).toBe('onboarding_in_progress');
    repo.completeCheck(); repo.completePractice(); repo.complete();
    expect(repo.load().state).toBe('onboarding_completed');
  });
  it('壊れたJSON＝corrupted_onboarding／別schema＝incompatible_schema', () => {
    const { st, progress, schedule } = setup();
    st.setItem(FIRST_RUN_STORAGE_KEY, '{{{broken');
    expect(detectFirstRunState(st, progress, schedule).state).toBe('corrupted_onboarding');
    st.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, step: 'goal' }));
    expect(detectFirstRunState(st, progress, schedule).state).toBe('incompatible_schema');
    // 不正なstep値も壊れている扱い（推測で直さない）
    st.setItem(FIRST_RUN_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, step: 'unknown-step' }));
    expect(detectFirstRunState(st, progress, schedule).state).toBe('corrupted_onboarding');
  });
  it('判定は決定的（同じ状態から同じ結果）', () => {
    const { st, progress, schedule } = setup();
    progress.recordEncounter('fi-iku');
    expect(detectFirstRunState(st, progress, schedule).state)
      .toBe(detectFirstRunState(st, progress, schedule).state);
  });
});

describe('4ステップJourney（§4-§6）', () => {
  it('目的→短い確認→最初の練習→完了 の順に進む・進捗表示は1/4から4/4', () => {
    const { repo } = setup();
    expect(stepIndexOf('goal')).toBe(1);
    expect(TOTAL_STEPS).toBe(4);
    expect(repo.setGoal('jlpt_n3').step).toBe('check');
    expect(stepIndexOf('check')).toBe(2);
    expect(repo.completeCheck().step).toBe('practice');
    expect(repo.completePractice().step).toBe('done');
    expect(stepIndexOf('done')).toBe(4);
  });
  it('戻っても回答（目的・確認済み）は消えない（§5）', () => {
    const { repo } = setup();
    repo.setGoal('work');
    repo.completeCheck();
    const back = repo.goBack()!;
    expect(back.step).toBe('check');
    expect(back.goal).toBe('work');       // 目的は保持
    expect(back.checkDone).toBe(true);    // 診断の回答済み状態も保持（再採点しない）
  });
  it('完了は複数回記録しない（完了画面の再表示・browser backでも重複しない・§6・§9）', () => {
    const { repo } = setup();
    repo.setGoal('life_in_japan'); repo.completeCheck(); repo.completePractice();
    const first = repo.complete();
    const second = repo.complete();
    expect(second.completedAt).toBe(first.completedAt);
    // 完了後は戻れない（完了処理の再実行を防ぐ）
    expect(repo.goBack()!.step).toBe('done');
  });
  it('目的は既存トラックへ対応（新しい正式トラックを作らない・§4）', () => {
    expect(LEARNING_GOALS.length).toBe(4);
    expect(trackForGoal('jlpt_n3')).toBe('n3_prep');
    expect(trackForGoal('life_in_japan')).toBe('life_basic');
    expect(trackForGoal('daily_conversation')).toBe('conversation');
    expect(trackForGoal('work')).toBe('business');
  });
});

describe('Recovery（§7・既存進捗を壊さない）', () => {
  it('resetOnboardingOnlyは初回状態だけ消し、語彙進捗・復習予定は残す', () => {
    const { st, progress, schedule, repo } = setup();
    progress.recordEncounter('fi-sumu');
    schedule.recordResult({ itemId: 'fi-iku', result: 'wrong', source: 'daily' });
    repo.setGoal('work');
    repo.resetOnboardingOnly();
    expect(st.getItem(FIRST_RUN_STORAGE_KEY)).toBeNull();
    expect(st.getItem(VOCAB_STORAGE_KEY)).toBeTruthy();          // 学習進捗は残る
    expect(schedule.getAll().length).toBe(1);                    // 復習予定も残る
    expect(progress.getStats().seenCount).toBeGreaterThan(0);
  });
  it('保存できない環境でもクラッシュせず、保存失敗を検知できる（§7）', () => {
    const failing = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    };
    const progress = createVocabProgressRepository(mem());
    const schedule = createVocabSpacedReviewRepository(mem(), clock);
    const repo = createFirstRunRepository(failing, progress, schedule);
    expect(() => repo.setGoal('work')).not.toThrow();
    expect(repo.lastSaveFailed()).toBe(true);      // 保存成功を偽らない
  });
});
