// Chapter 1用 完全オリジナルpixel-art assets v2（procedural SVG・labPreview限定）。
// provenance: 全spriteは本ファイル内の文字マップとして author=Claude Code（2026-07-29）が新規作成した
// オリジナルdraft。既存ゲーム（ポケモン等）のsprite・マップ・配色・UI枠の抽出・模倣は一切していない。
// 生成状態: generated → displayed（human_review_candidate）。approvedへは自動昇格しない。
// v2: キャラクター状態（idle/walk/talk/happy）・町の生活感（灯・ベンチ・花壇・碑・柵）・Fog可視化部品。

export type SpritePose = 'idle' | 'walk' | 'talk' | 'happy';

const PAL: Record<string, string> = {
  k: '#2e2a26', // 黒（髪・輪郭）
  s: '#f2d5b8', // 肌
  w: '#ffffff', // 白
  t: '#3f7f8c', // 主人公ジャケット（ティール）
  d: '#33646f', // ティール影
  b: '#8ca3b8', // 翔子先生ジャケット（ブルーグレー）
  c: '#71889e', // ブルーグレー影
  g: '#3a3a3a', // メガネ（四角・黒）
  n: '#54473b', // ズボン
  r: '#c96f4a', // テラコッタ（ハナさんエプロン）
  o: '#e8a24a', // ことばの灯・アクセント
  u: '#4a5e78', // ゲンさん制服ネイビー
  y: '#d9c49a', // かばん・パン
  e: '#7a5c44', // 靴・木
  p: '#b9536b', // ハナさん髪飾り
  f: '#dde6ee', // 霧（silhouette用）
};

const Sprite = ({ map, title, className, decorative }: {
  map: string[]; title: string; className?: string; decorative?: boolean;
}) => {
  const h = map.length, w = map[0].length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%"
      role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : title}
      shapeRendering="crispEdges" className={className} style={{ imageRendering: 'pixelated' }}>
      {!decorative && <title>{title}</title>}
      {map.flatMap((row, y) => [...row].map((ch, x) =>
        ch === '.' ? null : <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={PAL[ch] ?? '#000'} />))}
    </svg>
  );
};

// 状態差分: 脚（walk）・腕（talk=片手を上げる・happy=両手を上げる）を行単位で差し替える
const withPose = (base: string[], pose: SpritePose, rows: Partial<Record<SpritePose, Record<number, string>>>): string[] => {
  const patch = rows[pose];
  if (!patch) return base;
  return base.map((row, i) => patch[i] ?? row);
};

/** 主人公（旅の学習者・成人）。ティールの上着＋肩掛けかばん */
export const HeroSprite = ({ className, pose = 'idle', decorative }: { className?: string; pose?: SpritePose; decorative?: boolean }) => (
  <Sprite className={className} decorative={decorative} title={`主人公（${pose}・オリジナル）`} map={withPose([
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
  ], pose, {
    walk: { 11: '...n.n....', 12: '..n...n...', 13: '.ee....ee.' },
    talk: { 6: '..ttttt.s.', 7: '.tttttts..', 8: '.t.tttt...' },
    happy: { 5: '.s.ssss.s.', 6: '.stttttts.', 7: '..tttttt..', 8: '..tttttt..' },
  })} />
);

/** 翔子先生（言葉の案内人）。黒髪ボブ＋四角メガネ＋ブルーグレージャケット */
export const ShokoSprite = ({ className, pose = 'idle', decorative }: { className?: string; pose?: SpritePose; decorative?: boolean }) => (
  <Sprite className={className} decorative={decorative} title={`翔子先生（${pose}・オリジナル）`} map={withPose([
    '..kkkkkk..',
    '.kkkkkkkk.',
    '.kksssskk.',
    '.kggsggsk.',
    '.kgssssgk.',
    '.k.ssss.k.',
    '..bbbbbb..',
    '.bbbbbbbb.',
    '.b.bbbb.b.',
    '.c.bbbb.c.',
    '...cccc...',
    '...n..n...',
    '...n..n...',
    '..ee..ee..',
  ], pose, {
    walk: { 11: '...n.n....', 12: '..n...n...', 13: '.ee....ee.' },
    talk: { 6: '..bbbbb.s.', 7: '.bbbbbbs..', 8: '.b.bbbb...' },
    happy: { 5: '.s.ssss.s.', 6: '.sbbbbbbs.', 7: '..bbbbbb..', 8: '..bbbbbb..' },
  })} />
);

/** パン屋のハナさん。テラコッタのエプロン＋髪飾り */
export const NpcHanaSprite = ({ className, pose = 'idle', decorative }: { className?: string; pose?: SpritePose; decorative?: boolean }) => (
  <Sprite className={className} decorative={decorative} title={`パン屋のハナさん（${pose}・オリジナル）`} map={withPose([
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
  ], pose, {
    talk: { 6: '..wrrrr.s.', 7: '.wrrrrrs..', 8: '.w.rrrr...' },
    happy: { 5: '.s.ssss.s.', 6: '.swrrrrws.', 7: '..wrrrrw..' },
  })} />
);

