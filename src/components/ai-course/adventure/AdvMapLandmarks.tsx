// 冒険マップの地域ランドマーク（すべて自作SVG）。
//
// - **外部ゲーム・既存IPの素材は使わない。** 単純な図形の組み合わせだけで描く
// - 地域ごとに形をはっきり変える（同じ丸が並ぶと「どこも同じ」に見える）
// - 色だけで状態を伝えない（状態は枠線の太さ・霧・ラベルでも示す）
import type { LandmarkKind } from '../../../lib/aiLesson/course/adventure/advMapModel';

interface Props { kind: LandmarkKind; size?: number; muted?: boolean }

/** 未解放は彩度を落とす。ただし色だけに意味を持たせない（霧とラベルが本体） */
const palette = (muted: boolean) => ({
  base: muted ? '#cbd5e1' : '#60a5fa',
  deep: muted ? '#94a3b8' : '#2563eb',
  warm: muted ? '#d6d3d1' : '#f59e0b',
  green: muted ? '#cbd5e1' : '#34d399',
  roof: muted ? '#a8a29e' : '#f87171',
});

export const LandmarkIcon = ({ kind, size = 44, muted = false }: Props) => {
  const c = palette(muted);
  const s = { width: size, height: size };
  const common = { viewBox: '0 0 48 48', ...s, 'aria-hidden': true as const, focusable: 'false' as const };

  switch (kind) {
    case 'camp': // 基礎キャンプ: テント
      return (
        <svg {...common}><path d="M24 10 L40 38 H8 Z" fill={c.warm} />
          <path d="M24 10 L24 38" stroke="#fff" strokeWidth="2" />
          <path d="M18 38 L24 26 L30 38 Z" fill={c.deep} /></svg>
      );
    case 'bridge': // N3の橋
      return (
        <svg {...common}><path d="M4 30 Q24 12 44 30" stroke={c.deep} strokeWidth="4" fill="none" />
          <path d="M4 34 H44" stroke={c.base} strokeWidth="4" />
          <path d="M14 22 V34 M24 17 V34 M34 22 V34" stroke={c.deep} strokeWidth="2" /></svg>
      );
    case 'ruins': // カタチの遺跡: 柱
      return (
        <svg {...common}><rect x="8" y="16" width="6" height="22" fill={c.base} />
          <rect x="21" y="12" width="6" height="26" fill={c.deep} />
          <rect x="34" y="18" width="6" height="20" fill={c.base} />
          <rect x="6" y="10" width="36" height="4" fill={c.warm} /></svg>
      );
    case 'gate': // N2の門
      return (
        <svg {...common}><rect x="6" y="14" width="36" height="5" fill={c.roof} />
          <rect x="11" y="19" width="6" height="19" fill={c.deep} />
          <rect x="31" y="19" width="6" height="19" fill={c.deep} />
          <rect x="9" y="23" width="30" height="4" fill={c.roof} /></svg>
      );
    case 'tower': // ソラノ塔
      return (
        <svg {...common}><rect x="17" y="14" width="14" height="24" fill={c.base} />
          <path d="M24 4 L34 16 H14 Z" fill={c.deep} />
          <rect x="21" y="20" width="6" height="7" fill="#fff" />
          <rect x="21" y="30" width="6" height="8" fill={c.deep} /></svg>
      );
    case 'library': // 読解・聴解の館
      return (
        <svg {...common}><rect x="8" y="18" width="32" height="20" fill={c.base} />
          <path d="M6 18 L24 8 L42 18 Z" fill={c.deep} />
          <rect x="14" y="24" width="8" height="14" fill="#fff" />
          <rect x="26" y="24" width="8" height="9" fill="#fff" /></svg>
      );
    case 'castle': // 総合模試の城
      return (
        <svg {...common}><rect x="8" y="18" width="32" height="20" fill={c.base} />
          <path d="M8 18 v-6 h5 v4 h5 v-4 h6 v4 h5 v-4 h5 v6" fill={c.deep} />
          <rect x="21" y="26" width="6" height="12" fill={c.warm} /></svg>
      );
    case 'village': // 自己紹介の村
      return (
        <svg {...common}><rect x="10" y="24" width="12" height="14" fill={c.base} />
          <path d="M8 24 L16 16 L24 24 Z" fill={c.roof} />
          <rect x="27" y="28" width="10" height="10" fill={c.base} />
          <path d="M25 28 L32 22 L39 28 Z" fill={c.roof} /></svg>
      );
    case 'road': // 思い出の道
      return (
        <svg {...common}><path d="M14 40 Q24 24 34 8" stroke={c.base} strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M14 40 Q24 24 34 8" stroke="#fff" strokeWidth="2" strokeDasharray="4 5" fill="none" /></svg>
      );
    case 'hill': // 変化の丘
      return (
        <svg {...common}><path d="M4 38 Q16 18 26 38 Z" fill={c.green} />
          <path d="M20 38 Q32 14 44 38 Z" fill={c.base} /></svg>
      );
    case 'avenue': // 習慣の並木道
      return (
        <svg {...common}><path d="M18 40 L30 40 L27 10 L21 10 Z" fill={c.base} opacity="0.5" />
          <circle cx="12" cy="18" r="6" fill={c.green} /><rect x="11" y="22" width="2" height="12" fill={c.deep} />
          <circle cx="36" cy="18" r="6" fill={c.green} /><rect x="35" y="22" width="2" height="12" fill={c.deep} /></svg>
      );
    case 'town': // お願いの街
      return (
        <svg {...common}><rect x="8" y="20" width="9" height="18" fill={c.base} />
          <rect x="20" y="12" width="10" height="26" fill={c.deep} />
          <rect x="33" y="24" width="8" height="14" fill={c.base} />
          <rect x="22" y="16" width="3" height="3" fill="#fff" /><rect x="26" y="16" width="3" height="3" fill="#fff" /></svg>
      );
    case 'plaza': // 相談の広場
      return (
        <svg {...common}><circle cx="24" cy="26" r="14" fill={c.base} opacity="0.35" />
          <circle cx="24" cy="26" r="7" fill={c.deep} />
          <path d="M24 8 v6 M10 26 h6 M32 26 h6 M24 38 v-6" stroke={c.deep} strokeWidth="3" strokeLinecap="round" /></svg>
      );
    case 'mountain': // 意見を伝える山
      return (
        <svg {...common}><path d="M4 40 L20 12 L30 28 L36 20 L44 40 Z" fill={c.base} />
          <path d="M20 12 L26 22 H14 Z" fill="#fff" /></svg>
      );
    case 'crossroad': // 選択の分かれ道
      return (
        <svg {...common}><path d="M24 42 V26" stroke={c.base} strokeWidth="8" strokeLinecap="round" />
          <path d="M24 26 L12 8" stroke={c.base} strokeWidth="7" strokeLinecap="round" />
          <path d="M24 26 L38 10" stroke={c.deep} strokeWidth="7" strokeLinecap="round" /></svg>
      );
    case 'forest': // 推測の霧の森
      return (
        <svg {...common}><path d="M14 34 L8 34 L14 20 L20 34 Z" fill={c.green} />
          <path d="M32 36 L24 36 L32 16 L40 36 Z" fill={c.deep} />
          <rect x="13" y="34" width="2" height="6" fill="#78716c" /><rect x="31" y="36" width="2" height="5" fill="#78716c" />
          <path d="M6 28 q10 -4 18 0 q10 4 18 0" stroke="#fff" strokeWidth="3" fill="none" opacity="0.8" /></svg>
      );
    case 'city': // 仕事と暮らしの町
    default:
      return (
        <svg {...common}><rect x="7" y="16" width="10" height="22" fill={c.deep} />
          <rect x="20" y="10" width="10" height="28" fill={c.base} />
          <rect x="33" y="22" width="8" height="16" fill={c.deep} />
          <rect x="22" y="14" width="2" height="2" fill="#fff" /><rect x="26" y="14" width="2" height="2" fill="#fff" />
          <rect x="22" y="20" width="2" height="2" fill="#fff" /><rect x="26" y="20" width="2" height="2" fill="#fff" /></svg>
      );
  }
};
