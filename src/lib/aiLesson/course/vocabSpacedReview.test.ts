// Phase 2E-1.10 §38: 間隔反復（day1/day3/day7）とLearningClockのテスト。
// 「本人が覚えたと言っても予定は消えない」「同日の正解だけで定着候補にしない」を担保する。
import { describe, it, expect } from 'vitest';
import { createLearningClock } from './learningClock';
import { createVocabSpacedReviewRepository, VOCAB_REVIEW_SCHEDULE_KEY } from './vocabSpacedReview';

const mem = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    raw: m,
  };
};

describe('LearningClock（§5・ローカル日付・注入可能）', () => {
  it('localDateKeyはローカル日付（UTC変換で前日/翌日にならない）', () => {
    // 日本時間の深夜0時30分＝UTCでは前日15:30。ローカル日付が正しく使われること
    const c = createLearningClock(new Date(2026, 6, 28, 0, 30));
    expect(c.localDateKey()).toBe('2026-07-28');
    // 23:59でも同日
    expect(createLearningClock(new Date(2026, 6, 28, 23, 59)).localDateKey()).toBe('2026-07-28');
  });
  it('addDays: 月跨ぎ・年跨ぎ・差分・前後判定', () => {
    const c = createLearningClock(new Date(2026, 6, 28, 9, 0));
    expect(c.addDays('2026-07-28', 1)).toBe('2026-07-29');
    expect(c.addDays('2026-07-31', 3)).toBe('2026-08-03');
    expect(c.addDays('2026-12-30', 7)).toBe('2027-01-06');
    expect(c.diffDays('2026-08-03', '2026-07-31')).toBe(3);
    expect(c.isBefore('2026-07-28', '2026-07-29')).toBe(true);
    expect(c.isBefore('2026-07-29', '2026-07-29')).toBe(false);
  });
});

describe('間隔反復スケジュール（§4）', () => {
  const day = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h);
  it('誤答→翌日・補助あり→3日後・自力正解→7日後', () => {
    const st = mem();
    const c = createLearningClock(day(2026, 7, 28));
    const repo = createVocabSpacedReviewRepository(st, c);
    expect(repo.recordResult({ itemId: 'fi-sumu', result: 'wrong', dimension: 'reading', source: 'daily' }))
      .toMatchObject({ reviewStage: 'day1', nextReviewAt: '2026-07-29' });
    expect(repo.recordResult({ itemId: 'fi-iku', result: 'supported', dimension: 'meaning', source: 'daily' }))
      .toMatchObject({ reviewStage: 'day3', nextReviewAt: '2026-07-31' });
    expect(repo.recordResult({ itemId: 'fi-kuru', result: 'independent', dimension: 'meaning', source: 'daily' }))
      .toMatchObject({ reviewStage: 'day7', nextReviewAt: '2026-08-04' });
  });
  it('同じ日に自力正解を繰り返してもretention_candidateにしない（§4絶対条件）', () => {
    const st = mem();
    const repo = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)));
    repo.recordResult({ itemId: 'fi-sumu', result: 'independent', source: 'daily' });
    const second = repo.recordResult({ itemId: 'fi-sumu', result: 'independent', source: 'quick_review' });
    expect(second.reviewStage).toBe('day7');
    expect(second.consecutiveIndependent).toBe(1);   // 同日は加算しない
  });
  it('別の日に自力正解できたらretention_candidate（定着候補・習得ではない）', () => {
    const st = mem();
    createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)))
      .recordResult({ itemId: 'fi-sumu', result: 'independent', source: 'daily' });
    const later = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 8, 4)))
      .recordResult({ itemId: 'fi-sumu', result: 'independent', source: 'quick_review' });
    expect(later.reviewStage).toBe('retention_candidate');
    expect(later.consecutiveIndependent).toBe(2);
    expect(later.nextReviewAt).toBe('2026-08-18');
  });
  it('誤答すると段階が翌日へ戻る（定着候補から再スタート）', () => {
    const st = mem();
    const repo = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)));
    repo.recordResult({ itemId: 'fi-sumu', result: 'independent', source: 'daily' });
    const back = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 8, 5)))
      .recordResult({ itemId: 'fi-sumu', result: 'wrong', dimension: 'usage', source: 'quick_review' });
    expect(back.reviewStage).toBe('day1');
    expect(back.consecutiveIndependent).toBe(0);
    expect(back.weakDimensions).toContain('usage');
  });
  it('「覚えたと思う」で予定は消えない・「まだ不安」は予定を作り優先度を上げる（§4）', () => {
    const st = mem();
    const repo = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)));
    repo.recordResult({ itemId: 'fi-sumu', result: 'wrong', source: 'daily' });
    repo.markSelfKnown('fi-sumu');
    expect(repo.get('fi-sumu')).toMatchObject({ reviewStage: 'day1', nextReviewAt: '2026-07-29' });
    // 未出題語でも「まだ不安」だけで翌日予定
    repo.markUncertain('fi-atarashii');
    expect(repo.get('fi-atarashii')).toMatchObject({ reviewStage: 'day1', learnerUncertain: true, source: 'self_assessment' });
  });
  it('自力正解で弱点次元が外れる（別次元の弱点は残る）', () => {
    const st = mem();
    const repo = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)));
    repo.recordResult({ itemId: 'fi-sumu', result: 'wrong', dimension: 'reading', source: 'daily' });
    repo.recordResult({ itemId: 'fi-sumu', result: 'wrong', dimension: 'particle', source: 'daily' });
    const after = repo.recordResult({ itemId: 'fi-sumu', result: 'independent', dimension: 'reading', source: 'quick_review' });
    expect(after.weakDimensions).toEqual(['particle']);
  });
  it('Sense別に分けて管理できる（同一Itemでも別予定）', () => {
    const st = mem();
    const repo = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)));
    repo.recordResult({ itemId: 'fi-taihen', senseId: 'taihen-hard', result: 'wrong', source: 'daily' });
    repo.recordResult({ itemId: 'fi-taihen', senseId: 'taihen-serious', result: 'independent', source: 'daily' });
    expect(repo.get('fi-taihen', 'taihen-hard')!.reviewStage).toBe('day1');
    expect(repo.get('fi-taihen', 'taihen-serious')!.reviewStage).toBe('day7');
    expect(repo.getAll().length).toBe(2);
  });
});

