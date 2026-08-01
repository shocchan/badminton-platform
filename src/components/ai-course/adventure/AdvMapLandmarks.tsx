// 冒険マップの地域イラスト（すべて自作SVG）。
//
// - **外部ゲーム・既存IPの素材は使わない。** 単純な図形の組み合わせだけで描く
// - 地域ごとに形をはっきり変える（同じ丸が並ぶと「どこも同じ」に見える）
// - **形だけでなく空と地面の色も変える**（`tone`）。小さく描くと形の差は消えるので、
//   時間帯・気候で「別の場所へ来た」と分かるようにする
// - 色だけで状態を伝えない（状態は枠線の太さ・霧・ラベルでも示す）
// - 文字は描かない（翻訳できないため。地名は必ずHTML側で出す）
import { useId } from 'react';
import type { LandmarkKind, MapTone } from '../../../lib/aiLesson/course/adventure/advMapModel';

/* ────────────────────────────────────────────────────────────
   色調（時間帯・気候）
   ──────────────────────────────────────────────────────────── */

interface Tone {
  skyTop: string; skyBottom: string;
  /** 太陽/月 */ orb: string;
  /** 遠くの山なみ */ farHill: string; nearHill: string;
  /** 地面 */ ground: string; groundEdge: string;
  /** 建物の主色・陰・屋根 */ base: string; deep: string; roof: string;
  /** 木・草 */ leaf: string;
  night: boolean;
}

const TONES: Record<MapTone, Tone> = {
  dawn: {
    skyTop: '#ffd9a8', skyBottom: '#ffeede', orb: '#ffb545',
    farHill: '#e0b58f', nearHill: '#c9926b',
    ground: '#e8d5ae', groundEdge: '#d3ba8d',
    base: '#f4e4cf', deep: '#b98a5c', roof: '#e2705f', leaf: '#9cbf76', night: false,
  },
  meadow: {
    skyTop: '#a9dcff', skyBottom: '#e4f6ff', orb: '#fff0b0',
    farHill: '#9ecf9a', nearHill: '#7cbb77',
    ground: '#9ed685', groundEdge: '#79bd63',
    base: '#fdf6ea', deep: '#7a9b5e', roof: '#ef8a6a', leaf: '#4e9e50', night: false,
  },
  forest: {
    skyTop: '#bfe0d4', skyBottom: '#e8f5ef', orb: '#ffffff',
    farHill: '#7fae95', nearHill: '#5d9179',
    ground: '#6fa886', groundEdge: '#4f8a69',
    base: '#eef3ea', deep: '#3f6f57', roof: '#c96a55', leaf: '#2f7d54', night: false,
  },
  water: {
    skyTop: '#a5d8f5', skyBottom: '#e6f6ff', orb: '#fff4c9',
    farHill: '#8ab9d6', nearHill: '#6aa3c6',
    ground: '#7cc3e8', groundEdge: '#589fc9',
    base: '#f2f8fc', deep: '#3d7fa8', roof: '#e78a6d', leaf: '#79b58c', night: false,
  },
  stone: {
    skyTop: '#cdd6e0', skyBottom: '#eef2f6', orb: '#ffffff',
    farHill: '#a9b2bd', nearHill: '#8d97a4',
    ground: '#c3bcae', groundEdge: '#a49b8b',
    base: '#e7e2d6', deep: '#8b8375', roof: '#b5705f', leaf: '#8ba674', night: false,
  },
  sunset: {
    skyTop: '#f8a07e', skyBottom: '#ffe0c2', orb: '#ff8a4c',
    farHill: '#b5738b', nearHill: '#93566f',
    ground: '#c48f7c', groundEdge: '#a06e5e',
    base: '#ffeede', deep: '#8a5566', roof: '#d4544f', leaf: '#8f9b62', night: false,
  },
  sky: {
    skyTop: '#8ec8ff', skyBottom: '#dbeeff', orb: '#ffffff',
    farHill: '#b9d6ef', nearHill: '#9dc3e4',
    ground: '#cfe3f5', groundEdge: '#a9c8e4',
    base: '#ffffff', deep: '#4a7fb5', roof: '#6c9fd6', leaf: '#8fbfa0', night: false,
  },
  night: {
    skyTop: '#2b3560', skyBottom: '#4d5a8c', orb: '#ffeaa8',
    farHill: '#39456f', nearHill: '#2c3557',
    ground: '#3b4468', groundEdge: '#2a3251',
    base: '#c8cfe6', deep: '#5b6795', roof: '#8d6fa8', leaf: '#3f6f6a', night: true,
  },
};

