// Chapter 1用 完全オリジナルpixel-art assets（procedural SVG・labPreview限定）。
// provenance: 全spriteは本ファイル内の文字マップとして author=Claude Code（2026-07-28）が新規作成した
// オリジナルdraft。既存ゲーム（ポケモン等）のsprite・マップ・配色・UI枠の抽出・模倣は一切していない。
// 生成状態: generated → displayed（human_review_candidate）。approvedへは自動昇格しない。
// 配色は「温かい16bit風・現代日本＋少し幻想的」の独自パレット（テラコッタ／オリーブ／ブルーグレー）。

const PAL: Record<string, string> = {
  // 共通パレット（文字→色）。'.'は透過
  k: '#2e2a26', // 黒（髪・輪郭）
  s: '#f2d5b8', // 肌
  w: '#ffffff', // 白
  t: '#3f7f8c', // 主人公のジャケット（ティール）
  d: '#33646f', // ティール影
  b: '#8ca3b8', // 翔子先生のブルーグレージャケット
  c: '#71889e', // ブルーグレー影
  g: '#5a6b7c', // メガネ・金具
  n: '#54473b', // ズボン・茶
  r: '#c96f4a', // テラコッタ（ハナさんのエプロン）
  o: '#e8a24a', // ランタンの灯・アクセント
  u: '#4a5e78', // ゲンさんの制服ネイビー
  y: '#d9c49a', // 麦わら・パン
  e: '#7a5c44', // 靴・木
  p: '#b9536b', // ハナさんの髪飾り
};

const Sprite = ({ map, title, className }: { map: string[]; title: string; className?: string }) => {
  const h = map.length, w = map[0].length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" role="img" aria-label={title}
      shapeRendering="crispEdges" className={className} style={{ imageRendering: 'pixelated' }}>
      <title>{title}</title>
      {map.flatMap((row, y) => [...row].map((ch, x) =>
        ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PAL[ch] ?? '#000'} />))}
    </svg>
  );
};

/** 主人公（旅の学習者・成人）。ティールの上着＋肩掛けかばん */
export const HeroSprite = ({ className }: { className?: string }) => (
  <Sprite className={className} title="主人公（オリジナル）" map={[
    '...kkkk...',
    '..kkkkkk..',
    '..ksssssk.',
    '..ksksks..',
    '..ssssss..',
    '...ssss...',
    '..tttttt..',
    '.ttttttte.',
    '.t.tttt.e.',
    '.d.tttt.y.',
    '...dddd...',
    '...n..n...',
    '...n..n...',
    '..ee..ee..',
  ]} />
);

/** 翔子先生（言葉の案内人）。黒髪ボブ＋黒メガネ＋ブルーグレージャケット */
export const ShokoSprite = ({ className }: { className?: string }) => (
  <Sprite className={className} title="翔子先生（オリジナル）" map={[
    '..kkkkkk..',
    '.kkkkkkkk.',
    '.kksssskk.',
    '.kgsgsgsk.',
    '.kssssssk.',
    '.k.ssss.k.',
    '..bbbbbb..',
    '.bbbbbbbb.',
    '.b.bbbb.b.',
    '.c.bbbb.c.',
    '...cccc...',
    '...n..n...',
    '...n..n...',
    '..ee..ee..',
  ]} />
);

/** パン屋のハナさん。テラコッタのエプロン＋髪飾り */
export const NpcHanaSprite = ({ className }: { className?: string }) => (
  <Sprite className={className} title="パン屋のハナさん（オリジナル）" map={[
    '...kkkp...',
    '..kkkkkk..',
    '..ssssss..',
    '..sksks...',
    '..ssssss..',
    '...ssss...',
    '..wrrrrw..',
    '.wrrrrrrw.',
    '.w.rrrr.w.',
    '...rrrr...',
    '...rrrr...',
    '...y..y...',
    '..ee..ee..',
  ]} />
);

/** 駅員のゲンさん。ネイビーの制服＋帽子 */
export const NpcGenSprite = ({ className }: { className?: string }) => (
  <Sprite className={className} title="駅員のゲンさん（オリジナル）" map={[
    '..uuuuuu..',
    '.uuuuuuuu.',
    '..ssssss..',
    '..sksks...',
    '..ssssss..',
    '...ssss...',
    '..uuuuuu..',
    '.uuuuuuuu.',
    '.u.uuuu.u.',
    '.g.uuuu.g.',
    '...uuuu...',
    '...n..n...',
    '..ee..ee..',
  ]} />
);

/** ことばの灯（Quest marker）。オリジナルのランタンモチーフ */
export const LanternMarker = ({ className }: { className?: string }) => (
  <Sprite className={className} title="ことばの灯（Questの目印）" map={[
    '..kk..',
    '.kook.',
    'kooook',
    'kooook',
    '.kook.',
    '..kk..',
  ]} />
);

