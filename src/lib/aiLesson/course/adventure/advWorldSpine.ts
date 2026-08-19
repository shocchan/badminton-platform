// 冒険世界地図の道ジオメトリ（純関数・2026-08-19 CEO要望「スタンプカードではなく冒険旅のマップに」）。
//
// - **DOM APIを使わない**（jsdomに getTotalLength が無い）。ベジェを16分割サンプリングして
//   折れ線化し、累積弧長 → 弧長位置の点、を自前実装する
// - ここは「どこに描くか」だけを決める。**描く状態は regions[].state のみ**（原則13）で、
//   状態の再計算・進捗の推定は一切しない
// - 世界の縦積みは advRoute の DESTINATION と一致:
//   N5=ミナト(港・下) / N4=トオリミチ(中腹) / N3=カタチの遺跡(上) / N2=ソラノ塔(最上)
import type { MapRegion, MapRouteKind } from './advMapModel';
import type { JlptLevel } from './advTypes';

export interface Pt { x: number; y: number }

/**
 * 試験レーンの背骨（海の桟橋 → ソラノ塔へ登る固定つづら折り13点。論理座標 360×600）。
 *
 * 注（2026-08-19 設計調整）: 原案の下部3点 [84,548] [150,520] [52,462] は、会話環状路の
 * 12ノード（間隔≒59px・位置固定）とのペア距離44px（テストで強制）を**幾何的に満たせない**
 * （例: (52,462) はリング左上角のノード(≒45,492)から31px）。そのため出発点を桟橋の突端
 * （湾内・全リングノードから≥52px）に置き、リング上辺のノード中間を抜けて登る形に調整した。
 * 港から出発→大きく西へ折り返し→つづら折りで登る、という旅の形は原案のまま。
 */
export const SPINE: [number, number][] = [
  [170, 532], [188, 470], [52, 445], [230, 436], [88, 374], [280, 345], [110, 300],
  [300, 265], [80, 225], [250, 185], [110, 150], [230, 115], [252, 70],
];

/** 目標レベル → 背骨上の道の終点（0..1）。目標を上げるほど道が地図の上方へ物理的に伸びる */
export const TARGET_END: Record<'N5' | 'N4' | 'N3' | 'N2', number> = {
  N5: 0.18, N4: 0.45, N3: 0.85, N2: 1.0,
};

/** 会話レーンの環状路（湾のまわり）。角丸矩形リング x36..324 y480..576 r36（周長≒706） */
const RING = { x0: 36, x1: 324, y0: 480, y1: 576, r: 36 } as const;
/** 会話レーンの開始点（リング上辺の左寄り）。ここから時計回り */
const RING_START: Pt = { x: 100, y: 480 };

/**
 * 区間ごとのベジェの膨らみ（法線方向px・±24以内）。
 * 下部（湾の近く）は北向きに固定して環状路ノードから離し、上部は交互に振って蛇行させる。
 */
const SEG_BULGE = [14, 18, -18, 18, -18, 18, -18, 18, -18, 18, -18, 16];
const SAMPLES_PER_SEG = 16;

/** 全ノードペアの最小距離（44pxタップ領域が重ならない） */
const MIN_NODE_GAP = 44;
/** 同一レーン隣接ノードの最小直線距離 */
const MIN_ADJ_CHORD = 48;

/* ────────────────────────────────────────────────────────────
   折れ線ユーティリティ（弧長パラメータ化）
   ──────────────────────────────────────────────────────────── */

interface Polyline { pts: Pt[]; cum: number[]; total: number }

const toPolyline = (pts: Pt[]): Polyline => {
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return { pts, cum, total: cum[cum.length - 1] };
};

/** 始点からの弧長 s の位置の点（範囲外はclamp） */
const pointOnPolyline = (pl: Polyline, s: number): Pt => {
  const c = Math.min(Math.max(s, 0), pl.total);
  let lo = 0;
  let hi = pl.cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (pl.cum[mid] <= c) lo = mid; else hi = mid;
  }
  const seg = pl.cum[hi] - pl.cum[lo];
  const t = seg === 0 ? 0 : (c - pl.cum[lo]) / seg;
  return {
    x: pl.pts[lo].x + (pl.pts[hi].x - pl.pts[lo].x) * t,
    y: pl.pts[lo].y + (pl.pts[hi].y - pl.pts[lo].y) * t,
  };
};

const fmt = (v: number): number => Math.round(v * 10) / 10;

