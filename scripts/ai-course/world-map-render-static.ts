// AdvWorldMap を testデータで静的HTMLに描き出す（2026-08-22・セーフエリア検証用・読み取り専用）。
// ログイン不要・DB不要・個人情報ゼロ。dist の built CSS を当てて Playwright で 375/768/1440 を計測する。
// 実行: cd /Users/shocchan/badminton-aicourse && ./node_modules/.bin/vite-node scripts/ai-course/world-map-render-static.ts <outDir>
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AdvWorldMap } from '../../src/components/ai-course/adventure/AdvWorldMap';
import { buildAdventureMap, type MapRouteKind } from '../../src/lib/aiLesson/course/adventure/advMapModel';
import { defaultAdvProfile } from '../../src/lib/aiLesson/course/adventure/advProfile';
import { generateRoute } from '../../src/lib/aiLesson/course/adventure/advRoute';
import type { AdventureV2Profile, AdvGoalType, JlptLevel } from '../../src/lib/aiLesson/course/adventure/advTypes';

const NOW = '2026-08-22T00:00:00.000Z';
const outDir = process.argv[2];
if (!outDir) throw new Error('outDir required');
fs.mkdirSync(outDir, { recursive: true });

const cssFile = fs.readdirSync(path.resolve('dist/assets')).find((f) => f.endsWith('.css'));
if (!cssFile) throw new Error('dist css not found');
const css = fs.readFileSync(path.resolve('dist/assets', cssFile), 'utf8');

const profileFor = (goalType: AdvGoalType, target: JlptLevel | null): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW), enabled: true, goalType, targetJlpt: target, dailyMinutes: 15,
  route: generateRoute({ goalType, targetJlpt: target, knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW }),
});

const cases: { name: string; lang: 'ja' | 'zh'; target: JlptLevel | null; goal: AdvGoalType; kind: MapRouteKind; mastered: number }[] = [
  { name: 'ja-N2-combined', lang: 'ja', target: 'N2', goal: 'hybrid', kind: 'combined', mastered: 3 },
  { name: 'ja-N3-combined', lang: 'ja', target: 'N3', goal: 'hybrid', kind: 'combined', mastered: 2 },
  { name: 'ja-N5-combined', lang: 'ja', target: 'N5', goal: 'hybrid', kind: 'combined', mastered: 1 },
  { name: 'ja-N2-exam', lang: 'ja', target: 'N2', goal: 'exam', kind: 'exam', mastered: 3 },
  { name: 'ja-conversation', lang: 'ja', target: null, goal: 'conversation', kind: 'conversation', mastered: 2 },
  { name: 'zh-N2-combined', lang: 'zh', target: 'N2', goal: 'hybrid', kind: 'combined', mastered: 3 },
  { name: 'zh-N3-combined', lang: 'zh', target: 'N3', goal: 'hybrid', kind: 'combined', mastered: 2 },
];

for (const c of cases) {
  const p = profileFor(c.goal, c.target);
  const ids = p.route!.stages.map((s) => s.stageId);
  const map = buildAdventureMap(p, p.route, new Set(ids.slice(0, c.mastered)), 3, c.kind, NOW);
  const el = createElement(AdvWorldMap, {
    lang: c.lang, regions: map.regions, currentRegionId: map.currentRegionId,
    destinationJa: map.destinationJa, destinationZh: map.destinationZh,
    doneCount: map.doneCount, totalCount: map.totalCount, onSelectRegion: () => {},
    targetJlpt: p.targetJlpt, routeKind: c.kind,
  });
  const markup = renderToStaticMarkup(el);
  const html = `<!doctype html><html lang="${c.lang}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>${c.name}</title>
<style>${css}</style></head>
<body class="bg-gray-50"><div class="mx-auto w-full max-w-xl px-4 py-6">${markup}</div></body></html>`;
  fs.writeFileSync(path.join(outDir, `${c.name}.html`), html);
  console.log(c.name, 'regions', map.regions.length, 'dest', map.destinationJa);
}
