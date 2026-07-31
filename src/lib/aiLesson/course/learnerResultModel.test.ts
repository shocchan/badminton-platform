// Phase 2E-1.15 §2-§3: 学習者向け結果モデル。
// 「クイズ誤答＋覚えたと思う」を「自分でできた」と表示しないこと、
// 分からない値を0と断定しないことを担保する。
import { describe, it, expect, beforeEach } from 'vitest';
import { buildLearnerResult, isQuizBreakdownComplete } from './learnerResultModel';
import { createVocabProgressRepository } from './vocabProgress';
import { createVocabSpacedReviewRepository } from './vocabSpacedReview';
import { createLearningClock } from './learningClock';

const store = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

let progress: ReturnType<typeof createVocabProgressRepository>;
let schedule: ReturnType<typeof createVocabSpacedReviewRepository>;

beforeEach(() => {
  const s = store();
  progress = createVocabProgressRepository(s);
  schedule = createVocabSpacedReviewRepository(s, createLearningClock('2026-07-28T09:00:00'));
});

describe('buildLearnerResult', () => {
  it('クイズ誤答＋「覚えたと思う」を「正しく答えられた」に数えない', () => {
    progress.recordTest('a', 'meaning', false);
    progress.setSelfAssessment('a', 'self_known');
    const r = buildLearnerResult(['a'], progress, schedule);
    expect(r.correctCount).toBe(0);
    expect(r.incorrectCount).toBe(1);
    expect(r.feltConfidentCount).toBe(1);   // 本人の感じ方は別の軸として残る
  });

  it('クイズの内訳は必ず確認した語数の完全な内訳になる', () => {
    progress.recordTest('a', 'meaning', true);
    progress.recordTest('b', 'meaning', false);
    // c は問題に答えていない
    const r = buildLearnerResult(['a', 'b', 'c'], progress, schedule);
    expect(r.correctCount).toBe(1);
    expect(r.incorrectCount).toBe(1);
    expect(r.notAnsweredCount).toBe(1);
    expect(isQuizBreakdownComplete(r)).toBe(true);
  });

  it('同じ語を2回答えた場合は最後の結果で数える', () => {
    progress.recordTest('a', 'meaning', false);
    progress.recordTest('a', 'meaning', true);
    const r = buildLearnerResult(['a'], progress, schedule);
    expect(r.correctCount).toBe(1);
    expect(r.incorrectCount).toBe(0);
  });

  it('ヒントを使ったかは保存されていないので 0 と断定せず null にする', () => {
    progress.recordTest('a', 'meaning', true);
    expect(buildLearnerResult(['a'], progress, schedule).answeredWithSupportCount).toBeNull();
  });

  it('自己評価の2つは別の軸として数える（正誤の代わりにしない）', () => {
    progress.setSelfAssessment('a', 'self_known');
    progress.setSelfAssessment('b', 'needs_review');
    const r = buildLearnerResult(['a', 'b'], progress, schedule);
    expect(r.feltConfidentCount).toBe(1);
    expect(r.feltUnsureCount).toBe(1);
    expect(r.correctCount).toBe(0);        // 問題には答えていない
    expect(r.notAnsweredCount).toBe(2);
  });

  it('復習予定は件数といちばん近い日付を返す', () => {
    schedule.recordResult({ itemId: 'a', result: 'wrong', dimension: 'meaning', source: 'daily' });
    schedule.recordResult({ itemId: 'b', result: 'independent', dimension: 'meaning', source: 'daily' });
    const r = buildLearnerResult(['a', 'b'], progress, schedule);
    expect(r.scheduledForReviewCount).toBe(2);
    expect(r.nextReviewDate).toBe('2026-07-29');   // 誤答の翌日がいちばん近い
  });

  it('予定が無ければ日付は null（今日と誤解させない）', () => {
    const r = buildLearnerResult(['a'], progress, schedule);
    expect(r.scheduledForReviewCount).toBe(0);
    expect(r.nextReviewDate).toBeNull();
  });

  it('対象の語が取れない場合は partial にして 0 件を結果として見せない', () => {
    const r = buildLearnerResult([], progress, schedule);
    expect(r.partial).toBe(true);
  });

  it('同じ入力なら必ず同じ結果になる（決定的）', () => {
    progress.recordTest('a', 'meaning', true);
    expect(buildLearnerResult(['a'], progress, schedule))
      .toEqual(buildLearnerResult(['a'], progress, schedule));
  });
});
