import { describe, it, expect } from 'vitest';
import { N2_CATEGORY_DEFS, N2_ITEM_CATEGORIES, byCategory } from './n2Categories';
import { N2_GRAMMAR_INDEX } from './n2GrammarIndex';

describe('N2使用場面カテゴリ（メタデータのみ・本文非変更）', () => {
  it('カテゴリ定義: 14種・ja/zhラベルと説明が揃っている（パリティ）', () => {
    expect(N2_CATEGORY_DEFS.length).toBe(14);
    const ids = new Set(N2_CATEGORY_DEFS.map((d) => d.id));
    expect(ids.size).toBe(14);
    for (const d of N2_CATEGORY_DEFS) {
      expect(d.ja.length).toBeGreaterThan(0);
      expect(d.zh.length).toBeGreaterThan(0);
      expect(d.descJa.length).toBeGreaterThan(0);
      expect(d.descZh.length).toBeGreaterThan(0);
    }
  });

  it('全180項目に分類があり、primaryは定義済みカテゴリ・secondaryは最大2', () => {
    const valid = new Set(N2_CATEGORY_DEFS.map((d) => d.id));
    expect(Object.keys(N2_ITEM_CATEGORIES).length).toBe(N2_GRAMMAR_INDEX.length);
    for (const g of N2_GRAMMAR_INDEX) {
      const c = N2_ITEM_CATEGORIES[g.grammarId];
      expect(c, `${g.grammarId} に分類がない`).toBeTruthy();
      expect(valid.has(c.primary)).toBe(true);
      expect(c.secondary.length).toBeLessThanOrEqual(2);
      c.secondary.forEach((s) => expect(valid.has(s)).toBe(true));
    }
  });

  it('低confidence項目は「その他」へ倒している（断定しない方針）', () => {
    for (const [id, c] of Object.entries(N2_ITEM_CATEGORIES)) {
      if (c.confidence === 'low') expect(c.primary, `${id} はlowなのに ${c.primary}`).toBe('other');
    }
  });

  it('byCategory: primary/secondaryのどちらでもヒットし、無関係は含まない', () => {
    const reason = byCategory(N2_GRAMMAR_INDEX, 'reason');
    expect(reason.length).toBeGreaterThan(0);
    for (const g of reason) {
      const c = N2_ITEM_CATEGORIES[g.grammarId];
      expect(c.primary === 'reason' || c.secondary.includes('reason')).toBe(true);
    }
    // 代表例: 〜おかげで は理由カテゴリに入る
    const okage = N2_GRAMMAR_INDEX.find((g) => g.displayExpression.includes('おかげ'));
    if (okage) expect(reason.some((g) => g.grammarId === okage.grammarId)).toBe(true);
  });

  it('分類済み（other以外）が過半数（180項目に圧倒されない入口として機能する）', () => {
    const classified = Object.values(N2_ITEM_CATEGORIES).filter((c) => c.primary !== 'other').length;
    expect(classified).toBeGreaterThan(90);
  });
});
