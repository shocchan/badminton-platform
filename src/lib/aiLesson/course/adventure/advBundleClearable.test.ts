// 「毎回満点でも永久に攻略できない束」を作らない（2026-08-18 監査P0）。
//
// N3文法攻略stageの先頭 n3g-unit-1 は問題が14問しかなく、
// 毎日100%正解しても3日目には未出問題が尽きて qualifying にならず、
// **N3目標の本丸が永久に攻略できない**状態だった（合流はunit-10だけハードコードされていた）。
// 実測の問題数で自動的に合流する仕組みに統一したので、ここでその結果を固定する。
import { describe, it, expect } from 'vitest';
import { loadGrammarPools, MIN_BUNDLE_QUESTIONS } from './advContent';

describe('全バンクの束が攻略可能', () => {
  it('**問題数が17問未満の束が1つも無い**（初級・N3・N2すべて）', async () => {
    const p = await loadGrammarPools();
    const thin: string[] = [];
    for (const id of new Set(p.n3BundleByItem.values())) {
      const n = (p.byItem.get(id) ?? []).length;
      if (n < MIN_BUNDLE_QUESTIONS) thin.push(`${id}: ${n}問`);
    }
    expect(thin, `攻略不能な束: ${thin.join(', ')}`).toEqual([]);
  }, 120_000);

  it('合流で消えた単元IDが束として残っていない（永久に待つstageを作らない）', async () => {
    const p = await loadGrammarPools();
    const bundles = new Set(p.n3BundleByItem.values());
    for (const b of bundles) {
      expect((p.byItem.get(b) ?? []).length, `${b} が空`).toBeGreaterThan(0);
    }
    // 単元→束の対応は必ず実在する束を指す
    for (const [, b] of p.basicBundleByUnit) expect(bundles.has(b) || p.basicByUnit.has(b)).toBe(true);
  }, 120_000);

  it('全項目がどこかの束に属している（学べない文法を作らない）', async () => {
    const p = await loadGrammarPools();
    for (const id of p.n3Ids) expect(p.n3BundleByItem.get(id), id).toBeTruthy();
    for (const id of p.n2Ids) expect(p.n3BundleByItem.get(id), id).toBeTruthy();
  }, 120_000);
});
