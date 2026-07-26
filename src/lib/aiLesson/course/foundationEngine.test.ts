import { describe, it, expect } from 'vitest';
import { mechanicOf } from './foundationTypes';
import type { FoundationQuestion } from './foundationTypes';
import { judgeQuestion, normalizeJaAnswer, shuffledChoicesSeeded, shuffledOrderSeeded, shuffledMatchingRight, deriveMasteryState } from './foundationGrade';

const base = { promptJa: 'p', promptZh: 'p', explanationJa: 'e', explanationZh: 'e', errorTag: 'tag', review: 'draft' as const, dimension: 'form' as const };

describe('問題タイプ→メカニクス集約（§9）', () => {
  it('10タイプが4系統に割り当てられる', () => {
    expect(mechanicOf('single_choice')).toBe('choice');
    expect(mechanicOf('reading_choice')).toBe('choice');
    expect(mechanicOf('particle_choice')).toBe('choice');
    expect(mechanicOf('error_correction_choice')).toBe('choice');
    expect(mechanicOf('fill_blank')).toBe('choice');
    expect(mechanicOf('text_input')).toBe('input');
    expect(mechanicOf('kana_input')).toBe('input');
    expect(mechanicOf('conjugation_input')).toBe('input');
    expect(mechanicOf('sentence_order')).toBe('order');
    expect(mechanicOf('matching')).toBe('matching');
  });
});

describe('正規化（§10）', () => {
  it('NFKC・空白・句読点・全角数字を吸収する', () => {
    expect(normalizeJaAnswer(' ７時に 起きます。 ')).toBe('7時に起きます');
    expect(normalizeJaAnswer('行って!')).toBe('行って');
  });
  it('意味が変わる表記は同一化しない', () => {
    expect(normalizeJaAnswer('日本に')).not.toBe(normalizeJaAnswer('日本で'));
    expect(normalizeJaAnswer('中国')).not.toBe(normalizeJaAnswer('中国語'));
    expect(normalizeJaAnswer('行きます')).not.toBe(normalizeJaAnswer('行っています'));
  });
});

describe('新メカニクスの採点', () => {
  const conj: FoundationQuestion = { ...base, id: 'tq-conj', type: 'conjugation_input', accepted: ['書いて', 'かいて'] };
  const match: FoundationQuestion = { ...base, id: 'tq-match', type: 'matching', pairs: [
    { left: '4時', right: 'よじ' }, { left: '7時', right: 'しちじ' }, { left: '9時', right: 'くじ' }] };
  it('conjugation_input: 漢字/かなの許容回答はacceptedで明示・句読点差を許容', () => {
    expect(judgeQuestion(conj, { text: '書いて。' })).toBe(true);
    expect(judgeQuestion(conj, { text: 'かいて' })).toBe(true);
    expect(judgeQuestion(conj, { text: '書きて' })).toBe(false);
  });
  it('matching: 全対応一致のみ正解', () => {
    expect(judgeQuestion(match, { matchingIndexes: [0, 1, 2] })).toBe(true);
    expect(judgeQuestion(match, { matchingIndexes: [1, 0, 2] })).toBe(false);
    expect(judgeQuestion(match, { matchingIndexes: [0, 1] })).toBe(false);
  });
});

describe('attemptSeedシャッフル（§11）', () => {
  const q: FoundationQuestion = { ...base, id: 'tq-shuf', type: 'single_choice', choices: ['A', 'B', 'C', 'D'], answerIndex: 0 };
  it('同一attempt内は再計算しても同じ順序（決定的）', () => {
    expect(shuffledChoicesSeeded(q, 5)).toEqual(shuffledChoicesSeeded(q, 5));
    expect(shuffledOrderSeeded({ ...base, id: 'tq-ord', type: 'sentence_order', orderTokens: ['a', 'b', 'c', 'd'] }, 3))
      .toEqual(shuffledOrderSeeded({ ...base, id: 'tq-ord', type: 'sentence_order', orderTokens: ['a', 'b', 'c', 'd'] }, 3));
  });
  it('attemptSeedが変わると順序が変わり得る（seed 1..8のうち少なくとも2種）', () => {
    const orders = new Set(Array.from({ length: 8 }, (_, i) => shuffledChoicesSeeded(q, i + 1).join(',')));
    expect(orders.size).toBeGreaterThan(1);
  });
  it('どのseedでも正解が表示先頭に来ない・全indexを含む', () => {
    for (let seed = 0; seed < 20; seed++) {
      const order = shuffledChoicesSeeded(q, seed);
      expect(order[0]).not.toBe(q.answerIndex);
      expect([...order].sort()).toEqual([0, 1, 2, 3]);
    }
  });
  it('matching右列も決定的シャッフル・正解並びそのままにならない', () => {
    const m: FoundationQuestion = { ...base, id: 'tq-m2', type: 'matching', pairs: [{ left: 'l1', right: 'r1' }, { left: 'l2', right: 'r2' }] };
    expect(shuffledMatchingRight(m, 1)).toEqual(shuffledMatchingRight(m, 1));
    expect(shuffledMatchingRight(m, 1)).not.toEqual([0, 1]);
  });
});

describe('候補状態の導出（§12・attemptedAt明示・日付偽装なし）', () => {
  const at = (d: string) => `${d}T09:00:00.000Z`;
  it('not_seen→familiar→guided→independent', () => {
    expect(deriveMasteryState([])).toBe('not_seen');
    expect(deriveMasteryState([{ correct: false, attemptedAt: at('2026-07-26') }])).toBe('familiar');
    expect(deriveMasteryState([{ correct: true, hintUsed: true, attemptedAt: at('2026-07-26') }])).toBe('guided');
    expect(deriveMasteryState([{ correct: true, attemptedAt: at('2026-07-26') }])).toBe('independent');
  });
  it('同日の連続自力正解ではretainedにしない・別日の再確認自力正解でretained', () => {
    const sameDay = [
      { correct: true, attemptedAt: '2026-07-26T09:00:00.000Z' },
      { correct: true, attemptedAt: '2026-07-26T10:00:00.000Z' }];
    expect(deriveMasteryState(sameDay)).toBe('independent');
    const laterDay = [
      { correct: true, attemptedAt: '2026-07-26T09:00:00.000Z' },
      { correct: true, attemptedAt: '2026-08-02T09:00:00.000Z' }];
    expect(deriveMasteryState(laterDay)).toBe('retained');
  });
  it('「あとで確認」はfamiliarではなくguided扱い（§13）', () => {
    expect(deriveMasteryState([{ correct: false, skipped: true, attemptedAt: '2026-07-26T09:00:00.000Z' }])).toBe('guided');
  });
  it('後日に誤答すればretainedへ進めずfamiliarへ戻る', () => {
    expect(deriveMasteryState([
      { correct: true, attemptedAt: '2026-07-26T09:00:00.000Z' },
      { correct: false, attemptedAt: '2026-08-02T09:00:00.000Z' }])).toBe('familiar');
  });
});