/** 弧長 s0..s1 の区間を SVG path d（折れ線）にする */
const pathD = (pl: Polyline, s0: number, s1: number): string => {
  const a = Math.min(s0, s1);
  const b = Math.max(s0, s1);
  const start = pointOnPolyline(pl, a);
  const parts = [`M ${fmt(start.x)} ${fmt(start.y)}`];
  for (let i = 0; i < pl.pts.length; i += 1) {
    if (pl.cum[i] > a && pl.cum[i] < b) parts.push(`L ${fmt(pl.pts[i].x)} ${fmt(pl.pts[i].y)}`);
  }
  const end = pointOnPolyline(pl, b);
  parts.push(`L ${fmt(end.x)} ${fmt(end.y)}`);
  return parts.join(' ');
};

/* ────────────────────────────────────────────────────────────
   背骨（試験レーン）と環状路（会話レーン）の折れ線
   ──────────────────────────────────────────────────────────── */

const buildSpine = (): Polyline => {
  const pts: Pt[] = [{ x: SPINE[0][0], y: SPINE[0][1] }];
  for (let k = 0; k < SPINE.length - 1; k += 1) {
    const p0 = { x: SPINE[k][0], y: SPINE[k][1] };
    const p1 = { x: SPINE[k + 1][0], y: SPINE[k + 1][1] };
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    // 左法線。SEG_BULGE の符号と合わせて膨らむ向きが決まる
    const nx = -dy / len;
    const ny = dx / len;
    const b = SEG_BULGE[k] ?? 0;
    const c1 = { x: p0.x + dx / 3 + nx * b, y: p0.y + dy / 3 + ny * b };
    const c2 = { x: p0.x + (dx * 2) / 3 + nx * b, y: p0.y + (dy * 2) / 3 + ny * b };
    for (let i = 1; i <= SAMPLES_PER_SEG; i += 1) {
      const t = i / SAMPLES_PER_SEG;
      const mt = 1 - t;
      pts.push({
        x: mt * mt * mt * p0.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * p1.x,
        y: mt * mt * mt * p0.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * p1.y,
      });
    }
  }
  return toPolyline(pts);
};