/* ────────────────────────────────────────────────────────────
   背景（空・遠景・地面）
   ──────────────────────────────────────────────────────────── */

/** 地面の高さ。ランドマークはこの線の上に立たせる */
const GROUND_Y = 82;

const Backdrop = ({ c, gid }: { c: Tone; gid: string }) => (
  <>
    <defs>
      <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={c.skyTop} />
        <stop offset="100%" stopColor={c.skyBottom} />
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="160" height="110" fill={`url(#${gid})`} />

    {/* 太陽 or 月。夜だけ星を足す */}
    {c.night ? (
      <>
        <circle cx="124" cy="24" r="11" fill={c.orb} />
        <circle cx="119" cy="21" r="10" fill={c.skyTop} />
        <circle cx="28" cy="18" r="1.4" fill="#fff" opacity="0.9" />
        <circle cx="52" cy="30" r="1" fill="#fff" opacity="0.7" />
        <circle cx="76" cy="14" r="1.2" fill="#fff" opacity="0.8" />
        <circle cx="98" cy="40" r="1" fill="#fff" opacity="0.6" />
      </>
    ) : (
      <>
        <circle cx="128" cy="24" r="12" fill={c.orb} opacity="0.85" />
        <ellipse cx="34" cy="24" rx="16" ry="7" fill="#fff" opacity="0.65" />
        <ellipse cx="46" cy="21" rx="11" ry="6" fill="#fff" opacity="0.55" />
      </>
    )}

    {/* 遠景の山なみ。2枚重ねると奥行きが出る */}
    <path d={`M-4 ${GROUND_Y} L26 46 L52 ${GROUND_Y} Z`} fill={c.farHill} opacity="0.75" />
    <path d={`M34 ${GROUND_Y} L70 40 L104 ${GROUND_Y} Z`} fill={c.farHill} opacity="0.9" />
    <path d={`M92 ${GROUND_Y} L124 52 L164 ${GROUND_Y} Z`} fill={c.nearHill} opacity="0.8" />

    {/* 地面 */}
    <path d={`M-4 ${GROUND_Y} Q80 ${GROUND_Y - 6} 164 ${GROUND_Y} L164 114 L-4 114 Z`} fill={c.ground} />
    <path d={`M-4 ${GROUND_Y} Q80 ${GROUND_Y - 6} 164 ${GROUND_Y}`} fill="none" stroke={c.groundEdge} strokeWidth="2" />
  </>
);

/** 手前の草・石。地面が単色だと「板」に見えるので必ず何か置く */
const Foreground = ({ c }: { c: Tone }) => (
  <g opacity="0.85">
    <path d="M10 106 q3 -8 6 0" fill="none" stroke={c.groundEdge} strokeWidth="2.5" strokeLinecap="round" />
    <path d="M22 108 q2 -6 4 0" fill="none" stroke={c.groundEdge} strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="140" cy="104" rx="9" ry="3.5" fill={c.groundEdge} />
    <path d="M148 107 q3 -7 6 0" fill="none" stroke={c.groundEdge} strokeWidth="2.5" strokeLinecap="round" />
  </g>
);

/** 曲がりくねった小道。「ここへ向かう」感じを足すために多くの地域で使う */
const Path = ({ c }: { c: Tone }) => (
  <path d={`M78 ${GROUND_Y} C 72 92, 56 96, 40 110`} fill="none"
    stroke={c.groundEdge} strokeWidth="7" strokeLinecap="round" opacity="0.55" />
);