/** 駅員のゲンさん。ネイビーの制服＋帽子 */
export const NpcGenSprite = ({ className, pose = 'idle', decorative }: { className?: string; pose?: SpritePose; decorative?: boolean }) => (
  <Sprite className={className} decorative={decorative} title={`駅員のゲンさん（${pose}・オリジナル）`} map={withPose([
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
  ], pose, {
    talk: { 6: '..uuuuu.s.', 7: '.uuuuuus..', 8: '.u.uuuu...' },
    happy: { 5: '.s.ssss.s.', 6: '.suuuuuus.', 7: '..uuuuuu..' },
  })} />
);

/** 霧の中の人影（未出会いNPCのsilhouette）。個人を特定できない汎用の輪郭 */
export const NpcSilhouette = ({ className }: { className?: string }) => (
  <Sprite className={className} decorative title="霧の中の人影" map={[
    '...ffff...',
    '..ffffff..',
    '..ffffff..',
    '...ffff...',
    '..ffffff..',
    '.ffffffff.',
    '.f.ffff.f.',
    '...ffff...',
    '...f..f...',
    '...f..f...',
  ]} />
);

/** ことばの灯（Quest marker／街灯）。オリジナルのランタンモチーフ */
export const LanternMarker = ({ className, decorative }: { className?: string; decorative?: boolean }) => (
  <Sprite className={className} decorative={decorative} title="ことばの灯（Questの目印）" map={[
    '..kk..',
    '.kook.',
    'kooook',
    'kooook',
    '.kook.',
    '..kk..',
  ]} />
);

// ── 見下ろし型 町マップ v2（オリジナル・48x36グリッド） ──
const M = {
  grass: '#9db877', grassDark: '#8fac6c', grassLight: '#a8c184',
  path: '#d9c49a', pathEdge: '#cbb489', pathSide: '#c9b98f',
  roofA: '#c96f4a', roofB: '#7f9bb5', wall: '#f0e6d2', wallShade: '#e2d4ba',
  treeTop: '#6d9460', treeDark: '#5d8253', treeLight: '#7ca26b', trunk: '#8a6f52',
  water: '#7fb3c9', waterDeep: '#6aa1b8', stone: '#b8b2a6', stoneDark: '#a29c8e',
  station: '#7f9bb5', stationRoof: '#5d7a94', sign: '#8a6f52', signFace: '#e8dcc0',
  lantern: '#e8a24a', lanternPost: '#5c5148', flowerR: '#c96f6f', flowerY: '#e0c060', flowerW: '#efe9dc',
  fence: '#a0876a', bench: '#9a7d5c',
} as const;

const Tree = ({ x, y, big }: { x: number; y: number; big?: boolean }) => big ? (
  <g>
    <rect x={x + 2} y={y + 4} width={2} height={2.5} fill={M.trunk} />
    <rect x={x} y={y} width={6} height={4.5} fill={M.treeTop} />
    <rect x={x} y={y} width={2} height={1.5} fill={M.treeLight} />
    <rect x={x + 4} y={y + 3} width={2} height={1.5} fill={M.treeDark} />
  </g>
) : (
  <g>
    <rect x={x + 1} y={y + 3} width={2} height={2} fill={M.trunk} />
    <rect x={x} y={y} width={4} height={3} fill={M.treeTop} />
    <rect x={x} y={y} width={1} height={1} fill={M.treeLight} />
    <rect x={x + 3} y={y + 2} width={1} height={1} fill={M.treeDark} />
  </g>
);

const House = ({ x, y, roof, door = true }: { x: number; y: number; roof: string; door?: boolean }) => (
  <g>
    <rect x={x} y={y + 2} width={6} height={4} fill={M.wall} />
    <rect x={x} y={y + 5} width={6} height={1} fill={M.wallShade} />
    <rect x={x - 1} y={y} width={8} height={3} fill={roof} />
    <rect x={x + 1} y={y + 3.5} width={1.4} height={1.2} fill={M.stationRoof} opacity={0.55} />
    {door && <rect x={x + 3.4} y={y + 4} width={1.8} height={2} fill={M.trunk} />}
  </g>
);

/** 街灯（ことばの灯）。解放エリアで点灯表示に使う */
const LanternPost = ({ x, y, lit }: { x: number; y: number; lit?: boolean }) => (
  <g>
    <rect x={x + 0.4} y={y + 1.2} width={0.7} height={2.6} fill={M.lanternPost} />
    <rect x={x} y={y} width={1.5} height={1.4} fill={lit ? M.lantern : M.stoneDark} />
    {lit && <rect x={x - 0.5} y={y - 0.5} width={2.5} height={2.4} fill={M.lantern} opacity={0.22} rx={0.6} />}
  </g>
);

