// 冒険世界地図の風景（すべて自作SVG・2026-08-19）。
//
// - **外部素材・既存IPは使わない。** 単純な図形の組み合わせだけで描く
// - ここにあるのは**進捗を主張しない装飾**だけ（原則13）: 地形・固定ランドマーク・雲は
//   世界の骨格であり、数字や達成のふりは一切しない。実測の状態は AdvWorldMap 側が
//   道とノード（regions[].state）で描く
// - 世界の縦積み: 下=海と港ミナト → 中腹=平野・市場・森 → 上=遺跡 → 最上=ソラノ塔
//   （advRoute の DESTINATION / conversationStartArea と同じ並び）
// - 文字は描かない（翻訳できないため。地名・状態は必ずHTML側で出す）
// - 地形は地域カードのシーン絵（AdvMapLandmarks）よりくすませ、カードの絵が引き立つ彩度差をつける
import type { LandmarkKind, RegionState } from '../../../lib/aiLesson/course/adventure/advMapModel';

/** 世界地図の色トークン。道の状態色は現行の全体図・道リストと同一（連続性維持） */
export const WORLD_PALETTE = {
  sea: '#8ecbe8', seaDeep: '#6db2d8', foam: '#e6f6ff', sand: '#f2e2b8',
  plain: '#cfe8b0', plainDeep: '#aed592',
  forest: '#8cc48b', forestDeep: '#5f9e6d',
  high: '#dccfae', highDeep: '#c3b28c', ruin: '#b9a98b',
  skyTop: '#dff0fe', skyBottom: '#f6fbff', peak: '#a9c1dd',
  river: '#7cc3e8',
  roadDone: '#f59e0b', roadDoneGlow: '#fde68a', roadCurrent: '#60a5fa',
  roadTodo: '#cbd5e1', roadFuture: '#94a3b8',
  fogA: '#f1f5f9', fogB: '#e2e8f0', fogC: '#eef2f7',
  nodeCurrent: '#2563eb',
} as const;

const P = WORLD_PALETTE;

/** ノード足元の地面ブロブの色（立っている地形バンドに合わせる） */
export const groundBlobColor = (y: number): string =>
  y >= 470 ? P.sand : y >= 336 ? P.plainDeep : y >= 248 ? P.forestDeep : y >= 96 ? P.highDeep : P.peak;

/* ────────────────────────────────────────────────────────────
   固定の1枚風景（常時描画・進捗と無関係な世界の骨格）
   ──────────────────────────────────────────────────────────── */

/** 木立（ユカリの森などの賑やかし） */
const Grove = ({ x, y, s = 1 }: { x: number; y: number; s?: number }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={0.9}>
    <rect x={-1.5} y={-4} width={3} height={7} fill="#7a6a4f" />
    <circle cx={0} cy={-8} r={6.5} fill={P.forestDeep} />
    <circle cx={-5} cy={-4} r={4.5} fill={P.forest} />
    <circle cx={5} cy={-4} r={4.5} fill={P.forest} />
  </g>
);

