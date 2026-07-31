// Phase B-4: 語彙イラストの部品箱（オリジナルのフラットベクター）。
//
// 方針（docs/ai-course/illustration-policy.md）:
// - 文字を描かない。絵だけで意味が分かること（altは支援技術のためだけに使う）
// - 写実・3D・既存IPの模倣をしない。やわらかいフラットベクター
// - 人物・背景・小物は再利用してよい。ただし「行動・方向・対象・場所・状態」は語ごとに変える
// - 手足・ドア・乗り物などの部品が欠けないよう、部品側で閉じた形を持つ
//
// 座標系は 0 0 120 90 に固定（4:3）。地面は y=72。
import type { ReactNode } from 'react';
import { SCENE_W, SCENE_H, GROUND, C } from './vocabSceneTokens';
import type { Dir, PlaceKey, Pose, Mood, PropKey } from './vocabSceneTokens';


/* ────────────── 場所（背景） ────────────── */

const Ground = ({ fill = C.floor }: { fill?: string }) => (
  <rect x="0" y={GROUND} width={SCENE_W} height={SCENE_H - GROUND} fill={fill} />
);

const Wall = ({ fill = C.wall }: { fill?: string }) => (
  <rect x="0" y="0" width={SCENE_W} height={GROUND} fill={fill} />
);

const Sky = ({ fill = C.sky }: { fill?: string }) => (
  <rect x="0" y="0" width={SCENE_W} height={GROUND} fill={fill} />
);

export const Place = ({ place }: { place: PlaceKey }): ReactNode => {
  switch (place) {
    case 'home':
      return (<g>
        <Sky /><Ground fill={C.green} />
        <path d="M18 72 V44 h30 v28 z" fill={C.wall2} />
        <path d="M14 45 L33 30 L52 45 z" fill={C.body2} />
        <rect x="28" y="56" width="10" height="16" fill={C.wood} rx="1" />
        <rect x="40" y="49" width="8" height="7" fill={C.paper} rx="1" />
      </g>);
    case 'room':
      return (<g>
        <Wall /><Ground />
        <rect x="0" y={GROUND - 2} width={SCENE_W} height="2" fill={C.wall2} />
        <rect x="82" y="30" width="26" height="18" fill={C.paper} rx="2" />
        <rect x="86" y="34" width="18" height="10" fill={C.sky} rx="1" />
      </g>);
    case 'night':
      return (<g>
        <Sky fill="#4a5578" /><Ground fill="#3b4463" />
        <circle cx="98" cy="18" r="7" fill="#f7f0c8" />
        <circle cx="26" cy="14" r="1.5" fill="#f7f0c8" />
        <circle cx="46" cy="24" r="1.2" fill="#f7f0c8" />
      </g>);
    case 'street':
      return (<g>
        <Sky /><Ground fill={C.metal} />
        <rect x="0" y={GROUND} width={SCENE_W} height="3" fill="#b3bcd4" />
        <rect x="8" y="34" width="20" height="38" fill={C.wall2} />
        <rect x="94" y="28" width="20" height="44" fill={C.wall2} />
      </g>);
    case 'station':
      return (<g>
        <Wall fill={C.wall2} /><Ground fill={C.metal} />
        <rect x="0" y="66" width={SCENE_W} height="6" fill={C.warn} opacity="0.5" />
        <rect x="0" y="20" width={SCENE_W} height="5" fill={C.wall} />
      </g>);
    case 'shop':
      return (<g>
        <Wall /><Ground />
        <rect x="0" y="10" width={SCENE_W} height="9" fill={C.accent} opacity="0.6" />
        <rect x="6" y="30" width="30" height="42" fill={C.wall2} rx="2" />
        <rect x="10" y="36" width="22" height="4" fill={C.metal} rx="1" />
        <rect x="10" y="46" width="22" height="4" fill={C.metal} rx="1" />
        <rect x="10" y="56" width="22" height="4" fill={C.metal} rx="1" />
      </g>);
    case 'counter':
      return (<g>
        <Wall /><Ground />
        <rect x="0" y="52" width={SCENE_W} height="6" fill={C.wood} />
        <rect x="0" y="58" width={SCENE_W} height="14" fill="#c79a75" />
      </g>);
    case 'school':
      return (<g>
        <Wall /><Ground />
        <rect x="6" y="18" width="44" height="26" fill="#3e4a63" rx="2" />
        <rect x="9" y="21" width="38" height="20" fill="#4d5b78" rx="1" />
      </g>);
    case 'office':
      return (<g>
        <Wall /><Ground />
        <rect x="70" y="24" width="44" height="26" fill={C.paper} rx="2" />
        <rect x="74" y="28" width="36" height="18" fill={C.sky} rx="1" />
        <rect x="0" y="56" width="44" height="4" fill={C.wood} />
      </g>);
    case 'restaurant':
      return (<g>
        <Wall fill="#f6eee6" /><Ground fill="#e7d9c9" />
        <rect x="34" y="54" width="52" height="4" fill={C.wood} rx="1" />
        <rect x="42" y="58" width="4" height="14" fill={C.wood} />
        <rect x="74" y="58" width="4" height="14" fill={C.wood} />
      </g>);
    case 'hospital':
      return (<g>
        <Wall fill="#eef6f4" /><Ground fill="#dfeae8" />
        <rect x="84" y="16" width="22" height="22" fill={C.paper} rx="2" />
        <rect x="93" y="20" width="4" height="14" fill={C.accent} />
        <rect x="88" y="25" width="14" height="4" fill={C.accent} />
      </g>);
    case 'park':
      return (<g>
        <Sky /><Ground fill={C.green} />
        <rect x="14" y="46" width="4" height="26" fill={C.wood} />
        <circle cx="16" cy="42" r="12" fill="#7cc98a" />
        <circle cx="104" cy="48" r="9" fill="#7cc98a" />
        <rect x="102" y="52" width="3" height="20" fill={C.wood} />
      </g>);
    case 'plain':
    default:
      return (<g><Wall /><Ground /></g>);
  }
};

