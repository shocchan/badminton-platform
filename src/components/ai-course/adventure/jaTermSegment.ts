// 中国語テキスト中の日本語部分を切り出す（表示側で視覚分離するため）。
// component ファイルから分離（fast refreshはcomponentのみexportするファイルで動くため）。
/** 仮名を含む連なり＝日本語の学習対象とみなす（純漢字は中国語として読めるので対象外） */
const JA_RUN = /[ぁ-ゟァ-ヺㇰ-ㇿ一-鿿ー〜～]+/g;
const HAS_KANA = /[ぁ-ゟァ-ヺㇰ-ㇿ]/;

export const segmentJapanese = (text: string): { text: string; isJa: boolean }[] => {
  const out: { text: string; isJa: boolean }[] = [];
  let last = 0;
  for (const m of text.matchAll(JA_RUN)) {
    const start = m.index ?? 0;
    const run = m[0];
    if (!HAS_KANA.test(run)) continue; // 漢字だけ＝中国語の地の文
    if (start > last) out.push({ text: text.slice(last, start), isJa: false });
    out.push({ text: run, isJa: true });
    last = start + run.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), isJa: false });
  return out.length > 0 ? out : [{ text, isJa: false }];
};