/** 木。前景の賑やかしに使い回す */
const Tree = ({ c, x, y, s = 1 }: { c: Tone; x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x="-1.5" y="-6" width="3" height="10" fill={c.deep} />
    <circle cx="0" cy="-10" r="7" fill={c.leaf} />
    <circle cx="-4" cy="-6" r="5" fill={c.leaf} />
    <circle cx="4" cy="-6" r="5" fill={c.leaf} />
  </g>
);

/* ────────────────────────────────────────────────────────────
   地域ごとのランドマーク（地面の上に建てる）
   ──────────────────────────────────────────────────────────── */

const landmarkOf = (kind: LandmarkKind, c: Tone) => {
  const g = GROUND_Y;
  switch (kind) {
    case 'camp': // 基礎キャンプ: テントと焚き火
      return (
        <g>
          <Path c={c} />
          <path d={`M60 ${g} L80 ${g - 30} L100 ${g} Z`} fill={c.roof} />
          <path d={`M80 ${g - 30} L80 ${g}`} stroke="#fff" strokeWidth="2" />
          <path d={`M72 ${g} L80 ${g - 16} L88 ${g} Z`} fill={c.deep} />
          <path d={`M110 ${g} l4 -8 l4 8 Z`} fill="#f59e0b" />
          <path d={`M106 ${g} h16`} stroke={c.deep} strokeWidth="2.5" strokeLinecap="round" />
          <Tree c={c} x={40} y={g} s={0.9} />
        </g>
      );
    case 'bridge': // N3の橋（川を渡る）
      return (
        <g>
          <path d={`M-4 ${g} Q80 ${g + 12} 164 ${g} L164 114 L-4 114 Z`} fill={c.night ? '#31406e' : '#7cc3e8'} opacity="0.9" />
          <path d={`M24 ${g - 2} Q80 ${g - 34} 136 ${g - 2}`} stroke={c.deep} strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d={`M22 ${g + 4} H138`} stroke={c.base} strokeWidth="6" strokeLinecap="round" />
          <path d={`M46 ${g - 16} V${g + 4} M80 ${g - 22} V${g + 4} M114 ${g - 16} V${g + 4}`}
            stroke={c.deep} strokeWidth="2.5" />
          <Tree c={c} x={14} y={g + 2} s={0.8} />
        </g>
      );
    case 'ruins': // カタチの遺跡: 柱と横木
      return (
        <g>
          <Path c={c} />
          <rect x="46" y={g - 34} width="9" height="34" fill={c.base} />
          <rect x="64" y={g - 42} width="9" height="42" fill={c.base} />
          <rect x="82" y={g - 38} width="9" height="38" fill={c.base} />
          <rect x="100" y={g - 28} width="9" height="28" fill={c.deep} opacity="0.8" />
          <rect x="42" y={g - 48} width="53" height="7" fill={c.deep} />
          <rect x="42" y={g - 48} width="53" height="2.5" fill={c.roof} opacity="0.7" />
          <ellipse cx="118" cy={g - 3} rx="8" ry="4" fill={c.groundEdge} />
        </g>
      );
    case 'gate': // N2の門（くぐって次へ）
      return (
        <g>
          <Path c={c} />
          <rect x="38" y={g - 46} width="84" height="8" rx="2" fill={c.roof} />
          <rect x="34" y={g - 50} width="92" height="5" rx="2.5" fill={c.roof} opacity="0.75" />
          <rect x="48" y={g - 38} width="11" height="38" fill={c.deep} />
          <rect x="101" y={g - 38} width="11" height="38" fill={c.deep} />
          <rect x="44" y={g - 30} width="72" height="6" fill={c.roof} opacity="0.85" />
          <path d={`M62 ${g} v-14 h36 v14`} fill={c.night ? '#20284a' : '#ffffff'} opacity="0.5" />
        </g>
      );
    case 'tower': // ソラノ塔（高く登る）
      return (
        <g>
          <rect x="66" y={g - 52} width="28" height="52" fill={c.base} />
          <rect x="66" y={g - 52} width="9" height="52" fill={c.deep} opacity="0.25" />
          <path d={`M80 ${g - 76} L100 ${g - 50} H60 Z`} fill={c.roof} />
          <rect x="74" y={g - 44} width="12" height="12" rx="2" fill={c.deep} opacity="0.85" />
          <rect x="74" y={g - 24} width="12" height="24" rx="2" fill={c.deep} />
          <path d={`M80 ${g - 76} v-8`} stroke={c.deep} strokeWidth="2" />
          <path d={`M80 ${g - 84} l12 4 l-12 4 Z`} fill={c.roof} />
          <ellipse cx="80" cy={g - 1} rx="26" ry="5" fill={c.groundEdge} opacity="0.7" />
          <Tree c={c} x={126} y={g} s={0.85} />
        </g>
      );
    case 'library': // 読解・聴解の館
      return (
        <g>
          <Path c={c} />
          <rect x="46" y={g - 34} width="68" height="34" fill={c.base} />
          <path d={`M40 ${g - 34} L80 ${g - 58} L120 ${g - 34} Z`} fill={c.roof} />
          <path d={`M40 ${g - 34} L80 ${g - 58} L120 ${g - 34} Z`} fill="#000" opacity="0.08" />
          <rect x="56" y={g - 24} width="14" height="24" fill={c.deep} />
          <rect x="78" y={g - 24} width="12" height="14" rx="1.5" fill={c.deep} opacity="0.8" />
          <rect x="96" y={g - 24} width="12" height="14" rx="1.5" fill={c.deep} opacity="0.8" />
          <rect x="44" y={g - 36} width="72" height="3" fill={c.deep} opacity="0.5" />
        </g>
      );
    case 'castle': // 総合模試の城（最後のボス）
      return (
        <g>
          <path d={`M30 ${g} L80 ${g - 20} L130 ${g} Z`} fill={c.nearHill} opacity="0.6" />
          <rect x="52" y={g - 40} width="56" height="40" fill={c.base} />
          <path d={`M52 ${g - 40} v-9 h8 v5 h8 v-5 h8 v5 h8 v-5 h8 v5 h8 v-5 h8 v9`} fill={c.deep} />
          <rect x="40" y={g - 32} width="14" height="32" fill={c.deep} />
          <rect x="106" y={g - 32} width="14" height="32" fill={c.deep} />
          <path d={`M47 ${g - 44} l7 12 h-14 Z`} fill={c.roof} />
          <path d={`M113 ${g - 44} l7 12 h-14 Z`} fill={c.roof} />
          <path d={`M72 ${g} v-20 a8 8 0 0 1 16 0 v20 Z`} fill={c.roof} />
          <rect x="60" y={g - 30} width="8" height="8" rx="1" fill={c.deep} opacity="0.7" />
          <rect x="92" y={g - 30} width="8" height="8" rx="1" fill={c.deep} opacity="0.7" />
        </g>
      );
    case 'village': // 自己紹介の村（小さな家が並ぶ）
      return (
        <g>
          <Path c={c} />
          <rect x="46" y={g - 22} width="26" height="22" fill={c.base} />
          <path d={`M42 ${g - 22} L59 ${g - 38} L76 ${g - 22} Z`} fill={c.roof} />
          <rect x="54" y={g - 12} width="10" height="12" fill={c.deep} />
          <rect x="84" y={g - 16} width="22" height="16" fill={c.base} />
          <path d={`M80 ${g - 16} L95 ${g - 29} L110 ${g - 16} Z`} fill={c.roof} opacity="0.85" />
          <rect x="90" y={g - 10} width="8" height="10" fill={c.deep} opacity="0.8" />
          <Tree c={c} x={120} y={g} s={0.9} />
          <Tree c={c} x={28} y={g + 2} s={0.7} />
        </g>
      );
    case 'road': // 思い出の道（振り返りながら進む一本道）
      return (
        <g>
          <path d={`M96 ${g - 26} C 92 ${g + 2}, 60 ${g + 6}, 30 114`}
            stroke={c.groundEdge} strokeWidth="16" fill="none" strokeLinecap="round" />
          <path d={`M96 ${g - 26} C 92 ${g + 2}, 60 ${g + 6}, 30 114`}
            stroke="#fff" strokeWidth="2" strokeDasharray="5 7" fill="none" opacity="0.75" />
          <Tree c={c} x={116} y={g} s={0.95} />
          <Tree c={c} x={136} y={g + 6} s={1.1} />
          <Tree c={c} x={54} y={g - 2} s={0.6} />
          <rect x="70" y={g - 14} width="2.5" height="14" fill={c.deep} />
          <rect x="66" y={g - 20} width="11" height="7" rx="1.5" fill={c.base} />
        </g>
      );
    case 'hill': // 変化の丘（登った先に景色が変わる）
      return (
        <g>
          <path d={`M-4 ${g + 6} Q34 ${g - 30} 74 ${g + 6} Z`} fill={c.leaf} opacity="0.9" />
          <path d={`M46 ${g + 6} Q94 ${g - 40} 150 ${g + 6} Z`} fill={c.nearHill} />
          <path d={`M92 ${g - 26} l7 -12 l7 12 Z`} fill={c.roof} />
          <rect x="97" y={g - 26} width="4" height="10" fill={c.deep} />
          <path d={`M20 ${g + 4} q14 -18 30 -6`} stroke={c.groundEdge} strokeWidth="4"
            fill="none" strokeLinecap="round" opacity="0.7" />
          <Tree c={c} x={28} y={g - 4} s={0.7} />
        </g>
      );
    case 'avenue': // 習慣の並木道（同じ木が続く＝継続）
      return (
        <g>
          <path d={`M80 ${g - 8} L58 114 M80 ${g - 8} L108 114`} stroke={c.groundEdge}
            strokeWidth="3" fill="none" opacity="0.5" />
          <path d={`M80 ${g - 8} L54 114 L112 114 Z`} fill={c.groundEdge} opacity="0.4" />
          <Tree c={c} x={62} y={g + 2} s={0.7} />
          <Tree c={c} x={100} y={g + 2} s={0.7} />
          <Tree c={c} x={44} y={g + 12} s={1} />
          <Tree c={c} x={120} y={g + 12} s={1} />
          <Tree c={c} x={22} y={g + 26} s={1.35} />
          <Tree c={c} x={142} y={g + 26} s={1.35} />
        </g>
      );
    case 'town': // お願いの街（人に頼む場所＝店が並ぶ）
      return (
        <g>
          <Path c={c} />
          <rect x="36" y={g - 26} width="24" height="26" fill={c.base} />
          <rect x="64" y={g - 44} width="28" height="44" fill={c.deep} />
          <rect x="96" y={g - 32} width="22" height="32" fill={c.base} />
          <path d={`M34 ${g - 26} h28 l-4 -6 h-20 Z`} fill={c.roof} />
          <path d={`M94 ${g - 32} h26 l-4 -6 h-18 Z`} fill={c.roof} opacity="0.85" />
          <rect x="70" y={g - 38} width="6" height="6" fill="#fff" opacity="0.85" />
          <rect x="80" y={g - 38} width="6" height="6" fill="#fff" opacity="0.85" />
          <rect x="70" y={g - 26} width="6" height="6" fill="#fff" opacity="0.7" />
          <rect x="80" y={g - 26} width="6" height="6" fill="#fff" opacity="0.7" />
          <rect x="42" y={g - 14} width="12" height="14" fill={c.roof} opacity="0.8" />
        </g>
      );
    case 'plaza': // 相談の広場（噴水を囲んで話す）
      return (
        <g>
          <ellipse cx="80" cy={g + 10} rx="52" ry="18" fill={c.groundEdge} opacity="0.45" />
          <ellipse cx="80" cy={g + 4} rx="26" ry="9" fill={c.deep} opacity="0.35" />
          <rect x="76" y={g - 22} width="8" height="24" rx="2" fill={c.base} />
          <ellipse cx="80" cy={g - 24} rx="12" ry="4" fill={c.base} />
          <path d={`M80 ${g - 30} q-8 6 -10 12 M80 ${g - 30} q8 6 10 12`}
            stroke={c.night ? '#8fd6ff' : '#7cc3e8'} strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <circle cx="46" cy={g - 6} r="4.5" fill={c.roof} />
          <circle cx="114" cy={g - 6} r="4.5" fill={c.deep} />
          <Tree c={c} x={132} y={g + 2} s={0.8} />
        </g>
      );
    case 'mountain': // 意見を伝える山（頂上から言い切る）
      return (
        <g>
          <path d={`M-4 ${g + 8} L44 ${g - 42} L74 ${g + 8} Z`} fill={c.nearHill} opacity="0.85" />
          <path d={`M40 ${g + 8} L92 ${g - 58} L150 ${g + 8} Z`} fill={c.farHill} />
          <path d={`M92 ${g - 58} L108 ${g - 34} H76 Z`} fill="#fff" opacity="0.9" />
          <path d={`M44 ${g - 42} L54 ${g - 28} H34 Z`} fill="#fff" opacity="0.7" />
          <path d={`M92 ${g - 58} v-10`} stroke={c.deep} strokeWidth="2" />
          <path d={`M92 ${g - 68} l11 4 l-11 4 Z`} fill={c.roof} />
        </g>
      );
    case 'crossroad': // 選択の分かれ道（どちらを選ぶか）
      return (
        <g>
          <path d={`M80 114 V${g - 4}`} stroke={c.groundEdge} strokeWidth="14" strokeLinecap="round" />
          <path d={`M80 ${g - 4} L34 ${g - 30}`} stroke={c.groundEdge} strokeWidth="11" strokeLinecap="round" />
          <path d={`M80 ${g - 4} L128 ${g - 32}`} stroke={c.groundEdge} strokeWidth="11" strokeLinecap="round" />
          <rect x="78" y={g - 34} width="3" height="30" fill={c.deep} />
          <path d={`M79 ${g - 34} h-22 l-5 5 l5 5 h22 Z`} fill={c.base} />
          <path d={`M80 ${g - 22} h22 l5 5 l-5 5 h-22 Z`} fill={c.roof} />
          <Tree c={c} x={22} y={g - 20} s={0.6} />
          <Tree c={c} x={140} y={g - 18} s={0.65} />
        </g>
      );
    case 'forest': // 推測の霧の森（はっきり見えないのが主題）
      return (
        <g>
          <path d={`M32 ${g + 4} L20 ${g + 4} L32 ${g - 34} L44 ${g + 4} Z`} fill={c.leaf} />
          <path d={`M64 ${g + 6} L48 ${g + 6} L64 ${g - 46} L80 ${g + 6} Z`} fill={c.deep} />
          <path d={`M104 ${g + 4} L88 ${g + 4} L104 ${g - 38} L120 ${g + 4} Z`} fill={c.leaf} opacity="0.9" />
          <path d={`M136 ${g + 6} L124 ${g + 6} L136 ${g - 28} L148 ${g + 6} Z`} fill={c.deep} opacity="0.8" />
          <path d={`M6 ${g - 12} q22 -7 44 0 q22 7 44 0 q22 -7 44 0`}
            stroke="#fff" strokeWidth="5" fill="none" opacity="0.75" strokeLinecap="round" />
          <path d={`M-2 ${g + 2} q26 -7 52 0 q26 7 52 0 q26 -7 52 0`}
            stroke="#fff" strokeWidth="6" fill="none" opacity="0.55" strokeLinecap="round" />
        </g>
      );
    case 'city': // 仕事と暮らしの町（ビルが並ぶ）
      return (
        <g>
          <rect x="26" y={g - 30} width="20" height="30" fill={c.deep} />
          <rect x="50" y={g - 48} width="24" height="48" fill={c.base} />
          <rect x="78" y={g - 38} width="20" height="38" fill={c.deep} opacity="0.9" />
          <rect x="102" y={g - 56} width="18" height="56" fill={c.base} />
          <rect x="124" y={g - 26} width="16" height="26" fill={c.deep} opacity="0.8" />
          {[0, 1, 2].map((r) => [0, 1].map((k) => (
            <rect key={`a${r}${k}`} x={55 + k * 10} y={g - 42 + r * 11} width="5" height="6"
              fill={c.night ? '#ffe9a8' : '#ffffff'} opacity="0.85" />
          )))}
          {[0, 1, 2, 3].map((r) => (
            <rect key={`b${r}`} x="107" y={g - 50 + r * 11} width="7" height="6"
              fill={c.night ? '#ffe9a8' : '#ffffff'} opacity="0.8" />
          ))}
          <path d={`M-4 ${g + 4} H164`} stroke={c.groundEdge} strokeWidth="4" opacity="0.6" />
        </g>
      );
    default:
      return <g><Tree c={c} x={80} y={g} s={1.2} /></g>;
  }
};

/* ────────────────────────────────────────────────────────────
   公開コンポーネント
   ──────────────────────────────────────────────────────────── */

interface SceneProps {
  kind: LandmarkKind;
  tone: MapTone;
  /** 未解放は霧で覆う。色だけに意味を持たせないための主表現 */
  fogged?: boolean;
  className?: string;
}

/**
 * 地域の風景イラスト。**16:11 のシーン**として描く。
 * 親要素の幅いっぱいに広がるので、枠側で大きさを決めること。
 */
export const LandmarkScene = ({ kind, tone, fogged = false, className }: SceneProps) => {
  const gid = useId();
  const c = TONES[tone] ?? TONES.meadow;
  return (
    <svg viewBox="0 0 160 110" className={className} preserveAspectRatio="xMidYMid slice"
      aria-hidden focusable="false">
      <Backdrop c={c} gid={`sky-${gid}`} />
      {landmarkOf(kind, c)}
      <Foreground c={c} />
      {/*
        ことばの霧。**イラストを消してしまわない濃さ**にする。
        濃くしすぎると未解放の地域がどれも同じ白い板になり、
        「この先に何があるか」が想像できなくなる（＝行きたくならない）
      */}
      {fogged && (
        <>
          <rect x="0" y="0" width="160" height="110" fill="#cbd5e1" opacity="0.5" />
          <path d="M-6 66 q28 -9 56 0 q28 9 56 0 q28 -9 56 0 V114 H-6 Z" fill="#f1f5f9" opacity="0.7" />
          <path d="M-6 46 q24 -7 48 0 q24 7 48 0 q24 -7 48 0" stroke="#fff" strokeWidth="6"
            fill="none" opacity="0.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
};

/* ────────────────────────────────────────────────────────────
   小アイコン（一覧表示・見出しなど、風景を描くには小さすぎる場所用）
   ──────────────────────────────────────────────────────────── */

interface IconProps { kind: LandmarkKind; size?: number; muted?: boolean }

/** 未解放は彩度を落とす。ただし色だけに意味を持たせない（霧とラベルが本体） */
const palette = (muted: boolean) => ({
  base: muted ? '#cbd5e1' : '#60a5fa',
  deep: muted ? '#94a3b8' : '#2563eb',
  warm: muted ? '#d6d3d1' : '#f59e0b',
  green: muted ? '#cbd5e1' : '#34d399',
  roof: muted ? '#a8a29e' : '#f87171',
});

export const LandmarkIcon = ({ kind, size = 44, muted = false }: IconProps) => {
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