/* ────────────── 人物 ────────────── */


interface FigureProps {
  x: number; y?: number; dir?: Dir; pose?: Pose; mood?: Mood;
  color?: string; scale?: number;
}

/**
 * 人物1体。頭・胴・腕・脚を必ず描く（欠けた身体を作らない）。
 * poseで腕と脚だけを差し替え、向きはdirで反転する。
 */
export const Figure = ({ x, y = GROUND, dir = 'right', pose = 'stand', mood = 'neutral', color = C.body, scale = 1 }: FigureProps) => {
  const flip = dir === 'left' ? -1 : 1;
  const legs = (() => {
    switch (pose) {
      case 'walk': return <><rect x="-4" y="0" width="3" height="10" rx="1.4" fill={C.ink} transform="rotate(-14 -2.5 0)" /><rect x="1" y="0" width="3" height="10" rx="1.4" fill={C.ink} transform="rotate(16 2.5 0)" /></>;
      case 'run': return <><rect x="-6" y="0" width="3" height="10" rx="1.4" fill={C.ink} transform="rotate(-34 -4 0)" /><rect x="2" y="0" width="3" height="10" rx="1.4" fill={C.ink} transform="rotate(30 3 0)" /></>;
      case 'sit': return <><rect x="-4" y="0" width="9" height="3" rx="1.4" fill={C.ink} /><rect x="2" y="0" width="3" height="8" rx="1.4" fill={C.ink} /></>;
      case 'sleep': return <><rect x="-14" y="-2" width="30" height="5" rx="2.5" fill="#c9d2ea" /><rect x="-2" y="-5" width="16" height="4" rx="2" fill={C.ink} /></>;
      case 'crouch': return <><rect x="-4" y="2" width="8" height="3" rx="1.4" fill={C.ink} /></>;
      default: return <><rect x="-4" y="0" width="3" height="10" rx="1.4" fill={C.ink} /><rect x="1" y="0" width="3" height="10" rx="1.4" fill={C.ink} /></>;
    }
  })();
  const arms = (() => {
    switch (pose) {
      case 'raise': return <><rect x="3" y="-20" width="2.6" height="10" rx="1.3" fill={color} transform="rotate(18 4 -20)" /><rect x="-5" y="-14" width="2.6" height="9" rx="1.3" fill={color} /></>;
      case 'cheer': return <><rect x="3" y="-21" width="2.6" height="10" rx="1.3" fill={color} transform="rotate(28 4 -21)" /><rect x="-6" y="-21" width="2.6" height="10" rx="1.3" fill={color} transform="rotate(-28 -5 -21)" /></>;
      case 'point': return <><rect x="3" y="-15" width="11" height="2.6" rx="1.3" fill={color} /><rect x="-5" y="-14" width="2.6" height="9" rx="1.3" fill={color} /></>;
      case 'hold': case 'eat': case 'drink': case 'write': case 'read':
        return <><rect x="3" y="-14" width="8" height="2.6" rx="1.3" fill={color} /><rect x="-5" y="-14" width="2.6" height="9" rx="1.3" fill={color} /></>;
      case 'think': return <><rect x="2" y="-19" width="2.6" height="7" rx="1.3" fill={color} transform="rotate(35 3 -19)" /><rect x="-5" y="-14" width="2.6" height="9" rx="1.3" fill={color} /></>;
      case 'talk': return <><rect x="3" y="-16" width="7" height="2.6" rx="1.3" fill={color} transform="rotate(-18 3 -16)" /><rect x="-5" y="-14" width="2.6" height="9" rx="1.3" fill={color} /></>;
      case 'shrug': return <><rect x="3" y="-17" width="6" height="2.6" rx="1.3" fill={color} transform="rotate(-32 3 -17)" /><rect x="-8" y="-17" width="6" height="2.6" rx="1.3" fill={color} transform="rotate(32 -2 -17)" /></>;
      case 'slump': return <><rect x="3" y="-12" width="2.6" height="9" rx="1.3" fill={color} transform="rotate(10 4 -12)" /><rect x="-5" y="-12" width="2.6" height="9" rx="1.3" fill={color} transform="rotate(-10 -4 -12)" /></>;
      default: return <><rect x="3" y="-14" width="2.6" height="9" rx="1.3" fill={color} /><rect x="-5" y="-14" width="2.6" height="9" rx="1.3" fill={color} /></>;
    }
  })();
  const headY = pose === 'sit' ? -20 : pose === 'sleep' ? -6 : pose === 'crouch' ? -14 : pose === 'slump' ? -20 : -23;
  const bodyY = pose === 'sit' ? -17 : pose === 'sleep' ? -5 : pose === 'crouch' ? -11 : -20;
  const face = (() => {
    switch (mood) {
      case 'happy': return <path d="M-2 1.5 q2 2 4 0" stroke={C.ink} strokeWidth="0.9" fill="none" strokeLinecap="round" transform="translate(-1 0)" />;
      case 'sad': return <path d="M-2 2.5 q2 -2 4 0" stroke={C.ink} strokeWidth="0.9" fill="none" strokeLinecap="round" transform="translate(-1 0)" />;
      case 'tired': return <path d="M-3 1.5 h3 M1 1.5 h3" stroke={C.ink} strokeWidth="0.9" strokeLinecap="round" />;
      case 'surprised': return <circle cx="0" cy="1.6" r="1.3" fill={C.ink} />;
      case 'shy': return <><circle cx="-3" cy="1.4" r="1.6" fill={C.accent} opacity="0.5" /><circle cx="3" cy="1.4" r="1.6" fill={C.accent} opacity="0.5" /></>;
      case 'stern': return <path d="M-3 -1 l2.5 1 M3 -1 l-2.5 1" stroke={C.ink} strokeWidth="0.9" strokeLinecap="round" />;
      default: return null;
    }
  })();
  return (
    <g transform={`translate(${x} ${y}) scale(${scale * flip} ${scale})`}>
      <ellipse cx="0" cy="0.5" rx="7" ry="1.6" fill={C.shadow} />
      {legs}
      <rect x="-5" y={bodyY} width="10" height="13" rx="4" fill={color} />
      {arms}
      <circle cx="0" cy={headY} r="5.4" fill={C.skin} />
      <path d={`M-5.4 ${headY - 1} a5.4 5.4 0 0 1 10.8 0 z`} fill={C.hair} />
      <g transform={`translate(1 ${headY})`}>
        <circle cx="-2.2" cy="0.4" r="0.7" fill={C.ink} />
        <circle cx="1.4" cy="0.4" r="0.7" fill={C.ink} />
        {face}
      </g>
    </g>
  );
};

