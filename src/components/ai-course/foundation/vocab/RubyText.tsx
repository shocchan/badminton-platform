// 構造化ふりがな表示（Phase 2D §11-§12／Phase 2E-1 §11-§13）。HTML文字列挿入禁止・ruby/rt使用。
// 見出し語は語全体ルビ（RubyWord）。例文はFuriganaSegment[]（vocabFurigana.ts）で語別表示。
// 読み問題中は対象語のrubyを隠す（hideTargetReading）。読みをalt/ariaへ漏らさない。
export interface FuriganaSegment {
  text: string;
  reading?: string;
  /** 'hard'=難読・現在目標より上の語（hard_only設定で表示対象） */
  level?: 'hard';
  isTarget?: boolean;
}

/** ふりがな表示モード（設定から解決した実効値・§13） */
export type FuriganaDisplayMode = 'all' | 'hard' | 'none';

export const RubyWord = ({ text, reading, show }: { text: string; reading: string; show: boolean }) => (
  show ? (
    // 読みを支援技術へ二重読みさせない（rt は aria-hidden。AdvRuby.tsx と同じ方針）
    <ruby className="[&>rt]:text-[0.6em] [&>rt]:text-gray-500">{text}<rt aria-hidden>{reading}</rt></ruby>
  ) : (
    <span>{text}</span>
  )
);

export const RubySegments = ({ segments, mode = 'all', show, hideTargetReading }: {
  segments: FuriganaSegment[];
  /** all=読みのある全セグメント／hard=難読のみ／none=非表示 */
  mode?: FuriganaDisplayMode;
  /** 後方互換: show=false は mode='none' と同じ */
  show?: boolean;
  hideTargetReading?: boolean;
}) => {
  const effective: FuriganaDisplayMode = show === false ? 'none' : mode;
  return (
    <>
      {segments.map((seg, i) => {
        const allowed = effective === 'all' || (effective === 'hard' && seg.level === 'hard');
        const visible = allowed && !!seg.reading && !(hideTargetReading && seg.isTarget);
        return visible
          // 読みを支援技術へ二重読みさせない（rt は aria-hidden。AdvRuby.tsx と同じ方針）
          ? <ruby key={i} className="[&>rt]:text-[0.6em] [&>rt]:text-gray-500">{seg.text}<rt aria-hidden>{seg.reading}</rt></ruby>
          : <span key={i}>{seg.text}</span>;
      })}
    </>
  );
};
