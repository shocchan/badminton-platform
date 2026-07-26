import { describe, it, expect } from 'vitest';
import { UNIT1, UNIT1_ITEMS, UNIT1_QUESTIONS, UNIT1_RULES } from './foundationUnit1';
import { judgeQuestion, normalizeKanaAnswer, aggregateByDimension, deriveReviewCandidates, shuffledOrder } from './foundationGrade';

describe('しくみラボ 単元データ整合性（Phase 2A）', () => {
  it('ID重複なし・単元参照が実在・source追跡あり', () => {
    const iid = UNIT1_ITEMS.map((i) => i.id); const qid = UNIT1_QUESTIONS.map((q) => q.id);
    expect(new Set(iid).size).toBe(iid.length);
    expect(new Set(qid).size).toBe(qid.length);
    UNIT1.itemIds.forEach((id) => expect(iid).toContain(id));
    UNIT1_ITEMS.forEach((i) => { expect(i.sources.length).toBeGreaterThan(0); expect(i.readingKana).toBeTruthy(); expect(i.meaningZh).toBeTruthy(); });
  });
  it('全教材がdraft（自動approved禁止）・品詞2種以上・軸別問題数（読3意3形接3使2）', () => {
    [...UNIT1_ITEMS, ...UNIT1_RULES, ...UNIT1_QUESTIONS, UNIT1].forEach((x) => expect(x.review).toBe('draft'));
    expect(new Set(UNIT1_ITEMS.map((i) => i.partOfSpeech)).size).toBeGreaterThanOrEqual(2);
    const d = (k: string) => UNIT1_QUESTIONS.filter((q) => q.dimension === k).length;
    expect(d('reading')).toBe(3); expect(d('meaning')).toBe(3);
    expect(d('form') + d('connection')).toBe(3); expect(d('usage')).toBe(2);
  });
  it('choice問題は正解index・解説ja/zhを持つ', () => {
    UNIT1_QUESTIONS.filter((q) => q.type === 'choice').forEach((q) => {
      expect(q.choices!.length).toBeGreaterThanOrEqual(3);
      expect(q.answerIndex).toBe(0); // データ上は先頭が正解（表示時に並びを変える運用はPhase 2B）
      expect(q.explanationJa && q.explanationZh).toBeTruthy();
    });
  });
});

describe('決定的採点', () => {
  const input = UNIT1_QUESTIONS.find((q) => q.id === 'fq-r3')!;
  const order = UNIT1_QUESTIONS.find((q) => q.id === 'fq-u1')!;
  it('かな正規化: カタカナ・全角空白を許容', () => {
    expect(normalizeKanaAnswer(' スム ')).toBe('すむ');
    expect(judgeQuestion(input, { text: 'スム' })).toBe(true);
    expect(judgeQuestion(input, { text: 'すみ' })).toBe(false);
    expect(judgeQuestion(input, { text: '' })).toBe(false);
  });
  it('choice/orderの正誤', () => {
    const c = UNIT1_QUESTIONS.find((q) => q.id === 'fq-f2')!;
    expect(judgeQuestion(c, { choiceIndex: 0 })).toBe(true);
    expect(judgeQuestion(c, { choiceIndex: 1 })).toBe(false);
    expect(judgeQuestion(order, { orderIndexes: [0, 1, 2, 3] })).toBe(true);
    expect(judgeQuestion(order, { orderIndexes: [1, 0, 2, 3] })).toBe(false);
  });
  it('orderシャッフルは決定的かつ正解順と異なる', () => {
    expect(shuffledOrder(order)).toEqual(shuffledOrder(order));
    expect(shuffledOrder(order)).not.toEqual([0, 1, 2, 3]);
  });
});

describe('軸別集計＋復習候補（保存なし・正解は再出題しない）', () => {
  const rs = [
    { questionId: 'a', targetId: 'fi-hataraku', dimension: 'reading' as const, correct: false, errorTag: 'reading_hataraku' },
    { questionId: 'b', targetId: 'fi-kaisha', dimension: 'meaning' as const, correct: true, errorTag: 'meaning_kaisha' },
    { questionId: 'c', targetId: 'fr-particles', dimension: 'connection' as const, correct: true, hintUsed: true, errorTag: 'particle_location_action' },
  ];
  it('軸別に正答/総数を集計', () => {
    const agg = aggregateByDimension(rs.map(({ questionId, dimension, correct, errorTag, targetId }) => ({ questionId, dimension, correct, errorTag, targetId })));
    expect(agg.reading).toEqual({ correct: 0, total: 1 });
    expect(agg.meaning).toEqual({ correct: 1, total: 1 });
  });
  it('誤答=翌日・ヒント正解=3日後・自力正解=候補なし', () => {
    const cands = deriveReviewCandidates(rs);
    expect(cands).toEqual([
      { reviewTarget: 'fi-hataraku', reviewDimension: 'reading', errorTag: 'reading_hataraku', suggestedInterval: 'day1' },
      { reviewTarget: 'fr-particles', reviewDimension: 'connection', errorTag: 'particle_location_action', suggestedInterval: 'day3' },
    ]);
  });
});