const Bench = ({ x, y }: { x: number; y: number }) => (
  <g>
    <rect x={x} y={y} width={2.6} height={0.7} fill={M.bench} />
    <rect x={x + 0.2} y={y + 0.7} width={0.5} height={0.8} fill={M.lanternPost} />
    <rect x={x + 1.9} y={y + 0.7} width={0.5} height={0.8} fill={M.lanternPost} />
  </g>
);

const FlowerBed = ({ x, y }: { x: number; y: number }) => (
  <g>
    <rect x={x} y={y} width={3} height={1.6} fill={M.grassLight} />
    <rect x={x + 0.3} y={y + 0.3} width={0.6} height={0.6} fill={M.flowerR} />
    <rect x={x + 1.2} y={y + 0.7} width={0.6} height={0.6} fill={M.flowerY} />
    <rect x={x + 2.1} y={y + 0.2} width={0.6} height={0.6} fill={M.flowerW} />
  </g>
);

export interface TownMapProps {
  /** 解放済み場所（灯の点灯・看板の可読化に使用） */
  discoveredLocationIds?: string[];
}

/** 町の見下ろしマップ本体 v2。座標系 0..48 x 0..36（chapter1Dataの%座標: x*0.48, y*0.36） */
export const TownMapBase = ({ discoveredLocationIds = [] }: TownMapProps) => {
  const lit = (loc: string) => discoveredLocationIds.includes(loc);
  return (
    <g shapeRendering="crispEdges">
      {/* 草地（3トーンで生活感） */}
      <rect x={0} y={0} width={48} height={36} fill={M.grass} />
      {[...Array(12)].map((_, i) => [...Array(9)].map((_, j) => ((i + j) % 2 === 0
        ? <rect key={`g${i}-${j}`} x={i * 4} y={j * 4} width={4} height={4} fill={M.grassDark} opacity={0.3} /> : null)))}
      <rect x={1} y={31} width={9} height={4} fill={M.grassLight} opacity={0.4} />
      <rect x={33} y={17} width={9} height={5} fill={M.grassLight} opacity={0.35} />
      {/* 旅路（太い本道）＋広場での広がり */}
      <path d="M 6 34 L 6 28 L 10 28 L 10 24 L 18 24 L 18 21 L 24 21 L 24 16 L 30 16 L 30 12 L 38 12 L 38 8 L 44 8"
        stroke={M.path} strokeWidth={3.4} fill="none" strokeLinecap="square" />
      <path d="M 6 34 L 6 28 L 10 28 L 10 24 L 18 24 L 18 21 L 24 21 L 24 16 L 30 16 L 30 12 L 38 12 L 38 8 L 44 8"
        stroke={M.pathEdge} strokeWidth={0.5} fill="none" strokeDasharray="1 2" opacity={0.7} />
      <rect x={26.2} y={11.4} width={8.6} height={6.6} fill={M.path} rx={1} />
      {/* 次Areaへ続く道（駅の先・霧の向こうへ） */}
      <path d="M 44 8 L 47.8 8" stroke={M.pathSide} strokeWidth={2.4} fill="none" strokeDasharray="1.2 1" opacity={0.8} />
      {/* 町の入口（門柱＋柵＋花壇） */}
      <rect x={4.5} y={26.5} width={1.2} height={3} fill={M.trunk} />
      <rect x={7.5} y={26.5} width={1.2} height={3} fill={M.trunk} />
      <rect x={4} y={26} width={5.2} height={1} fill={M.sign} />
      <rect x={1} y={27.2} width={3.2} height={0.6} fill={M.fence} />
      <rect x={9} y={27.2} width={3.2} height={0.6} fill={M.fence} />
      <FlowerBed x={2} y={29.5} />
      <LanternPost x={9.6} y={24.5} lit={lit('c1-town-gate')} />
      {/* ことば通り（個性の違う家2軒＋パン屋） */}
      <House x={14} y={17} roof={M.roofA} />
      <House x={21} y={23} roof={M.roofB} />
      <g>{/* パン屋（ひさし縞＋小さな看板） */}
        <rect x={16} y={25} width={6} height={4} fill={M.wall} />
        <rect x={15.5} y={24} width={7} height={1.6} fill={M.roofA} />
        {[0, 1, 2, 3].map(i => <rect key={i} x={16 + i * 1.5} y={26.4} width={0.9} height={0.9} fill={M.lantern} opacity={0.9} />)}
        <rect x={18} y={27.8} width={2} height={1.2} fill={M.trunk} />
        <rect x={22.3} y={25.6} width={1.4} height={1.1} fill={M.signFace} stroke={M.sign} strokeWidth={0.2} />
      </g>
      <LanternPost x={19.5} y={19.6} lit={lit('c1-main-street')} />
      <FlowerBed x={12.5} y={25.6} />
      {/* みなも広場（水盤＋ことばの碑＋ベンチ） */}
      <rect x={27.5} y={12.5} width={5} height={4} fill={M.stone} />
      <rect x={28.5} y={13.5} width={3} height={2} fill={M.water} />
      <rect x={29} y={14} width={2} height={1} fill={M.waterDeep} />
      <rect x={26.6} y={12} width={1} height={2.2} fill={M.stoneDark} />
      <rect x={26.35} y={11.6} width={1.5} height={0.6} fill={lit('c1-plaza') ? M.lantern : M.stoneDark} />
      <Bench x={27} y={17.4} />
      <Bench x={31} y={17.4} />
      <FlowerBed x={33} y={13} />
      <LanternPost x={25.2} y={13.6} lit={lit('c1-plaza')} />
      {/* 駅前（駅舎＋ホーム＋駅名板） */}
      <rect x={39} y={4} width={8} height={4.5} fill={M.station} />
      <rect x={38.5} y={3} width={9} height={1.6} fill={M.stationRoof} />
      <rect x={41} y={6} width={1.6} height={2.5} fill={M.wall} />
      <rect x={44} y={6} width={1.6} height={2.5} fill={M.wall} />
      <rect x={39} y={9} width={8} height={0.8} fill={M.stone} />
      <rect x={39.6} y={4.6} width={2.6} height={0.9} fill={M.signFace} />
      <LanternPost x={37} y={9.6} lit={lit('c1-station-front')} />
      {/* 掲示板（Quest4の対象・解放前は伏せ字がFog側で被る） */}
      <g>
        <rect x={31.5} y={9.2} width={3} height={2} fill={M.signFace} stroke={M.sign} strokeWidth={0.25} />
        <rect x={32.6} y={11.2} width={0.8} height={1.1} fill={M.trunk} />
        {lit('c1-station-front')
          ? <><rect x={31.9} y={9.7} width={2.2} height={0.35} fill={M.stationRoof} /><rect x={31.9} y={10.4} width={1.6} height={0.35} fill={M.stationRoof} /></>
          : <><rect x={31.9} y={9.7} width={2.2} height={0.35} fill={M.stoneDark} opacity={0.5} /><rect x={31.9} y={10.4} width={1.6} height={0.35} fill={M.stoneDark} opacity={0.5} /></>}
      </g>
      {/* 木々（大小混在・反復を避けた配置） */}
      <Tree x={2} y={3} big /><Tree x={10} y={8} /><Tree x={42} y={19} big />
      <Tree x={36} y={26} /><Tree x={26} y={30} big /><Tree x={3} y={16} />
      <Tree x={14} y={12} /><Tree x={44} y={30} />
      {/* 小さな池（右下の余白へ生活感） */}
      <rect x={38} y={31} width={5} height={2.6} fill={M.water} rx={0.8} />
      <rect x={39} y={31.7} width={2.4} height={1} fill={M.waterDeep} rx={0.5} />
    </g>
  );
};

