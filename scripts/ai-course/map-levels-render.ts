// 目標レベル別の冒険マップ（画像版）を静的に描き出す確認用。ログイン不要・DB不要・個人情報ゼロ。
import fs from 'node:fs';
import path from 'node:path';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdvWorldMap } from '../../src/components/ai-course/adventure/AdvWorldMap';
import { buildAdventureMap } from '../../src/lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../src/lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../src/lib/aiLesson/course/adventure/advRoute';
import {
  WORLD_MAP_BG, WORLD_MAP_TILES, WORLD_MAP_MARKERS, WORLD_MAP_PEDESTALS, PEDESTAL_WIDTH_VB,
} from '../../src/lib/aiLesson/course/adventure/advWorldMapAssets';
import type { AdventureV2Profile, JlptLevel } from '../../src/lib/aiLesson/course/adventure/advTypes';

const NOW = '2026-08-22T00:00:00.000Z';
const outDir = process.argv[2];
if (!outDir) throw new Error('outDir required');
fs.mkdirSync(outDir, { recursive: true });
const cssFile = fs.readdirSync(path.resolve('dist/assets')).find((f) => f.endsWith('.css'))!;
const css = fs.readFileSync(path.resolve('dist/assets', cssFile), 'utf8');
const VB_W = 360; const VB_H = 600;

const profileFor = (target: JlptLevel): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW), enabled: true, goalType: 'hybrid', targetJlpt: target, dailyMinutes: 15,
  route: generateRoute({ goalType: 'hybrid', targetJlpt: target, knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW }),
});

for (const target of ['N5', 'N4', 'N3', 'N2'] as const) {
  const p = profileFor(target);
  const ids = p.route!.stages.map((s) => s.stageId);
  const map = buildAdventureMap(p, p.route, new Set(ids.slice(0, 1)), 3, 'combined', NOW);
  const posOf = new Map<string, { x: number; y: number }>();
  const backdrop = h('picture', { className: 'pointer-events-none absolute inset-0 block' },
    h('img', { src: WORLD_MAP_BG.webp1x, width: WORLD_MAP_BG.width, height: WORLD_MAP_BG.height,
      alt: '', className: 'h-full w-full object-cover' }));
  const tiles = ({ current, nodes }: any) => h('g', null,
    ...WORLD_MAP_TILES.map((t) => {
      const w = t.widthFrac * VB_W; const hh = w * (t.height / t.width);
      return h('image', { key: t.id, href: t.webp1x, x: t.anchor[0] * VB_W - w / 2, y: t.anchor[1] * VB_H - hh, width: w, height: hh });
    }),
    ...nodes.map((n: any) => {
      const a = (WORLD_MAP_PEDESTALS as any)[n.state]; if (!a) return null;
      const w = PEDESTAL_WIDTH_VB; const hh = w * (a.height / a.width);
      return h('image', { key: `p-${n.id}`, href: a.webp1x, x: n.x - w / 2, y: n.y - hh + 3, width: w, height: hh });
    }),
    current ? (() => { const a = WORLD_MAP_MARKERS.flag; const hh = a.heightVb; const w = hh * (a.width / a.height);
      return h('image', { key: 'marker', href: a.webp1x, x: current.x - w / 2, y: current.y - hh, width: w, height: hh }); })() : null,
  );
  const el = h(AdvWorldMap, {
    lang: 'ja', regions: map.regions, currentRegionId: map.currentRegionId,
    destinationJa: map.destinationJa, destinationZh: map.destinationZh,
    doneCount: map.doneCount, totalCount: map.totalCount, onSelectRegion: () => {},
    targetJlpt: p.targetJlpt, routeKind: 'combined',
    backdrop, tiles, hideNodeArt: true, hideScenery: true, variant: 'image', imageState: 'loaded',
  } as any);
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${target}</title>
<style>${css}</style></head><body class="bg-gray-50"><div class="mx-auto w-full max-w-xl px-4 py-6">
<p class="mb-1 text-sm font-bold text-gray-700">目標 ${target}｜${map.destinationJa}（試験の地域 ${map.regions.filter((r) => r.layer === 'exam').length}）</p>
${renderToStaticMarkup(el)}</div></body></html>`;
  fs.writeFileSync(path.join(outDir, `map-${target}.html`), html);
  console.log(target, 'exam regions', map.regions.filter((r) => r.layer === 'exam').length, '/ dest', map.destinationJa);
  void posOf;
}
