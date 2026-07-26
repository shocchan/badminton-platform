// 本人アバター（Phase Avatar 1: イニシャルのみ）。将来 imageSrc（signed URL）を渡せば
// 画像表示に差し替わる最小構造。読み込み失敗・空値は常にイニシャルへfallback。
// 色はニックネームから決定的に選ぶ（同じ人は毎回同じ・ブランド調和の4色のみ）。

import { useState } from 'react';
import { UserRound } from 'lucide-react';

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

// ブランド調和の落ち着いた4色（派手な多色にしない）
const PALETTE = [
  { bg: 'bg-blue-100', fg: 'text-blue-700' },
  { bg: 'bg-emerald-100', fg: 'text-emerald-700' },
  { bg: 'bg-amber-100', fg: 'text-amber-700' },
  { bg: 'bg-rose-100', fg: 'text-rose-700' },
];
export const paletteIndexFor = (name: string): number => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) % 997;
  return h % PALETTE.length;
};

interface Props {
  displayName: string;
  /** 将来のアバター画像（短時間signed URL想定）。今回は未接続 */
  imageSrc?: string | null;
  size?: number;
  /** 装飾（隣に名前テキストがある）なら true で読み上げ重複を防ぐ */
  decorative?: boolean;
  altSuffix?: string; // 「〇〇さんのアバター」相当（ja/zhは呼び出し側で）
  className?: string;
}

export const LearnerAvatar = ({ displayName, imageSrc = null, size = 40, decorative = false, altSuffix = '', className = '' }: Props) => {
  const [broken, setBroken] = useState(false);
  const initial = firstGrapheme(displayName);
  const pal = PALETTE[paletteIndexFor(displayName || '?')];
  if (imageSrc && !broken) {
    return (
      <img src={imageSrc} width={size} height={size} onError={() => setBroken(true)}
        alt={decorative ? '' : `${displayName}${altSuffix}`} aria-hidden={decorative || undefined}
        className={`rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${displayName}${altSuffix}`}
      className={`inline-flex items-center justify-center rounded-full font-bold select-none ${pal.bg} ${pal.fg} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial || <UserRound aria-hidden="true" style={{ width: size * 0.55, height: size * 0.55 }} />}
    </span>
  );
};