// ── 見下ろし型 町マップ（オリジナル・48x36グリッド） ──
// 地形は独自デザイン: 入口(左下)→ことば通り→みなも広場→駅前(右上)への一本の旅路。
const M = {
  grass: '#9db877', grassDark: '#8fac6c', path: '#d9c49a', pathEdge: '#cbb489',
  roofA: '#c96f4a', roofB: '#b45f3e', wall: '#f0e6d2', wallShade: '#e2d4ba',
  treeTop: '#6d9460', treeDark: '#5d8253', trunk: '#8a6f52',
  water: '#7fb3c9', waterDeep: '#6aa1b8', stone: '#b8b2a6',
  station: '#7f9bb5', sign: '#8a6f52',
} as const;

const Tree = ({ x, y }: { x: number; y: number }) => (
  <g>
    <rect x={x + 1} y={y + 3} width={2} height={2} fill={M.trunk} />
    <rect x={x} y={y} width={4} height={3} fill={M.treeTop} />
    <rect x={x} y={y + 2} width={1} height={1} fill={M.treeDark} />
    <rect x={x + 3} y={y} width={1} height={1} fill={M.treeDark} />
  </g>
);

const House = ({ x, y, roof }: { x: number; y: number; roof: string }) => (
  <g>
    <rect x={x} y={y + 2} width={6} height={4} fill={M.wall} />
    <rect x={x} y={y + 5} width={6} height={1} fill={M.wallShade} />
    <rect x={x - 1} y={y} width={8} height={3} fill={roof} />
    <rect x={x + 2} y={y + 4} width={2} height={2} fill={M.trunk} />
  </g>
);

/** 町の見下ろしマップ本体。座標系は 0..48 x 0..36（chapter1Dataの%座標と対応: x%*0.48, y%*0.36） */
export const TownMapBase = () => (
  <g shapeRendering="crispEdges">
    {/* 草地（2色の市松で16bit風の質感） */}
    <rect x={0} y={0} width={48} height={36} fill={M.grass} />
    {[...Array(12)].map((_, i) => [...Array(9)].map((_, j) => ((i + j) % 2 === 0
      ? <rect key={`g${i}-${j}`} x={i * 4} y={j * 4} width={4} height={4} fill={M.grassDark} opacity={0.35} /> : null)))}
    {/* 旅路（入口→通り→広場→駅前） */}
    <path d="M 6 34 L 6 28 L 10 28 L 10 24 L 18 24 L 18 21 L 24 21 L 24 16 L 30 16 L 30 12 L 38 12 L 38 8 L 44 8"
      stroke={M.path} strokeWidth={3.2} fill="none" strokeLinecap="square" />
    <path d="M 6 34 L 6 28 L 10 28 L 10 24 L 18 24 L 18 21 L 24 21 L 24 16 L 30 16 L 30 12 L 38 12 L 38 8 L 44 8"
      stroke={M.pathEdge} strokeWidth={0.5} fill="none" strokeDasharray="1 2" opacity={0.7} />
    {/* 町の入口（門柱） */}
    <rect x={4.5} y={26.5} width={1.2} height={3} fill={M.trunk} />
    <rect x={7.5} y={26.5} width={1.2} height={3} fill={M.trunk} />
    <rect x={4} y={26} width={5.2} height={1} fill={M.sign} />
    {/* ことば通り（家2軒＋パン屋） */}
    <House x={14} y={17} roof={M.roofA} />
    <House x={21} y={23} roof={M.roofB} />
    <g>{/* パン屋（ひさし付き・オリジナル） */}
      <rect x={16} y={25} width={6} height={4} fill={M.wall} />
      <rect x={15.5} y={24} width={7} height={1.6} fill={M.roofA} />
      <rect x={16} y={26.5} width={6} height={0.8} fill={'#e8a24a'} opacity={0.85} />
      <rect x={18} y={27.5} width={2} height={1.5} fill={M.trunk} />
    </g>
    {/* みなも広場（水盤） */}
    <rect x={27.5} y={12.5} width={5} height={4} fill={M.stone} />
    <rect x={28.5} y={13.5} width={3} height={2} fill={M.water} />
    <rect x={29} y={14} width={2} height={1} fill={M.waterDeep} />
    {/* 駅前（駅舎＋ホーム） */}
    <rect x={39} y={4} width={8} height={4.5} fill={M.station} />
    <rect x={38.5} y={3} width={9} height={1.6} fill={'#5d7a94'} />
    <rect x={41} y={6} width={1.6} height={2.5} fill={M.wall} />
    <rect x={44} y={6} width={1.6} height={2.5} fill={M.wall} />
    <rect x={39} y={9} width={8} height={0.8} fill={M.stone} />
    {/* 掲示板（Quest4の対象） */}
    <rect x={31.5} y={9.5} width={2.4} height={1.6} fill={M.sign} />
    <rect x={32.3} y={11.1} width={0.8} height={1} fill={M.trunk} />
    {/* 木々 */}
    <Tree x={2} y={4} /><Tree x={10} y={8} /><Tree x={42} y={20} />
    <Tree x={36} y={26} /><Tree x={26} y={30} /><Tree x={3} y={16} />
  </g>
);
