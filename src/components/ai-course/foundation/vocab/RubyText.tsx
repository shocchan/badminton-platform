// 構造化ふりがな表示（Phase 2D §11-§12）。HTML文字列挿入禁止・ruby/rt使用。
// MVP: 見出し語は語全体ルビ（readingKana）。例文の語別セグメントはFuriganaSegment[]で拡張可能。
export interface FuriganaSegment { text: string; reading?: string; isTarget?: boolean }

export const RubyWord = ({ text, reading, show }: { text: string; reading: string; show: boolean }) => (
  show ? (
    <ruby className="[&>rt]:text-[0.55em] [&>rt]:text-gray-500">{text}<rt>{reading}</rt></ruby>
  ) : (
    <span>{text}</span>
  )
);

export const RubySegments = ({ segments, show, hideTargetReading }: {
  segments: FuriganaSegment[]; show: boolean; hideTargetReading?: boolean;
}) => (
  <>
    {segments.map((s, i) => {
      const visible = show && !!s.reading && !(hideTargetReading && s.isTarget);
      return visible
        ? <ruby key={i} className="[&>rt]:text-[0.55em] [&>rt]:text-gray-500">{s.text}<rt>{s.reading}</rt></ruby>
        : <span key={i}>{s.text}</span>;
    })}
  </>
);
