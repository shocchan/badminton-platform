// Phase R2: Unit単位lazy chunk境界のガード。
import { describe, it, expect } from 'vitest';
import { N2_GRAMMAR_DRAFTS } from './n2GrammarDrafts';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile, loadN2DraftsByUnit } from './n2GrammarDraftChunks';

describe('N2 draft Unit lazy chunk', () => {
  it('全Unitファイルの合併 = 集約173件（欠落・重複なし）', async () => {
    const parts = await Promise.all(N2_UNIT_FILE_NUMBERS.map(loadN2DraftUnitFile));
    const ids = parts.flat().map(d => d.grammarId);
    expect(ids.length).toBe(173);
    expect(new Set(ids).size).toBe(173);
    expect(new Set(ids)).toEqual(new Set(N2_GRAMMAR_DRAFTS.map(d => d.grammarId)));
  });
  it('unit属性ロードは繰越（Unit4/5ファイル内のunit3/4項目）も正しく回収する', async () => {
    for (let u = 1; u <= 12; u++) {
      const byUnit = await loadN2DraftsByUnit(u);
      const expected = N2_GRAMMAR_DRAFTS.filter(d => d.unit === u);
      expect(byUnit.map(d => d.grammarId).sort()).toEqual(expected.map(d => d.grammarId).sort());
      for (const d of byUnit) expect(d.unit).toBe(u);
    }
  });
  it('存在しないUnitファイル番号は空配列', async () => {
    expect(await loadN2DraftUnitFile(99)).toEqual([]);
  });
});