/* ────────────── 小物 ────────────── */

interface PropProps { x: number; y: number; scale?: number; dir?: Dir }

export const Prop = ({ kind, x, y, scale = 1, dir = 'right' }: PropProps & { kind: PropKey }) => {
  const flip = dir === 'left' ? -1 : 1;
  const inner = (() => {
    switch (kind) {
      case 'door': return <><rect x="-7" y="-20" width="14" height="20" rx="1" fill={C.wood} /><circle cx="4" cy="-10" r="1.2" fill={C.metal} /></>;
      case 'doorOpen': return <><rect x="-7" y="-20" width="14" height="20" rx="1" fill={C.wall2} /><path d="M-7 -20 L2 -17 V-3 L-7 0 z" fill={C.wood} /></>;
      case 'train': return <><rect x="-18" y="-16" width="36" height="16" rx="3" fill={C.cool} /><rect x="-14" y="-13" width="9" height="7" rx="1" fill={C.paper} /><rect x="-2" y="-13" width="9" height="7" rx="1" fill={C.paper} /><circle cx="-10" cy="1" r="2.4" fill={C.ink} /><circle cx="10" cy="1" r="2.4" fill={C.ink} /></>;
      case 'bus': return <><rect x="-15" y="-15" width="30" height="15" rx="3" fill={C.warn} /><rect x="-11" y="-12" width="18" height="6" rx="1" fill={C.paper} /><circle cx="-8" cy="1" r="2.4" fill={C.ink} /><circle cx="8" cy="1" r="2.4" fill={C.ink} /></>;
      case 'car': return <><path d="M-13 0 v-6 l4 -5 h14 l4 5 v6 z" fill={C.accent} /><circle cx="-7" cy="1" r="2.4" fill={C.ink} /><circle cx="7" cy="1" r="2.4" fill={C.ink} /></>;
      case 'book': return <><rect x="-7" y="-9" width="14" height="10" rx="1" fill={C.body} /><rect x="-6" y="-8" width="6" height="8" fill={C.paper} /><rect x="0.5" y="-8" width="6" height="8" fill="#f4f4fb" /></>;
      case 'phone': return <><rect x="-4" y="-8" width="8" height="14" rx="1.5" fill={C.ink} /><rect x="-3" y="-7" width="6" height="10" fill={C.sky} /></>;
      case 'cup': return <><path d="M-4 -7 h8 l-1 8 h-6 z" fill={C.paper} /><path d="M4 -5 a3 3 0 0 1 0 5" stroke={C.paper} strokeWidth="1.4" fill="none" /></>;
      case 'plate': return <><ellipse cx="0" cy="0" rx="9" ry="3" fill={C.paper} /><circle cx="-2" cy="-1" r="2.4" fill={C.accent} /><circle cx="2.5" cy="-0.5" r="2" fill={C.green} /></>;
      case 'bag': return <><rect x="-5" y="-7" width="10" height="9" rx="1" fill={C.body2} /><path d="M-2.5 -7 a2.5 3 0 0 1 5 0" stroke={C.body2} strokeWidth="1.2" fill="none" /></>;
      case 'coin': return <><circle cx="0" cy="0" r="5" fill={C.warn} /><circle cx="0" cy="0" r="3" fill="#f0b955" /></>;
      case 'clock': return <><circle cx="0" cy="0" r="7" fill={C.paper} /><circle cx="0" cy="0" r="7" fill="none" stroke={C.metal} strokeWidth="1.4" /><path d="M0 0 V-4 M0 0 h3" stroke={C.ink} strokeWidth="1.1" strokeLinecap="round" /></>;
      case 'pill': return <><rect x="-6" y="-3" width="12" height="6" rx="3" fill={C.paper} /><path d="M0 -3 v6" stroke={C.accent} strokeWidth="1.2" /></>;
      case 'waterGlass': return <><path d="M-4 -9 h8 l-1 10 h-6 z" fill="#cfe9f7" opacity="0.9" /><path d="M-3.4 -4 h6.8 l-0.6 5 h-5.6 z" fill={C.cool} /></>;
      case 'cat': return <><ellipse cx="0" cy="-3" rx="7" ry="4.5" fill="#8e8a99" /><circle cx="6" cy="-7" r="3.6" fill="#8e8a99" /><path d="M4 -10 l1 -3 l2 2.4 z" fill="#8e8a99" /><path d="M8 -10 l1.6 -2.8 l1 3 z" fill="#8e8a99" /><path d="M-7 -4 q-4 -3 -3 -7" stroke="#8e8a99" strokeWidth="1.6" fill="none" strokeLinecap="round" /></>;
      case 'chair': return <><rect x="-5" y="-4" width="10" height="2.4" fill={C.wood} /><rect x="3" y="-14" width="2.4" height="11" fill={C.wood} /><rect x="-5" y="-2" width="2" height="6" fill={C.wood} /><rect x="3" y="-2" width="2" height="6" fill={C.wood} /></>;
      case 'desk': return <><rect x="-14" y="-6" width="28" height="3" rx="1" fill={C.wood} /><rect x="-12" y="-3" width="2.4" height="9" fill={C.wood} /><rect x="9.6" y="-3" width="2.4" height="9" fill={C.wood} /></>;
      case 'sign': return <><rect x="-1" y="-6" width="2" height="10" fill={C.metal} /><rect x="-8" y="-16" width="16" height="10" rx="1.5" fill={C.paper} /><rect x="-5" y="-13" width="10" height="1.6" fill={C.metal} /><rect x="-5" y="-10" width="7" height="1.6" fill={C.metal} /></>;
      case 'calendar': return <><rect x="-8" y="-10" width="16" height="14" rx="1.5" fill={C.paper} /><rect x="-8" y="-10" width="16" height="4" rx="1.5" fill={C.accent} /><circle cx="-3" cy="-1" r="1.4" fill={C.metal} /><circle cx="2" cy="-1" r="1.4" fill={C.metal} /><circle cx="-3" cy="3" r="1.4" fill={C.metal} /></>;
      case 'chartUp': return <><path d="M-9 4 h18" stroke={C.metal} strokeWidth="1.2" /><rect x="-8" y="-1" width="4" height="5" fill={C.green} /><rect x="-2" y="-5" width="4" height="9" fill={C.green} /><rect x="4" y="-10" width="4" height="14" fill={C.green} /><path d="M-8 -3 L8 -13" stroke={C.accent} strokeWidth="1.4" strokeLinecap="round" /><path d="M8 -13 l-4 0.6 l2.4 2.6 z" fill={C.accent} /></>;
      case 'chartDown': return <><path d="M-9 4 h18" stroke={C.metal} strokeWidth="1.2" /><rect x="-8" y="-10" width="4" height="14" fill={C.cool} /><rect x="-2" y="-5" width="4" height="9" fill={C.cool} /><rect x="4" y="-1" width="4" height="5" fill={C.cool} /><path d="M-8 -13 L8 -3" stroke={C.accent} strokeWidth="1.4" strokeLinecap="round" /><path d="M8 -3 l-1.4 -3.6 l-2.8 1.6 z" fill={C.accent} /></>;
      case 'heart': return <path d="M0 4 L-6 -2 a3.6 3.6 0 0 1 6 -4 a3.6 3.6 0 0 1 6 4 z" fill={C.accent} />;
      case 'cloudHot': return <><circle cx="0" cy="0" r="8" fill={C.sun} /><path d="M0 -12 v3 M0 9 v3 M-12 0 h3 M9 0 h3 M-8.5 -8.5 l2 2 M6.5 6.5 l2 2 M-8.5 8.5 l2 -2 M6.5 -6.5 l2 -2" stroke={C.sun} strokeWidth="1.6" strokeLinecap="round" /></>;
      case 'snow': return <><path d="M0 -8 v16 M-7 -4 L7 4 M-7 4 L7 -4" stroke={C.cool} strokeWidth="1.6" strokeLinecap="round" /></>;
      case 'box': return <><rect x="-7" y="-8" width="14" height="10" rx="1" fill={C.wood} /><path d="M-7 -4 h14" stroke="#c79a75" strokeWidth="1.2" /></>;
      case 'bigBox': return <rect x="-12" y="-16" width="24" height="18" rx="2" fill={C.wood} />;
      case 'smallBox': return <rect x="-4" y="-5" width="8" height="6" rx="1" fill={C.wood} />;
      case 'key': return <><circle cx="-5" cy="0" r="3.4" fill={C.warn} /><rect x="-2" y="-1.2" width="10" height="2.4" fill={C.warn} /><rect x="5" y="1" width="2" height="3" fill={C.warn} /></>;
      case 'ticket': return <><rect x="-9" y="-5" width="18" height="10" rx="1.5" fill={C.paper} /><path d="M-2 -5 v10" stroke={C.metal} strokeWidth="1" strokeDasharray="1.6 1.6" /><circle cx="5" cy="0" r="1.6" fill={C.accent} /></>;
      case 'letter': return <><rect x="-8" y="-6" width="16" height="11" rx="1" fill={C.paper} /><path d="M-8 -6 L0 1 L8 -6" stroke={C.metal} strokeWidth="1.2" fill="none" /></>;
      case 'screen': return <><rect x="-11" y="-9" width="22" height="15" rx="1.5" fill={C.ink} /><rect x="-9.5" y="-7.5" width="19" height="12" fill={C.sky} /></>;
      case 'question': return <><circle cx="0" cy="0" r="8" fill={C.warn} opacity="0.35" /><path d="M-2.6 -3 a2.8 2.8 0 1 1 3.4 3.4 v1.4" stroke={C.ink} strokeWidth="1.6" fill="none" strokeLinecap="round" /><circle cx="0.8" cy="4.4" r="1" fill={C.ink} /></>;
      case 'bang': return <><circle cx="0" cy="0" r="8" fill={C.accent} opacity="0.3" /><rect x="-0.9" y="-5" width="1.8" height="6.4" rx="0.9" fill={C.ink} /><circle cx="0" cy="4" r="1" fill={C.ink} /></>;
      case 'check': return <><circle cx="0" cy="0" r="8" fill={C.green} opacity="0.5" /><path d="M-3.4 0.4 l2.4 2.6 l4.6 -5.6" stroke="#2f8f4e" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>;
      case 'cross': return <><circle cx="0" cy="0" r="8" fill={C.accent} opacity="0.35" /><path d="M-3 -3 l6 6 M3 -3 l-6 6" stroke="#c1453a" strokeWidth="1.8" strokeLinecap="round" /></>;
      case 'note': return <><rect x="-7" y="-9" width="14" height="12" rx="1" fill={C.paper} /><path d="M-4.4 -5.6 h8 M-4.4 -2.6 h8 M-4.4 0.4 h5" stroke={C.metal} strokeWidth="1.1" strokeLinecap="round" /></>;
      case 'bulb': return <><circle cx="0" cy="-2" r="5.4" fill={C.sun} /><rect x="-2.4" y="3" width="4.8" height="3" rx="1" fill={C.metal} /><path d="M0 -11 v2.4 M-8 -6 l2 1 M8 -6 l-2 1" stroke={C.sun} strokeWidth="1.4" strokeLinecap="round" /></>;
      case 'lock': return <><rect x="-5" y="-2" width="10" height="8" rx="1.4" fill={C.metal} /><path d="M-2.8 -2 v-2.6 a2.8 2.8 0 0 1 5.6 0 V-2" stroke={C.metal} strokeWidth="1.6" fill="none" /></>;
      case 'handshake': return <><rect x="-8" y="-1.6" width="8" height="3.4" rx="1.7" fill={C.skin} /><rect x="0" y="-1.6" width="8" height="3.4" rx="1.7" fill={C.body2} /><circle cx="0" cy="0.1" r="2.6" fill={C.skin} /></>;
      case 'newTag': return <><circle cx="0" cy="0" r="7" fill={C.green} /><path d="M-3 0 l2.2 2.4 l4 -5" stroke={C.paper} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></>;
      case 'oldTag': return <><circle cx="0" cy="0" r="7" fill="#b0a89c" /><path d="M0 -4 v4 l3 2" stroke={C.paper} strokeWidth="1.6" fill="none" strokeLinecap="round" /></>;
      case 'priceHigh': return <><rect x="-7" y="-14" width="14" height="14" rx="1.5" fill={C.paper} /><path d="M-3.4 -4 l3.4 -6 l3.4 6 M-3.4 -7 h6.8" stroke={C.accent} strokeWidth="1.4" fill="none" strokeLinecap="round" /></>;
      case 'priceLow': return <><rect x="-7" y="-9" width="14" height="9" rx="1.5" fill={C.paper} /><path d="M-3.4 -6.4 l3.4 4.4 l3.4 -4.4" stroke={C.green} strokeWidth="1.6" fill="none" strokeLinecap="round" /></>;
      case 'manyDots': return <g fill={C.body}>{[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => <circle key={i} cx={-7 + (i % 3) * 7} cy={-7 + Math.floor(i / 3) * 7} r="2.4" />)}</g>;
      case 'fewDots': return <g fill={C.body}><circle cx="-4" cy="0" r="2.4" /><circle cx="3" cy="-3" r="2.4" /></g>;
      case 'speechPair': return <><rect x="-12" y="-10" width="12" height="8" rx="2.4" fill={C.paper} /><path d="M-8 -2 l0 3 l3 -3 z" fill={C.paper} /><rect x="1" y="-4" width="12" height="8" rx="2.4" fill={C.body} opacity="0.35" /><path d="M9 4 l0 3 l-3 -3 z" fill={C.body} opacity="0.35" /></>;
      case 'mirror': return <><rect x="-9" y="-11" width="7" height="14" rx="1.5" fill={C.cool} opacity="0.7" /><rect x="2" y="-11" width="7" height="14" rx="1.5" fill={C.body2} opacity="0.7" /></>;
      case 'stack': return <><rect x="-7" y="-2" width="14" height="3" rx="0.8" fill={C.body} /><rect x="-7" y="-6" width="14" height="3" rx="0.8" fill={C.cool} /><rect x="-7" y="-10" width="14" height="3" rx="0.8" fill={C.body2} /></>;
      case 'tapeStart': return <><rect x="-1.4" y="-16" width="2.8" height="18" fill={C.metal} /><path d="M1.4 -16 h11 l-3 4 l3 4 h-11 z" fill={C.green} /></>;
      case 'tapeGoal': return <><rect x="-1.4" y="-16" width="2.8" height="18" fill={C.metal} /><path d="M1.4 -16 h11 l-3 4 l3 4 h-11 z" fill={C.accent} /></>;
      case 'freePath': return <><path d="M-12 2 q6 -12 12 -6 q6 6 12 -8" stroke={C.green} strokeWidth="2" fill="none" strokeLinecap="round" /></>;
      case 'tangle': return <><path d="M-8 2 q4 -10 8 -4 q-6 4 0 6 q6 2 8 -8" stroke={C.accent} strokeWidth="1.8" fill="none" strokeLinecap="round" /></>;
      case 'quietMark': return <><path d="M-6 -1 h4 l5 -5 v12 l-5 -5 h-4 z" fill={C.metal} /><path d="M4 -6 l8 12 M12 -6 l-8 12" stroke={C.accent} strokeWidth="1.6" strokeLinecap="round" /></>;
      case 'landMass': return <path d="M-22 8 q-6 -10 2 -14 q10 -6 16 -12 q10 -4 16 2 q8 6 4 14 q-4 10 -14 10 z" fill="#d9c9a8" />;
      case 'islandChain': return <><path d="M-2 8 q-5 -4 -3 -10 q2 -7 7 -6 q5 1 4 7 q-1 6 -8 9 z" fill="#d9c9a8" /><ellipse cx="-9" cy="9" rx="4" ry="2.2" fill="#d9c9a8" /><ellipse cx="9" cy="-11" rx="3" ry="2" fill="#d9c9a8" /></>;
      // 赤提灯（fi-chugoku差し替え用・文字なし。生活場面の記号として）
      case 'lantern': return <><rect x="-0.8" y="-14" width="1.6" height="3" fill={C.wood} /><ellipse cx="0" cy="-6" rx="4.5" ry="5.5" fill="#e05a4e" /><path d="M-4.5 -6 h9 M-4 -8.5 h8 M-4 -3.5 h8" stroke="#c24338" strokeWidth="0.7" /><rect x="-1.5" y="-0.8" width="3" height="1.6" fill="#f0b955" /><path d="M0 0.8 v2.4" stroke="#f0b955" strokeWidth="1" /></>;
      // 反り屋根の門（特定の実在建築を模倣しない一般化した伝統要素）
      case 'gateRoof': return <><path d="M-16 0 q16 -7 32 0 l-3 -4 q-13 -5.5 -26 0 z" fill="#7a4a3a" /><rect x="-12" y="0" width="3" height="14" fill="#8a5a48" /><rect x="9" y="0" width="3" height="14" fill="#8a5a48" /></>;
      // はまっているパズルピース（簡単＝迷わず完了の記号）
      case 'puzzleFit': return <><rect x="-9" y="-7" width="18" height="14" rx="2" fill={C.wall2} /><path d="M-2 -7 v4 a2 2 0 0 0 4 0 v-4 z" fill={C.body} /><rect x="-9" y="-7" width="9" height="14" rx="2" fill={C.body} opacity="0.85" /></>;
      // 汗の滴（緊張の記号）
      case 'sweat': return <path d="M0 -3 q3 4 0 6 q-3 -2 0 -6 z" fill={C.cool} />;
      case 'starMark': return <path d="M0 -8 l2.4 5 l5.4 0.6 l-4 3.6 l1.2 5.4 l-5 -2.8 l-5 2.8 l1.2 -5.4 l-4 -3.6 l5.4 -0.6 z" fill={C.warn} />;
      default: return null;
    }
  })();
  return <g transform={`translate(${x} ${y}) scale(${scale * flip} ${scale})`}>{inner}</g>;
};

