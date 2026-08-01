// 中国語画面で「日本語の学習対象」と「中国語の説明」を視覚的に分ける（COMPLETION §4・§17）。
//
// 既存の中国語解説は「用た形」「音がする」のように日本語を地の文へ混ぜて書かれている。
// 教材の全面書き換えは禁止のため、**表示側で日本語部分を検出して別スタイルにする**。
// 学習者には「これは日本語（学習対象）」「これは中国語（説明）」が一目で分かる。
import type { ReactNode } from 'react';

/** 仮名を含む連なり＝日本語の学習対象とみなす（純漢字は中国語として読めるので対象外） */
const JA_RUN = /[ぁ-ゟァ-ヺㇰ-ㇿ一-鿿ー〜～]+/g;
const HAS_KANA = /[ぁ-ゟァ-ヺㇰ-ㇿ]/;

export interface JaTermTextProps {
  text: string;
  /** ja画面では分離しない（全体が日本語のため） */
  lang: 'ja' | 'zh';
  className?: string;
}

/**
 * 中国語テキスト中の日本語を <span> で囲んで返す。
 * すでに「」で囲まれている箇所も同じスタイルへ揃える（引用符は残す）。
 */
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

export function JaTermText({ text, lang, className }: JaTermTextProps): ReactNode {
  if (lang === 'ja' || !text) return <span className={className}>{text}</span>;
  const parts = segmentJapanese(text);
  if (parts.every((p) => !p.isJa)) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {parts.map((p, i) => (p.isJa
        ? (
          <span key={`${i}-ja`} lang="ja"
            className="rounded bg-indigo-50 px-1 font-medium text-indigo-900">
            {p.text}
          </span>
        )
        : <span key={`${i}-zh`} lang="zh">{p.text}</span>))}
    </span>
  );
}

export default JaTermText;
