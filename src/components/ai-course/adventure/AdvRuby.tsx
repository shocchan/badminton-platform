// ふりがな（ルビ）表示。2026-08-19 新設。
//
// 背景: 本物のJLPT N5/N4の問題用紙は漢字にふりがなが付くが、このアプリには無く、
// かなを覚えたての生徒が本文を読めなかった（CEO指摘）。
//
// 設計（foundation の RubyText.tsx と同じ原則）:
// - HTML文字列注入禁止。React の <ruby>/<rt> だけで組む
// - 読みを alt / aria へ漏らさない（rt は aria-hidden。スクリーンリーダーは本文だけ読む）
// - **答えが透ける場所には絶対に使わない**: kanji-* 問題・語彙の読み方問題・選択肢には
//   このコンポーネントを配線しないこと（vocabQuestions の答え漏れ対策と同じ理由）
// - 読みデータが本文と食い違うときは**ルビを出さない**（誤読を見せるくらいなら素の本文）
//
// 読みデータの形式・純関数は advRubySegment.ts（`[表記|よみ]` 注釈と、かな全文の復元）。
import {
  parseRubyAnnotated, stripRuby, alignFurigana, hasKanji, type AdvRubySegment,
} from './advRubySegment';

/**
 * 本文をルビ付きで描画する。
 * - show=false → 素の本文
 * - ruby（注釈付き本文）があれば、剥がした結果が text と完全一致するときだけ使う
 * - kana（かな全文）があれば alignFurigana で復元できたときだけ使う
 * - どちらも成立しなければ素の本文（誤ったルビは絶対に出さない）
 */
export function AdvRuby({ text, ruby, kana, show }: {
  text: string;
  ruby?: string | null;
  kana?: string | null;
  show: boolean;
}) {
  let segments: AdvRubySegment[] | null = null;
  if (show && ruby && stripRuby(ruby) === text) segments = parseRubyAnnotated(ruby);
  else if (show && kana) segments = alignFurigana(text, kana);
  if (!segments) return <>{text}</>;
  return (
    <>
      {segments.map((seg, i) => (
        seg.reading && hasKanji(seg.text)
          ? (
            <ruby key={i} className="[&>rt]:text-[0.6em] [&>rt]:font-normal [&>rt]:text-gray-500">
              {seg.text}
              {/* 読みを支援技術へ二重読みさせない（RubyText.tsx と同じ方針） */}
              <rt aria-hidden>{seg.reading}</rt>
            </ruby>
          )
          : <span key={i}>{seg.text}</span>
      ))}
    </>
  );
}

export default AdvRuby;
