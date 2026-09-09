/*
 * 学習テーマの棚（2026-09-09 CEO要望）。
 * 「N1の人はN1からN5のテーマ全部が選択できて…N3ならN3〜N5」
 */
import { describe, it, expect } from 'vitest';
import { themesAtOrBelow, themeView } from './vocabThemePicker';

describe('themesAtOrBelow', () => {
  it('N1の人は N1〜N5 の5つから選べる（自分の級が先頭）', () => {
    expect(themesAtOrBelow('N1').map((t) => t.level)).toEqual(['N1', 'N2', 'N3', 'N4', 'N5']);
  });

  it('N3の人は N3〜N5 の3つ（**上の級は出さない**）', () => {
    expect(themesAtOrBelow('N3').map((t) => t.level)).toEqual(['N3', 'N4', 'N5']);
  });

  it('N5の人はN5だけ', () => {
    expect(themesAtOrBelow('N5').map((t) => t.level)).toEqual(['N5']);
  });

  it('級が決まらない人には何も出さない（当てずっぽうの棚を作らない）', () => {
    expect(themesAtOrBelow(null)).toEqual([]);
    expect(themesAtOrBelow(undefined)).toEqual([]);
  });
});

describe('themeView', () => {
  it('日本語と中国語の両方がある。かなが混ざらない', () => {
    for (const t of themesAtOrBelow('N1')) {
      const zh = themeView(t, 'zh');
      const ja = themeView(t, 'ja');
      expect(ja.label).toContain(t.level);
      expect(zh.label).toContain(t.level);
      expect(/[ぁ-んァ-ヴ]/.test(zh.label + zh.desc), `${t.level} 中国語にかな`).toBe(false);
    }
  });

  it('説明は「何のことばか」だけ。売り文句を入れない', () => {
    for (const t of themesAtOrBelow('N1')) {
      for (const ng of ['おすすめ', '人気', '今すぐ', '必ず']) {
        expect(t.descJa.includes(ng), `${t.level}: ${t.descJa}`).toBe(false);
      }
    }
  });
});