const buildRing = (): Polyline => {
  const { x0, x1, y0, y1, r } = RING;
  const pts: Pt[] = [{ ...RING_START }];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const steps = 12;
    for (let i = 1; i <= steps; i += 1) {
      const a = a0 + ((a1 - a0) * i) / steps;
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  // 開始点(100,480)から時計回り（画面座標: 右→下→左→上）
  pts.push({ x: x1 - r, y: y0 });
  arc(x1 - r, y0 + r, -Math.PI / 2, 0);
  pts.push({ x: x1, y: y1 - r });
  arc(x1 - r, y1 - r, 0, Math.PI / 2);
  pts.push({ x: x0 + r, y: y1 });
  arc(x0 + r, y1 - r, Math.PI / 2, Math.PI);
  pts.push({ x: x0, y: y0 + r });
  arc(x0 + r, y0 + r, Math.PI, Math.PI * 1.5);
  pts.push({ ...RING_START });
  return toPolyline(pts);
};

let spineCache: Polyline | null = null;
const spine = (): Polyline => {
  if (!spineCache) spineCache = buildSpine();
  return spineCache;
};
let ringCache: Polyline | null = null;
const ring = (): Polyline => {
  if (!ringCache) ringCache = buildRing();
  return ringCache;
};

/** 背骨の全長（折れ線近似）。テスト用 */
export const spineTotalLength = (): number => spine().total;

/** 背骨上の点（t: 0..1 は弧長比）。テストで単調性・端点一致を確かめる */
export const spinePointAt = (t: number): Pt => pointOnPolyline(spine(), t * spine().total);

/** 環状路の周長。テスト用 */
export const ringTotalLength = (): number => ring().total;

/* ────────────────────────────────────────────────────────────
   レイアウト本体
   ──────────────────────────────────────────────────────────── */

export type RoadState = 'done' | 'current' | 'todo';

export interface WorldLayout {
  /** 試験レーンのノード位置（regions の exam 層を配列順のまま） */
  examPts: Pt[];
  /** 会話レーンのノード位置（regions の conversation 層を配列順のまま） */
  convPts: Pt[];
  /** 道の区間。同一レーン内の隣接ノードだけを結ぶ。state は「入る側ノード」の状態 */
  segments: { d: string; state: RoadState }[];
  /** 目標より先の背骨（まだ開いていない未来の道）。無ければ null */
  futureD: string | null;
  /** 会話環状路の下地一周（会話レーンがあるときだけ）。環状路だと分かる薄い線 */
  convRingD: string | null;
  /** 雲海の下端y（これより上を雲で覆う）。雲海なしは null */
  fogEdgeY: number | null;
  /** 旗（目的地）の位置＝レーン最後のノード */
  flagPt: Pt;
}

const stateOf = (s: MapRegion['state']): RoadState =>
  s === 'done' ? 'done' : s === 'current' ? 'current' : 'todo';

/**
 * regions（buildAdventureMap の実測）を世界地図上のノード・道に配置する。
 * - 試験レーン: 背骨に沿って港→目標終点（TARGET_END）まで等間隔
 * - 会話レーン: 環状路の周上に等間隔（並走レーンという製品実態を絵にする）
 * - 防御1: 隣接ノードの直線距離が48px未満なら T を最大+0.15まで広げる
 * - 防御2: 会話ノードと44px未満で重なる試験ノードは、**道に沿って**前後にずらして回避する
 *   （ノードを道から浮かさない。実配置はテストで全ペア≥44を強制）
 */
export const layoutWorldNodes = (
  regions: MapRegion[],
  target: JlptLevel | null,
  kind: MapRouteKind,
): WorldLayout => {
  const sp = spine();
  const rg = ring();
  const exam = regions.filter((r) => r.layer === 'exam');
  const conv = regions.filter((r) => r.layer === 'conversation');

  // 会話レーン: 環状路の周上に等間隔（開始点から時計回り）
  const convArc = (i: number): number => (rg.total * i) / Math.max(conv.length, 1);
  const convPts = conv.map((_, i) => pointOnPolyline(rg, convArc(i)));

  // 試験レーン: 港(0)→目標終点(T)まで等間隔
  const baseT = (target && target !== 'N1' ? TARGET_END[target] : undefined) ?? 1;
  const denom = Math.max(exam.length - 1, 1);
  const arcsFor = (t: number): number[] => exam.map((_, i) => (t * i * sp.total) / denom);
  const chordOk = (arcs: number[]): boolean => {
    for (let i = 1; i < arcs.length; i += 1) {
      const a = pointOnPolyline(sp, arcs[i - 1]);
      const b = pointOnPolyline(sp, arcs[i]);
      if (Math.hypot(a.x - b.x, a.y - b.y) < MIN_ADJ_CHORD) return false;
    }
    return true;
  };
  let T = baseT;
  const tMax = Math.min(baseT + 0.15, 1);
  while (!chordOk(arcsFor(T)) && T < tMax) T = Math.min(T + 0.01, tMax);
  const arcs = arcsFor(T);

  // 防御2: 会話ノードとの近接を道沿いのずらしで回避（6px刻み・±48pxまで・前方優先）
  const clearOf = (p: Pt): boolean =>
    convPts.every((q) => Math.hypot(p.x - q.x, p.y - q.y) >= MIN_NODE_GAP);
  const examPts: Pt[] = [];
  for (let i = 0; i < arcs.length; i += 1) {
    let p = pointOnPolyline(sp, arcs[i]);
    if (!clearOf(p)) {
      for (let step = 6; step <= 48; step += 6) {
        if (arcs[i] + step <= sp.total) {
          const fwd = pointOnPolyline(sp, arcs[i] + step);
          if (clearOf(fwd)) { p = fwd; arcs[i] += step; break; }
        }
        if (arcs[i] - step >= 0) {
          const back = pointOnPolyline(sp, arcs[i] - step);
          if (clearOf(back)) { p = back; arcs[i] -= step; break; }
        }
      }
    }
    examPts.push(p);
  }

  // 区間（同一レーン内の隣接ノードのみ）。色は「入る側ノード」の状態で決める（現行踏襲）
  const segments: WorldLayout['segments'] = [];
  for (let i = 1; i < exam.length; i += 1) {
    segments.push({ d: pathD(sp, arcs[i - 1], arcs[i]), state: stateOf(exam[i].state) });
  }
  for (let i = 1; i < conv.length; i += 1) {
    segments.push({ d: pathD(rg, convArc(i - 1), convArc(i)), state: stateOf(conv[i].state) });
  }

  const lastArc = arcs.length > 0 ? arcs[arcs.length - 1] : null;
  const futureD = kind !== 'conversation' && lastArc !== null && lastArc < sp.total - 4
    ? pathD(sp, lastArc, sp.total)
    : null;
  const convRingD = conv.length > 0 ? pathD(rg, 0, rg.total) : null;

  const flagPt = examPts.length > 0
    ? examPts[examPts.length - 1]
    : convPts.length > 0
      ? convPts[convPts.length - 1]
      : { x: SPINE[SPINE.length - 1][0], y: SPINE[SPINE.length - 1][1] };

  // 雲海: 現ルートの先にまだ土地がある目標（N5/N4/N3）のときだけ。
  // N2は世界の頂（N1未対応を偽って見せない）。会話クロップにも出さない
  const fogEdgeY = kind !== 'conversation' && examPts.length > 0
    && (target === 'N5' || target === 'N4' || target === 'N3')
    ? flagPt.y - 22
    : null;

  return { examPts, convPts, segments, futureD, convRingD, fogEdgeY, flagPt };
};