describe('期限判定と集計（§6・§17）', () => {
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9);
  const seed = () => {
    const st = mem();
    const repo = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)));
    repo.recordResult({ itemId: 'fi-a', result: 'wrong', source: 'daily' });          // → 7/29
    repo.recordResult({ itemId: 'fi-b', result: 'supported', source: 'daily' });      // → 7/31
    repo.recordResult({ itemId: 'fi-c', result: 'independent', source: 'daily' });    // → 8/4
    return st;
  };
  it('翌日には1件が対象・期限超過は先頭・重複なし', () => {
    const repo = createVocabSpacedReviewRepository(seed(), createLearningClock(day(2026, 7, 29)));
    const due = repo.getDue();
    expect(due.map((d) => d.itemId)).toEqual(['fi-a']);
    expect(due[0].overdueDays).toBe(0);
    const s = repo.getDueSummary();
    expect(s).toMatchObject({ total: 1, overdue: 0, today: 1 });
    expect(s.upcoming.inThreeDays).toBe(0);
  });
  it('3日後には期限超過1件＋当日1件（超過が先頭・決定的）', () => {
    const repo = createVocabSpacedReviewRepository(seed(), createLearningClock(day(2026, 7, 31)));
    const due = repo.getDue();
    expect(due.map((d) => d.itemId)).toEqual(['fi-a', 'fi-b']);
    expect(due[0].overdueDays).toBe(2);
    expect(repo.getDueSummary()).toMatchObject({ total: 2, overdue: 1, today: 1 });
  });
  it('7日後には3件すべて対象・byStage集計が一致', () => {
    const repo = createVocabSpacedReviewRepository(seed(), createLearningClock(day(2026, 8, 4)));
    const s = repo.getDueSummary();
    expect(s.total).toBe(3);
    expect(s.byStage.day1 + s.byStage.day3 + s.byStage.day7).toBe(3);
  });
  it('壊れたstorageでも空として扱い、学習を止めない', () => {
    const st = mem();
    st.setItem(VOCAB_REVIEW_SCHEDULE_KEY, '{{{broken');
    const repo = createVocabSpacedReviewRepository(st, createLearningClock(day(2026, 7, 28)));
    expect(repo.getAll()).toEqual([]);
    expect(repo.getDue()).toEqual([]);
  });
});
