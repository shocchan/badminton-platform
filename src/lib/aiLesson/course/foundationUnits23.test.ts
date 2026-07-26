import { describe, it, expect } from 'vitest';
import { UNIT2, UNIT2_RULES, UNIT2_QUESTIONS, BUNDLE as B2 } from './foundationUnit2';
import { UNIT3, UNIT3_RULES, UNIT3_QUESTIONS, BUNDLE as B3 } from './foundationUnit3';
import { BANK_ITEMS, bankItem } from './foundationItemBank';
import { judgeQuestion } from './foundationGrade';

describe('単元2 ます形・ない形（データ整合・例外）', () => {
  it('語彙8〜12・共有バンク参照・全draft', () => {
    expect(UNIT2.itemIds.length).toBeGreaterThanOrEqual(8);
    expect(UNIT2.itemIds.length).toBeLessThanOrEqual(12);
    // 同一Item参照（重複登録なし・参照同一性）
    UNIT2.itemIds.forEach((id) => expect(B2.items.find((i) => i.id === id)).toBe(bankItem(id)));
    [...B2.items, ...UNIT2_RULES, ...UNIT2_QUESTIONS, UNIT2].forEach((x) => expect(x.review).toBe('draft'));
  });
  it('例外の明示: する・来る・ある→ない・帰る（るで終わる一類）', () => {
    const naiRule = UNIT2_RULES.find((r) => r.id === 'fr-nai-form')!;
    expect(naiRule.explanationJa).toContain('しない');
    expect(naiRule.explanationJa).toContain('こない');
    expect(naiRule.explanationJa).toContain('「ある」のない形は「ない」');
    const groupRule = UNIT2_RULES.find((r) => r.id === 'fr-verb-groups')!;
    expect(groupRule.explanationJa).toContain('帰る');
    expect(bankItem('fi-kaeru').verbGroup).toBe('g1');
    expect(bankItem('fi-suru').verbGroup).toBe('g3');
    expect(bankItem('fi-kuru').verbGroup).toBe('g3');
  });
  it('活用採点: 行きます・買わない（かな許容・買あないは不正解）', () => {
    const masu = UNIT2_QUESTIONS.find((q) => q.id === 'f2q-f2')!;
    expect(judgeQuestion(masu, { text: '行きます' })).toBe(true);
    expect(judgeQuestion(masu, { text: 'いきます' })).toBe(true);
    expect(judgeQuestion(masu, { text: '行くます' })).toBe(false);
    const nai = UNIT2_QUESTIONS.find((q) => q.id === 'f2q-f5')!;
    expect(judgeQuestion(nai, { text: '買わない' })).toBe(true);
    expect(judgeQuestion(nai, { text: '買あない' })).toBe(false);
  });
  it('軸別最低問題数: 読み2・意味2・形接続3・使用2', () => {
    const d = (k: string) => UNIT2_QUESTIONS.filter((q) => q.dimension === k).length;
    expect(d('reading')).toBeGreaterThanOrEqual(2);
    expect(d('meaning')).toBeGreaterThanOrEqual(2);
    expect(d('form') + d('connection')).toBeGreaterThanOrEqual(3);
    expect(d('usage')).toBeGreaterThanOrEqual(2);
  });
});

describe('単元3 て形（音便・例外・語彙再利用）', () => {
  it('単元2と同じItem参照（行くがunit2/3で同一オブジェクト）', () => {
    const iku2 = B2.items.find((i) => i.id === 'fi-iku');
    const iku3 = B3.items.find((i) => i.id === 'fi-iku');
    expect(iku2).toBe(iku3);
    expect(iku2).toBe(bankItem('fi-iku'));
  });
  it('て形規則を網羅: って/んで/いて/いで/して/二類/する/来る/行って', () => {
    const all = UNIT3_RULES.map((r) => r.explanationJa).join('');
    ['って', 'んで', 'いて', 'いで', 'して', '食べて', '来て', '行って'].forEach((k) => expect(all).toContain(k));
  });
  it('活用採点: 買って・来る→きて・行く→行って（例外）', () => {
    const katte = UNIT3_QUESTIONS.find((q) => q.id === 'f3q-f1')!;
    expect(judgeQuestion(katte, { text: '買って' })).toBe(true);
    expect(judgeQuestion(katte, { text: '買いて' })).toBe(false);
    const kite = UNIT3_QUESTIONS.find((q) => q.id === 'f3q-f4')!;
    expect(judgeQuestion(kite, { text: 'きて' })).toBe(true);
    const itte = UNIT3_QUESTIONS.find((q) => q.id === 'f3q-f5')!;
    expect(itte.choices![itte.answerIndex!]).toBe('行って');
  });
  it('matching問題（動詞→て形）が存在し全対応一致のみ正解', () => {
    const m = UNIT3_QUESTIONS.find((q) => q.type === 'matching')!;
    expect(m.pairs!.length).toBe(3);
    expect(judgeQuestion(m, { matchingIndexes: [0, 1, 2] })).toBe(true);
    expect(judgeQuestion(m, { matchingIndexes: [2, 1, 0] })).toBe(false);
  });
  it('軸別最低問題数とdraft維持', () => {
    const d = (k: string) => UNIT3_QUESTIONS.filter((q) => q.dimension === k).length;
    expect(d('reading')).toBeGreaterThanOrEqual(2);
    expect(d('meaning')).toBeGreaterThanOrEqual(2);
    expect(d('form') + d('connection')).toBeGreaterThanOrEqual(3);
    expect(d('usage')).toBeGreaterThanOrEqual(2);
    [...B3.items, ...UNIT3_RULES, ...UNIT3_QUESTIONS, UNIT3].forEach((x) => expect(x.review).toBe('draft'));
  });
});

describe('共有バンクの整合', () => {
  it('ID重複なし・動詞はverbGroup必須・出典sourceMatchType必須', () => {
    const ids = BANK_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    BANK_ITEMS.filter((i) => i.partOfSpeech === 'verb').forEach((i) => expect(i.verbGroup).toBeTruthy());
    BANK_ITEMS.flatMap((i) => i.sources).forEach((s) => {
      expect(s.sourceLabel.length).toBeGreaterThan(0);
      if (s.sourceMatchType === 'external_scope') expect(s.sourceSheet).toBeNull();
      else expect(s.cellRange).toBeTruthy();
    });
  });
  it('多義語senses: 聞く（听/问）が分離されている', () => {
    expect(bankItem('fi-kiku').senses?.length).toBe(2);
  });
});