/** 場所Fogの可視化（矩形＋点線境界＋ラベル）。色・透明度だけに依存しない */
export const LocationFogOverlay = ({ region, level, animate }: {
  region: { x: number; y: number; w: number; h: number };
  level: 'clear' | 'light_fog' | 'foggy' | 'review_needed';
  animate?: boolean;
}) => {
  if (level === 'clear') return null;
  const conf = {
    light_fog: { fill: '#e3ebf2', opacity: 0.4, dash: '0.8 1.2', label: '薄霧' },
    foggy: { fill: '#dde6ee', opacity: 0.92, dash: '0', label: '霧' },
    review_needed: { fill: '#e6dfeb', opacity: 0.55, dash: '1.2 0.8', label: '再会待ち' },
  }[level];
  return (
    <g style={animate ? { transition: 'opacity 1.2s ease' } : undefined}>
      <rect x={region.x} y={region.y} width={region.w} height={region.h}
        fill={conf.fill} opacity={conf.opacity} rx={1.5} />
      {conf.dash !== '0' && (
        <rect x={region.x + 0.3} y={region.y + 0.3} width={region.w - 0.6} height={region.h - 0.6}
          fill="none" stroke="#9aa8b5" strokeWidth={0.25} strokeDasharray={conf.dash} rx={1.2} />
      )}
      <text x={region.x + region.w / 2} y={region.y + 1.9} textAnchor="middle"
        fontSize={1.6} fill="#6b7a88" aria-hidden>{conf.label}</text>
    </g>
  );
};
