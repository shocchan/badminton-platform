// 世界地図（AdvWorldMap）のセーフエリア算出スクリプト（2026-08-22・読み取り専用）。
// advWorldSpine.layoutWorldNodes の実配置を N5/N4/N3/N2 × combined/exam/conversation で
// 全パターン走査し、UI（ノードボタン44px・状態バッジ・旗ラベル・雲海・吹き出し）が
// 画像上のどこに乗るかを **正規化座標（0〜1）** で出す。DBには一切触れない。
// 実行: cd /Users/shocchan/badminton-aicourse && ./node_modules/.bin/vite-node scripts/ai-course/world-map-safe-area.ts
import { buildAdventureMap, type MapRouteKind } from '../../src/lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../src/lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../src/lib/aiLesson/course/adventure/advRoute';
import { layoutWorldNodes, SPINE, spinePointAt } from '../../src/lib/aiLesson/course/adventure/advWorldSpine';
import type { AdventureV2Profile, AdvGoalType, JlptLevel } from '../../src/lib/aiLesson/course/adventure/advTypes';

const NOW = '2026-08-22T00:00:00.000Z';
const VB = { w: 360, h: 600 };
const r3 = (v: number) => Math.round(v * 1000) / 1000;

const profileFor = (goalType: AdvGoalType, target: JlptLevel | null): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  enabled: true,
  goalType,
  targetJlpt: target,
  dailyMinutes: 15,
  route: generateRoute({
    goalType, targetJlpt: target, knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

interface Box { name: string; x0: number; y0: number; x1: number; y1: number }
const norm = (b: Box) => ({
  name: b.name,
  x0: r3(b.x0 / VB.w), y0: r3(b.y0 / VB.h), x1: r3(b.x1 / VB.w), y1: r3(b.y1 / VB.h),
});

const out: Record<string, unknown> = {};

const cases: { target: JlptLevel | null; goal: AdvGoalType; kind: MapRouteKind }[] = [
  { target: 'N5', goal: 'exam', kind: 'exam' },
  { target: 'N4', goal: 'exam', kind: 'exam' },
  { target: 'N3', goal: 'exam', kind: 'exam' },
  { target: 'N2', goal: 'exam', kind: 'exam' },
  { target: 'N5', goal: 'hybrid', kind: 'combined' },
  { target: 'N4', goal: 'hybrid', kind: 'combined' },
  { target: 'N3', goal: 'hybrid', kind: 'combined' },
  { target: 'N2', goal: 'hybrid', kind: 'combined' },
  { target: null, goal: 'conversation', kind: 'conversation' },
];

// 全ケースの和集合（どの目標・ルートでも UI が乗り得る範囲）
const union: Box[] = [];

for (const c of cases) {
  const p = profileFor(c.goal, c.target);
  const ids = p.route!.stages.map((s) => s.stageId);
  const map = buildAdventureMap(p, p.route, new Set(ids.slice(0, 2)), 3, c.kind, NOW);
  const layout = layoutWorldNodes(map.regions, p.targetJlpt, c.kind);
  const key = `${c.target ?? 'conv'}-${c.kind}`;
  // ノード位置（regions順）
  let e = 0; let cv = 0;
  const nodes = map.regions.map((r) => {
    const pt = r.layer === 'exam' ? layout.examPts[e++] : layout.convPts[cv++];
    return { id: r.id, layer: r.layer, nameJa: r.nameJa, landmark: r.landmark, x: r3(pt.x), y: r3(pt.y), nx: r3(pt.x / VB.w), ny: r3(pt.y / VB.h) };
  });
  // UI ボックス（論理座標 360×600 単位）
  const boxes: Box[] = [];
  for (const n of nodes) {
    // ボタン中心は (x, y-9)、44×44（論理座標でも 44 units）。バッジは右上に +9 はみ出す
    boxes.push({ name: `node:${n.id}`, x0: n.x - 22, y0: n.y - 9 - 22, x1: n.x + 22 + 2, y1: n.y - 9 + 22 });
    // 旗ラベル: ミニランドマーク自体（24×24 を足元中心に）
    boxes.push({ name: `landmark:${n.id}`, x0: n.x - 12, y0: n.y - 24, x1: n.x + 12, y1: n.y + 4 });
  }
  const flagX = Math.min(Math.max(layout.flagPt.x, 56), 304);
  const flagTop = layout.flagPt.y - 24; // -translate-y-full → ラベル下端がここ
  // 旗16px + ラベル高さ≈18px = 34px、幅 max 112px
  boxes.push({ name: 'flag-label', x0: flagX - 56, y0: flagTop - 36, x1: flagX + 56, y1: flagTop });
  if (layout.fogEdgeY !== null) {
    boxes.push({ name: 'cloud-sea', x0: 0, y0: 0, x1: VB.w, y1: layout.fogEdgeY });
    // 吹き出し: inset-x-3 top-2、高さ約 72〜90px（3行）
    boxes.push({ name: 'cloud-bubble', x0: 12, y0: 8, x1: VB.w - 12, y1: 8 + 96 });
  }
  out[key] = {
    nodeCount: nodes.length,
    flagPt: layout.flagPt,
    fogEdgeY: layout.fogEdgeY,
    fogEdgeNorm: layout.fogEdgeY === null ? null : r3(layout.fogEdgeY / VB.h),
    nodes,
    uiBoxes: boxes.map(norm),
  };
  union.push(...boxes);
}

// ノード＋旗の和集合を y 帯ごとに要約（画像生成向けの「UIが乗る帯」）
const bands = [
  { name: '空・峰（上）', y0: 0, y1: 102 },
  { name: '高地（遺跡〜塔）', y0: 102, y1: 254 },
  { name: '森', y0: 254, y1: 342 },
  { name: '平野', y0: 342, y1: 470 },
  { name: '海岸・湾', y0: 470, y1: 600 },
];
const bandSummary = bands.map((b) => {
  const inBand = union.filter((u) => !u.name.startsWith('cloud') && u.y1 > b.y0 && u.y0 < b.y1);
  const xs = inBand.length ? { x0: Math.min(...inBand.map((u) => u.x0)), x1: Math.max(...inBand.map((u) => u.x1)) } : null;
  return { band: b.name, y0: r3(b.y0 / VB.h), y1: r3(b.y1 / VB.h), uiCount: inBand.length, xRange: xs ? { x0: r3(Math.max(0, xs.x0) / VB.w), x1: r3(Math.min(VB.w, xs.x1) / VB.w) } : null };
});

// 背骨（道の回廊）: 弧長 0..1 を 40 分割して正規化座標で出す（道が通る帯＝地形の障害物を置かない）
const spineSamples = Array.from({ length: 41 }, (_, i) => {
  const p = spinePointAt(i / 40);
  return { t: r3(i / 40), nx: r3(p.x / VB.w), ny: r3(p.y / VB.h) };
});

console.log(JSON.stringify({
  viewBox: VB,
  SPINE_control_points_norm: SPINE.map(([x, y]) => [r3(x / VB.w), r3(y / VB.h)]),
  spineSamples,
  bandSummary,
  cases: out,
}, null, 1));