/* ────────────── 方向・強調 ────────────── */
export const Arrow = ({ x, y, dir, length = 20, color = C.accent }: { x: number; y: number; dir: 'left' | 'right' | 'up' | 'down'; length?: number; color?: string }) => {
  const rot = { right: 0, down: 90, left: 180, up: 270 }[dir];
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect x={-length / 2} y="-1.5" width={length - 5} height="3" rx="1.5" fill={color} />
      <path d={`M${length / 2 - 6} -5 L${length / 2} 0 L${length / 2 - 6} 5 z`} fill={color} />
    </g>
  );
};

/** 大小・強弱の対比を出すための同種2個。 */
export const SizePair = ({ x, y, big }: { x: number; y: number; big: 'left' | 'right' }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={big === 'left' ? -26 : -14} y={big === 'left' ? -22 : -9} width={big === 'left' ? 22 : 10} height={big === 'left' ? 22 : 9} rx="2" fill={C.body} />
    <rect x={big === 'right' ? 4 : 6} y={big === 'right' ? -22 : -9} width={big === 'right' ? 22 : 10} height={big === 'right' ? 22 : 9} rx="2" fill={C.cool} />
  </g>
);

/** 思考・発話の吹き出し（中身は文字ではなく形で示す） */
export const Bubble = ({ x, y, kind = 'speech', fill = C.paper, children }: { x: number; y: number; kind?: 'speech' | 'think'; fill?: string; children?: ReactNode }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x="-11" y="-10" width="22" height="15" rx="4" fill={fill} />
    {kind === 'speech'
      ? <path d="M-6 5 l0 5 l5 -5 z" fill={fill} />
      : <><circle cx="-7" cy="7.5" r="2" fill={fill} /><circle cx="-11" cy="11" r="1.2" fill={fill} /></>}
    <g transform="translate(0 -2.5)">{children}</g>
  </g>
);