export const WorldScenery = ({ uid }: { uid: string }) => (
  <g data-adv-scenery="svg">
    <defs>
      <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={P.skyTop} />
        <stop offset="100%" stopColor={P.skyBottom} />
      </linearGradient>
      <linearGradient id={`${uid}-bay`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={P.sea} />
        <stop offset="100%" stopColor={P.seaDeep} />
      </linearGradient>
    </defs>

    {/* ① 空・太陽・鳥 */}
    <rect x="0" y="0" width="360" height="600" fill={`url(#${uid}-sky)`} />
    <circle cx="312" cy="46" r="24" fill="#ffe9a8" opacity="0.25" />
    <circle cx="312" cy="46" r="15" fill="#ffe9a8" opacity="0.9" />
    <g stroke="#7b93ad" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.55">
      <path d="M56 90 q4 -5 8 0 q4 -5 8 0" />
      <path d="M92 72 q3.5 -4 7 0 q3.5 -4 7 0" />
    </g>

    {/* ③ 地形バンド（上=高地 → 森 → 平野 → 海岸）。上から順に塗り重ねる */}
    <path d="M0 102 Q 45 90 90 98 T 180 94 T 270 100 T 360 94 L360 600 L0 600 Z" fill={P.high} />
    {/* 最上部の峰（ソラノ塔の台座になる山なみ） */}
    <path d="M96 142 L188 58 L266 142 Z" fill={P.peak} opacity="0.45" />
    <path d="M170 150 L254 32 L346 150 Z" fill={P.peak} opacity="0.85" />
    <path d="M254 32 L276 64 L232 64 Z" fill="#ffffff" opacity="0.9" />
    <path d="M0 254 Q 60 240 120 250 T 240 246 T 360 250 L360 600 L0 600 Z" fill={P.forest} />
    <path d="M0 342 Q 60 330 120 338 T 240 334 T 360 338 L360 600 L0 600 Z" fill={P.plain} />
    <path d="M0 470 Q 90 460 180 466 T 360 464 L360 600 L0 600 Z" fill={P.sand} />

    {/* 等高線（各バンド3本・うっすら）。地形の起伏を感じさせる */}
    <g fill="none" strokeWidth="1" opacity="0.18">
      <path d="M0 136 q 45 7 90 0 t 90 0 t 90 0 t 90 0" stroke={P.highDeep} />
      <path d="M0 172 q 45 -7 90 0 t 90 0 t 90 0 t 90 0" stroke={P.highDeep} />
      <path d="M0 210 q 45 7 90 0 t 90 0 t 90 0 t 90 0" stroke={P.highDeep} />
      <path d="M0 276 q 45 -6 90 0 t 90 0 t 90 0 t 90 0" stroke={P.forestDeep} />
      <path d="M0 298 q 45 6 90 0 t 90 0 t 90 0 t 90 0" stroke={P.forestDeep} />
      <path d="M0 320 q 45 -6 90 0 t 90 0 t 90 0 t 90 0" stroke={P.forestDeep} />
      <path d="M0 372 q 45 7 90 0 t 90 0 t 90 0 t 90 0" stroke={P.plainDeep} />
      <path d="M0 406 q 45 -7 90 0 t 90 0 t 90 0 t 90 0" stroke={P.plainDeep} />
      <path d="M0 440 q 45 7 90 0 t 90 0 t 90 0 t 90 0" stroke={P.plainDeep} />
    </g>

    {/* ② 湾（会話の環状路がめぐる内海）と波 */}
    <rect x="36" y="480" width="288" height="96" rx="36" fill={`url(#${uid}-bay)`} />
    <rect x="36" y="480" width="288" height="96" rx="36" fill="none" stroke={P.foam} strokeWidth="2.5" opacity="0.8" />
    <g stroke={P.foam} strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.7">
      <path d="M120 512 q 9 -5 18 0 q 9 5 18 0" />
      <path d="M210 542 q 8 -4 16 0 q 8 4 16 0" />
      <path d="M96 552 q 8 -4 16 0" />
    </g>

    {/* ④ 川（高地の湧き水 → 蛇行して海岸へ）と装飾橋2つ。ハタラキ街の東側を流す */}
    <ellipse cx="310" cy="150" rx="9" ry="4" fill={P.river} opacity="0.8" />
    <path d="M310 150 C 326 184 320 222 298 252 C 284 272 272 300 258 336 C 244 372 222 396 232 428 C 238 446 222 452 210 470"
      fill="none" stroke={P.river} strokeWidth="6" strokeLinecap="round" opacity="0.9" />
    <path d="M310 150 C 326 184 320 222 298 252 C 284 272 272 300 258 336 C 244 372 222 396 232 428 C 238 446 222 452 210 470"
      fill="none" stroke="#ffffff" strokeWidth="1.2" strokeDasharray="6 7" strokeLinecap="round" opacity="0.7" />
    <ellipse cx="210" cy="471" rx="10" ry="3.5" fill={P.foam} opacity="0.8" />
    <g fill="#b08968">
      <rect x="247" y="331" width="22" height="6" rx="2" transform="rotate(-13 258 334)" />
      <rect x="222" y="424" width="20" height="5.5" rx="2" transform="rotate(-16 232 427)" />
    </g>

    {/* ⑤ 固定ランドマーク（AdvMapLandmarks の意匠を簡略トレース。世界の骨格） */}
    {/* ミナト（港）: 灯台の岬＋桟橋＋船。桟橋の突端から旅が始まる */}
    <g>
      <ellipse cx="64" cy="556" rx="34" ry="15" fill={P.sand} />
      <path d="M86 548 L166 534" stroke="#b08968" strokeWidth="5" strokeLinecap="round" />
      <path d="M104 545 v6 M126 541 v6 M148 537 v6" stroke="#8f6b4e" strokeWidth="2" />
      <ellipse cx="170" cy="534" rx="9" ry="4" fill="#b08968" />
      <rect x="56" y="524" width="9" height="22" fill="#f6f0e2" />
      <rect x="56" y="530" width="9" height="4" fill="#d97066" />
      <rect x="53.5" y="519" width="14" height="6" rx="2" fill="#c97f55" />
      <circle cx="60.5" cy="522" r="1.6" fill="#ffe9a8" />
      <path d="M118 562 q 11 8 22 0 l -3 -6 h -16 Z" fill="#a9713d" />
      <path d="M129 546 v10 M129 546 l9 7 h-9" stroke="#7a5a3a" strokeWidth="1.6" fill="#ffffff" />
    </g>
    {/* ヒノデ台: 段々畑テラス */}
    <g>
      <path d="M224 444 q 26 -12 52 0 l0 6 q -26 8 -52 0 Z" fill={P.plainDeep} />
      <path d="M231 434 q 19 -9 38 0 l0 6 q -19 6 -38 0 Z" fill={P.plain} />
      <path d="M238 425 q 12 -6 24 0 l0 6 q -12 4 -24 0 Z" fill={P.plainDeep} />
      <rect x="246" y="416" width="7" height="6" fill="#f6f0e2" />
      <path d="M244.5 416 l5 -4.5 5 4.5 Z" fill="#d97066" />
    </g>
    {/* 市場（イチバ）: テント市 */}
    <g>
      <ellipse cx="120" cy="368" rx="26" ry="6" fill={P.plainDeep} opacity="0.7" />
      <path d="M100 366 l11 -15 11 15 Z" fill="#e08a66" />
      <path d="M104.5 366 l6.5 -9 6.5 9 Z" fill="#f6f0e2" />
      <path d="M124 366 l10 -13 10 13 Z" fill="#d9a441" />
      <path d="M128 366 l6 -8 6 8 Z" fill="#f6f0e2" />
    </g>
    {/* トオリミチ: 街道沿いの家 */}
    <g>
      <path d="M252 362 q 18 -8 40 -4" stroke={P.highDeep} strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.6" />
      <rect x="262" y="342" width="17" height="13" fill="#f6f0e2" />
      <path d="M259 342 l11.5 -9 11.5 9 Z" fill="#c96a55" />
      <rect x="268" y="348" width="5" height="7" fill="#9a7d58" />
    </g>
    {/* ユカリの森: 木立×3 */}
    <Grove x={70} y={288} s={1.05} />
    <Grove x={166} y={272} s={0.9} />
    <Grove x={294} y={296} s={1.15} />
    {/* ハタラキ街: 家並みと煙突 */}
    <g>
      <rect x="262" y="196" width="15" height="12" fill="#e9dfc8" />
      <path d="M259 196 l10.5 -8 10.5 8 Z" fill="#b3766a" />
      <rect x="280" y="192" width="17" height="16" fill="#d9cdb2" />
      <path d="M277 192 l11.5 -9 11.5 9 Z" fill="#9a8266" />
      <rect x="290" y="180" width="4" height="9" fill="#8a7458" />
      <circle cx="293" cy="174" r="2.6" fill="#ffffff" opacity="0.75" />
      <circle cx="297" cy="168" r="2" fill="#ffffff" opacity="0.55" />
    </g>
    {/* カタチの遺跡: 石柱と鳥居のシルエット */}
    <g>
      <ellipse cx="94" cy="140" rx="26" ry="6" fill={P.highDeep} opacity="0.6" />
      <rect x="78" y="120" width="6" height="18" fill={P.ruin} />
      <rect x="89" y="114" width="6" height="24" fill="#cbbc9d" />
      <rect x="100" y="122" width="6" height="16" fill={P.ruin} />
      <rect x="75" y="110" width="34" height="5" fill="#a08a67" />
      <path d="M114 138 v-13 m8 13 v-13 m-10 2 h12 m-13 -4 h14" stroke="#8f7a5c" strokeWidth="2.4" fill="none" />
    </g>
    {/* ソラノ塔: 世界の頂（N2の目的地） */}
    <g>
      <ellipse cx="252" cy="72" rx="17" ry="5" fill={P.peak} opacity="0.7" />
      <rect x="243" y="34" width="18" height="37" rx="2" fill="#e3e9f5" />
      <rect x="243" y="34" width="6" height="37" fill="#b9c6de" opacity="0.7" />
      <path d="M252 8 L266 36 H238 Z" fill="#8598c9" />
      <rect x="248.5" y="44" width="7" height="9" rx="1.5" fill="#5d739e" />
      <rect x="248.5" y="58" width="7" height="12" rx="1.5" fill="#5d739e" opacity="0.85" />
      <path d="M252 8 v-6 l9 3 l-9 3" stroke="#5d739e" strokeWidth="1.6" fill="#d9a441" />
    </g>
  </g>
);

/* ────────────────────────────────────────────────────────────
   雲海（目標より先の土地を覆う）。「この先にまだ世界がある」の絵
   ──────────────────────────────────────────────────────────── */

/** 波形スカラップ縁の雲パス（上端は画面外まで覆う） */
const scallopD = (edge: number, amp: number): string => {
  let d = `M0 -40 H360 V${Math.round(edge)}`;
  for (let i = 0; i < 6; i += 1) d += ` q -30 ${amp} -60 0`;
  return `${d} Z`;
};

/**
 * 雲海。edgeY より上を3枚重ねの雲で覆う。下端約120pxは薄めのグラデにして
 * 下の地形が2〜4割透ける。雲の上には主要アンカーのゴースト輪郭＝「影が見える」。
 * 雲パフの漂いは motion-safe ブロックの CSS クラス（reduced-motion で自動静止）
 */
export const CloudSea = ({ uid, edgeY, veil = 'solid' }: {
  uid: string; edgeY: number;
  /**
   * 覆い方（2026-08-22）。
   * 'solid' … 自作SVG風景版。ほぼ不透明で隠す（下は簡単な図形なので隠して困らない）
   * 'mist'  … 画像版。**遠くの霞**にして絵を透かす。
   *   N5目標だと目的地が画面下端＝雲海が地図の75%を覆い、せっかくの地図が
   *   ただの白い面になっていた（2026-08-22 レベル別レンダリングで発覚）。
   *   初級者ほど「世界が見える」ことが続ける理由になるので、隠しきらない
   */
  veil?: 'solid' | 'mist';
}) => {
  const gid = `${uid}-cloudfade`;
  // 下端120pxぶんから透け始める（objectBoundingBox基準の近似で十分）
  const fadeFrom = Math.max(0, 1 - 120 / (edgeY + 40));
  const mist = veil === 'mist';
  const op = mist
    ? { top: '0.62', mid: '0.54', bottom: '0.18', under: 0.25, over: 0.35, puff: 0.7 }
    : { top: '0.94', mid: '0.88', bottom: '0.38', under: 0.45, over: 0.65, puff: 0.85 };
  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={P.fogA} stopOpacity={op.top} />
          <stop offset={`${Math.round(fadeFrom * 100)}%`} stopColor={P.fogA} stopOpacity={op.mid} />
          <stop offset="100%" stopColor={P.fogA} stopOpacity={op.bottom} />
        </linearGradient>
      </defs>
      <path d={scallopD(edgeY + 10, 12)} fill={P.fogC} opacity={op.under} />
      <path d={scallopD(edgeY, 16)} fill={`url(#${gid})`} />
      <path d={scallopD(edgeY - 12, 14)} fill={P.fogB} opacity={op.over} />

      {/* 雲の中のゴースト輪郭（覆われている主要アンカーだけ）。塗りなし＝影。
          画像版は本物の建物が霞んで見えるので、二重に描かない */}
      <g fill="none" stroke={P.roadFuture} strokeWidth="1.5" opacity={mist ? 0 : 0.5} strokeLinejoin="round">
        {/* ソラノ塔（最上部なので雲海があるときは常に中） */}
        <path d="M243 70 V36 L252 10 L261 36 V70" />
        {edgeY > 140 && (
          /* カタチの遺跡 */
          <path d="M79 138 v-16 h5 v16 M90 138 v-22 h5 v22 M101 138 v-14 h5 v14 M75 112 h34" />
        )}
        {edgeY > 212 && (
          /* ハタラキ街 */
          <path d="M280 208 v-14 l9 -7 9 7 v14 Z M290 189 v-8 h4 v8" />
        )}
      </g>

      {/* 漂う雲パフ（装飾のみ・reduced-motionでは静止） */}
      <g className="adv-cloud-drift" fill="#ffffff" opacity={op.puff}>
        <ellipse cx="84" cy={edgeY - 16} rx="27" ry="10" />
        <ellipse cx="108" cy={edgeY - 9} rx="18" ry="7.5" />
      </g>
      <g className="adv-cloud-drift-slow" fill="#ffffff" opacity={op.puff - 0.05}>
        <ellipse cx="248" cy={edgeY - 22} rx="30" ry="11" />
        <ellipse cx="274" cy={edgeY - 13} rx="19" ry="8" />
      </g>
    </g>
  );
};

