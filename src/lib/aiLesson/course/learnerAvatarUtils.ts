// イニシャルアバターの純関数（fast-refresh規約のためコンポーネントと分離）

/** 先頭grapheme（サロゲートペア・絵文字を壊さない）。Intl.Segmenter非対応環境はcode point先頭 */
export const firstGrapheme = (name: string): string => {
  const t = name.trim();
  if (!t) return '';
  try {
    if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
      const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
      const first = seg.segment(t)[Symbol.iterator]().next().value as { segment: string } | undefined;
      if (first?.segment) return first.segment;
    }
  } catch { /* fallbackへ */ }
  return Array.from(t)[0] ?? '';
};

/** ニックネームから決定的に色indexを選ぶ（0..3・同じ人は毎回同じ） */
export const paletteIndexFor = (name: string): number => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return h % 4;
};
