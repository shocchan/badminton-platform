// N2文法トラックの取り込み・監査・レビュー状態の検証（原本180項目）。
import { describe, it, expect } from 'vitest';
import { N2_GRAMMAR_ITEMS } from './n2GrammarData';
import { learnerVisible, reviewCandidates, searchGrammar, byUnit12, n2GrammarStats } from './courseN2Grammar';

describe('N2文法 原本取り込み', () => {
  it('原本の全180項目を取り込んでいる', () => {
    expect(N2_GRAMMAR_ITEMS.length).toBe(180);
    const nos = N2_GRAMMAR_ITEMS.map((g) => g.no).sort((a, b) => a - b);
    expect(nos[0]).toBe(1);
    expect(nos[179]).toBe(180);
  });
  it('grammarId が一意', () => {
    expect(new Set(N2_GRAMMAR_ITEMS.map((g) => g.grammarId)).size).toBe(180);
  });
  it('原本行(sourceRow)を保持している', () => {
    for (const g of N2_GRAMMAR_ITEMS) expect(g.sourceRow).toBeGreaterThanOrEqual(2);
    expect(N2_GRAMMAR_ITEMS.find((g) => g.no === 1)?.sourceRow).toBe(2);
  });
  it('全項目に原本の例文がある（原本情報を消さない）', () => {
    expect(N2_GRAMMAR_ITEMS.every((g) => g.examples.length > 0)).toBe(true);
  });
  it('空欄を勝手に補完しない: 原本メモ(meaningJa)がある項目は少数、無い項目は要作成フラグ', () => {
    const withMemo = N2_GRAMMAR_ITEMS.filter((g) => g.meaningJa.trim().length > 0);
    expect(withMemo.length).toBeLessThan(180); // 全部は無い
    // 中国語訳・読み方は原本に無い＝全項目で要作成フラグ（捏造しない）
    expect(N2_GRAMMAR_ITEMS.every((g) => g.reviewFlags.includes('needs_meaningZh'))).toBe(true);
    expect(N2_GRAMMAR_ITEMS.every((g) => g.reviewFlags.includes('needs_reading'))).toBe(true);
  });
});

describe('レビュー状態・段階公開', () => {
  it('learner に見せるのは approved のみ（現状0）', () => {
    expect(learnerVisible(N2_GRAMMAR_ITEMS).length).toBe(0);
    expect(N2_GRAMMAR_ITEMS.every((g) => g.reviewStatus !== 'approved')).toBe(true);
  });
  it('最初の15項目のみ reviewed（approved候補・未承認）', () => {
    expect(reviewCandidates(N2_GRAMMAR_ITEMS).length).toBe(15);
    expect(N2_GRAMMAR_ITEMS.filter((g) => g.no <= 15).every((g) => g.reviewStatus === 'reviewed')).toBe(true);
    expect(N2_GRAMMAR_ITEMS.filter((g) => g.no > 15).every((g) => g.reviewStatus === 'imported')).toBe(true);
  });
  it('統計: total180・approved0・reviewed15・全例文あり', () => {
    const s = n2GrammarStats(N2_GRAMMAR_ITEMS);
    expect(s.total).toBe(180);
    expect(s.approved).toBe(0);
    expect(s.reviewed).toBe(15);
    expect(s.withExample).toBe(180);
  });
  it('合格率フィールドを持たない（禁止）', () => {
    for (const g of N2_GRAMMAR_ITEMS) {
      expect(Object.keys(g)).not.toContain('passRate');
    }
  });
});

describe('検索・ユニット・ja/zh', () => {
  it('検索が表現・例文に一致する', () => {
    const r = searchGrammar(N2_GRAMMAR_ITEMS, 'あげく');
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r.some((g) => g.displayExpression.includes('あげく'))).toBe(true);
  });
  it('空検索は全件', () => {
    expect(searchGrammar(N2_GRAMMAR_ITEMS, '').length).toBe(180);
  });
  it('12ユニットへ仮配置され、各ユニットに項目がある', () => {
    for (let u = 1; u <= 12; u++) expect(byUnit12(N2_GRAMMAR_ITEMS, u).length).toBeGreaterThan(0);
    expect(N2_GRAMMAR_ITEMS.every((g) => g.unit12 >= 1 && g.unit12 <= 12)).toBe(true);
  });
});
