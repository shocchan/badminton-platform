// Phase 2E-1.15 §12: 主要な色の組み合わせのコントラスト比。
//
// 外部サービスも追加ライブラリも使わず、WCAGの相対輝度の式をそのまま実装して計算する。
// 対象は初回Journey・Step4・Recoveryで実際に使っている組み合わせだけ。
// アプリ全体のテーマは変更しない（基準未達が出たらこのPhaseの画面に限って代替色を使う）。
import { describe, it, expect } from 'vitest';

/** Tailwind v4 の既定パレットのうち、この画面で使っている色 */
const COLOR = {
  white: '#ffffff',
  gray50: '#f9fafb',
  gray100: '#f3f4f6',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',
  indigo50: '#eef2ff',
  indigo100: '#e0e7ff',
  indigo400: '#818cf8',
  indigo500: '#6366f1',
  indigo600: '#4f46e5',
  indigo700: '#4338ca',
  indigo800: '#3730a3',
  emerald500: '#10b981',
  emerald700: '#047857',
  amber50: '#fffbeb',
  amber700: '#b45309',
  amber800: '#92400e',
  orange700: '#c2410c',
} as const;

const srgbToLinear = (c: number): number =>
  (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** WCAG 2.x の相対輝度 */
export const relativeLuminance = (hex: string): number => {
  const n = hex.replace('#', '');
  const r = parseInt(n.slice(0, 2), 16) / 255;
  const g = parseInt(n.slice(2, 4), 16) / 255;
  const b = parseInt(n.slice(4, 6), 16) / 255;
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
};

/** コントラスト比（1〜21） */
export const contrastRatio = (fg: string, bg: string): number => {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
};

const round = (n: number) => Math.round(n * 100) / 100;

describe('コントラスト比の計算', () => {
  it('黒と白は21:1になる（式の妥当性）', () => {
    expect(round(contrastRatio('#000000', '#ffffff'))).toBe(21);
  });
  it('同じ色どうしは1:1になる', () => {
    expect(round(contrastRatio(COLOR.gray600, COLOR.gray600))).toBe(1);
  });
});

/** 本文・主要CTA・エラー・focus は AA（通常文字 4.5:1）を満たすこと */
describe('通常文字 AA（4.5:1）を満たすべき組み合わせ', () => {
  const cases: [string, string, string][] = [
    ['本文（白地）', COLOR.gray900, COLOR.white],
    ['本文（薄い灰地）', COLOR.gray900, COLOR.gray50],
    ['本文の次に濃い文字', COLOR.gray800, COLOR.white],
    ['説明文', COLOR.gray700, COLOR.white],
    ['補助説明', COLOR.gray600, COLOR.white],
    ['主要CTAの文字', COLOR.white, COLOR.indigo600],
    ['補助CTAの文字', COLOR.gray600, COLOR.white],
    ['見出しの強調（薄い藍地）', COLOR.indigo800, COLOR.indigo50],
    ['検証モードの注意文', COLOR.amber800, COLOR.amber50],
    ['保存失敗の警告', COLOR.orange700, COLOR.white],
    ['グラフのラベル', COLOR.gray700, COLOR.white],
    ['正解の数値', COLOR.emerald700, COLOR.white],
    ['タイムラインの強調ラベル', COLOR.indigo700, COLOR.white],
  ];
  it.each(cases)('%s は 4.5:1 以上', (_label, fg, bg) => {
    expect(round(contrastRatio(fg, bg))).toBeGreaterThanOrEqual(4.5);
  });
});

/**
 * 小さな補助文字（10-11px）は装飾に近く、同じ情報が必ず本文にもある。
 * それでも読めなさすぎないよう、3:1（AA大文字相当）は満たすことを確認する。
 */
describe('小さな補助文字は 3:1 以上', () => {
  // 計測の結果 gray-400 は白地で 2.54 と基準未達だったため、この画面では gray-500 を使う
  const cases: [string, string, string][] = [
    ['未来のステップ番号', COLOR.gray500, COLOR.gray100],
    ['予定なしの日付', COLOR.gray500, COLOR.white],
    ['まだ進んでいない段階', COLOR.gray500, COLOR.white],
  ];
  it.each(cases)('%s は 3:1 以上', (_label, fg, bg) => {
    expect(round(contrastRatio(fg, bg))).toBeGreaterThanOrEqual(3);
  });
});

describe('focus ring は背景から見分けられる', () => {
  // indigo-400 は白地で 2.98 とわずかに未達だったため、focus ring には indigo-500 を使う
  it('focus ringの色は白地に対して 3:1 以上', () => {
    expect(round(contrastRatio(COLOR.indigo500, COLOR.white))).toBeGreaterThanOrEqual(3);
  });
  it('計測の記録: indigo-400 は 3:1 に届かない', () => {
    expect(round(contrastRatio(COLOR.indigo400, COLOR.white))).toBeLessThan(3);
  });
});