/* ────────────────────────────────────────────────────────────
   ミニランドマーク（ノード）。地域の landmark 17種を24×24の小さな姿で
   ──────────────────────────────────────────────────────────── */

/**
 * 状態の塗り。done=金 / current=青 / next=白地に金の輪郭 / locked=霧色。
 * 色だけに頼らない: 記号（Star/Flag/Chevron/Lock）と aria-label は HTML 側が持つ
 */
const NODE_TINT: Record<RegionState, { main: string; accent: string; outline: string | null; opacity: number }> = {
  done: { main: '#f59e0b', accent: '#b45309', outline: null, opacity: 1 },
  current: { main: '#2563eb', accent: '#1e40af', outline: null, opacity: 1 },
  next: { main: '#ffffff', accent: '#ffffff', outline: '#f59e0b', opacity: 1 },
  locked: { main: '#b6c2d1', accent: '#94a3b8', outline: null, opacity: 0.55 },
};

interface MiniProps { kind: LandmarkKind; state: RegionState; x: number; y: number }

/** 各地域のミニランドマーク。ノード位置 (x,y) の地面に立つ（高さ20px） */
export const MiniLandmark = ({ kind, state, x, y }: MiniProps) => {
  const c = NODE_TINT[state];
  // next は白塗りが地形に溶けるので金の輪郭を持つ（スケール後≈2pxになる太さ）
  const st = c.outline
    ? { stroke: c.outline, strokeWidth: 2.4, strokeLinejoin: 'round' as const }
    : {};
  // 線で描く形（道・噴水の水・道標の柱など）に使う線色。next では輪郭色に倒す
  const line = c.outline ?? c.main;

  const shape = (() => {
    switch (kind) {
      case 'camp':
        return (
          <>
            <path d="M12 4 L21 22 H3 Z" fill={c.main} {...st} />
            <path d="M12 13 L16.5 22 H7.5 Z" fill={c.accent} />
          </>
        );
      case 'bridge':
        return (
          <>
            <path d="M2 19 Q12 6 22 19" fill="none" stroke={line} strokeWidth="3" strokeLinecap="round" />
            <path d="M2 22 H22" stroke={c.accent === '#ffffff' ? line : c.accent} strokeWidth="3" strokeLinecap="round" />
            <path d="M7 14 V21 M12 10 V21 M17 14 V21" stroke={line} strokeWidth="1.8" />
          </>
        );
      case 'ruins':
        return (
          <>
            <path d="M4 12 h4 v10 h-4 Z M10 9 h4 v13 h-4 Z M16 12 h4 v10 h-4 Z" fill={c.main} {...st} />
            <rect x="2" y="7" width="20" height="3.2" fill={c.accent} {...st} />
          </>
        );
      case 'gate':
        return (
          <>
            <path d="M4.5 22 V8 h3.2 V22 Z M16.3 22 V8 h3.2 V22 Z" fill={c.main} {...st} />
            <path d="M2 5 h20 v3 h-20 Z" fill={c.accent} {...st} />
            <rect x="6.5" y="11.5" width="11" height="2.2" fill={c.main} />
          </>
        );
      case 'tower':
        return (
          <>
            <path d="M8 22 V10 h8 v12 Z" fill={c.main} {...st} />
            <path d="M12 2 L18.5 10 H5.5 Z" fill={c.accent} {...st} />
            <rect x="10.4" y="13" width="3.2" height="4.5" fill={c.accent === '#ffffff' ? '#f59e0b' : c.accent} opacity="0.9" />
          </>
        );
      case 'library':
        return (
          <>
            <rect x="4" y="11" width="16" height="11" fill={c.main} {...st} />
            <path d="M2 11 L12 3.5 L22 11 Z" fill={c.accent} {...st} />
          </>
        );
      case 'castle':
        return (
          <>
            <path d="M5 22 V10 h3 v2.4 h2.8 V10 h2.4 v2.4 h2.8 V10 h3 v12 Z" fill={c.main} {...st} />
            <path d="M10 22 v-6 h4 v6 Z" fill={c.accent} />
          </>
        );
      case 'village':
        return (
          <>
            <path d="M3 22 v-7 l4.5 -4.5 4.5 4.5 v7 Z" fill={c.main} {...st} />
            <path d="M13 22 v-6 l4 -3.8 4 3.8 v6 Z" fill={c.accent} {...st} />
          </>
        );
      case 'road':
        return (
          <>
            <path d="M6 22 C 15 18 8 10 16 4" fill="none" stroke={line} strokeWidth="3.6" strokeLinecap="round" />
            <rect x="15" y="2" width="6" height="4" rx="1" fill={c.accent} {...st} />
          </>
        );
      case 'hill':
        return (
          <>
            <path d="M1 22 Q7.5 9 14 22 Z" fill={c.main} {...st} />
            <path d="M10 22 Q17 7 23 22 Z" fill={c.accent} {...st} />
          </>
        );
      case 'avenue':
        return (
          <>
            <path d="M6 22 v-6 M18 22 v-6" stroke={line} strokeWidth="2" />
            <circle cx="6" cy="13" r="4.2" fill={c.main} {...st} />
            <circle cx="18" cy="13" r="4.2" fill={c.accent} {...st} />
          </>
        );
      case 'town':
        return (
          <>
            <rect x="3" y="12" width="8" height="10" fill={c.main} {...st} />
            <rect x="13" y="8" width="8" height="14" fill={c.accent} {...st} />
            <rect x="5.4" y="15" width="3.2" height="3.2" fill={c.accent === '#ffffff' ? '#f59e0b' : c.main} opacity="0.7" />
          </>
        );
      case 'plaza':
        return (
          <>
            <ellipse cx="12" cy="20.5" rx="9" ry="2.6" fill={c.accent} opacity="0.75" {...st} />
            <rect x="10.4" y="12" width="3.2" height="8" fill={c.main} {...st} />
            <path d="M12 8 q-5.5 2 -6.5 6.5 M12 8 q5.5 2 6.5 6.5" fill="none" stroke={line} strokeWidth="2" strokeLinecap="round" />
          </>
        );
      case 'mountain':
        return (
          <>
            <path d="M2 22 L10 6 L14.8 14 L17.8 9.5 L23 22 Z" fill={c.main} {...st} />
            <path d="M10 6 L12.8 10.8 H7.2 Z" fill="#ffffff" {...st} />
          </>
        );
      case 'crossroad':
        return (
          <>
            <path d="M12 22 V5" stroke={line} strokeWidth="2.4" />
            <path d="M12 6.5 h-8 l-2 2.4 2 2.4 h8 Z" fill={c.main} {...st} />
            <path d="M12 13 h8 l2 2.4 -2 2.4 h-8 Z" fill={c.accent} {...st} />
          </>
        );
      case 'forest':
        return (
          <>
            <path d="M7 22 H2 L7 8 L12 22 Z" fill={c.main} {...st} />
            <path d="M16.5 22 H11.5 L16.5 4.5 L21.5 22 Z" fill={c.accent} {...st} />
          </>
        );
      case 'city':
        return (
          <>
            <rect x="2" y="12" width="6" height="10" fill={c.accent} {...st} />
            <rect x="9.4" y="6" width="7" height="16" fill={c.main} {...st} />
            <rect x="17.6" y="14" width="4.8" height="8" fill={c.accent} {...st} />
            <path d="M11.4 9.5 h3 M11.4 13 h3 M11.4 16.5 h3" stroke="#ffffff" strokeWidth="1.2" opacity="0.8" />
          </>
        );
      default:
        return (
          <>
            <path d="M3 22 v-7 l4.5 -4.5 4.5 4.5 v7 Z" fill={c.main} {...st} />
            <path d="M13 22 v-6 l4 -3.8 4 3.8 v6 Z" fill={c.accent} {...st} />
          </>
        );
    }
  })();

  return (
    <svg x={x - 10} y={y - 20} width={20} height={20} viewBox="0 0 24 24"
      aria-hidden focusable="false" opacity={c.opacity}>
      {shape}
    </svg>
  );
};
