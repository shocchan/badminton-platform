// N3 Unit learner画面の証拠harness（§10）。learner modeのみ・開発表示なし。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-n3unit-evidence.tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import N3UnitPanel from '../../src/components/ai-course/n3unit/N3UnitPanel';
import { N3_UNIT_SPECS } from '../../src/lib/aiLesson/course/quality/n3UnitSpecs';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';
import { buildUnitQuestions, emptyRunState, advancePhaseIfDone, answerQuestion, questionsForPhase, clearMission, type UnitRunState } from '../../src/lib/aiLesson/course/n3unit/unitRuntime';

const ROOT = process.cwd();
const cssFile = readdirSync(join(ROOT, 'dist/assets')).find(f => /^index-.*\.css$/.test(f));
if (!cssFile) throw new Error('npm run build を先に実行してください');
const css = readFileSync(join(ROOT, 'dist/assets', cssFile), 'utf8');

const pool = allVocabularyItems();
const spec = N3_UNIT_SPECS[0];
const set = buildUnitQuestions(spec, pool);
const NOW = 1_800_000_000_000;

/** 指定フェーズまで進めた状態を作る */
const stateAt = (phase: UnitRunState['phase']): UnitRunState => {
  let s = advancePhaseIfDone(emptyRunState(spec.unitId, NOW), set, spec, NOW);
  let guard = 0;
  while (s.phase !== phase && s.phase !== 'result' && guard++ < 2000) {
    const q = questionsForPhase(set, s)[0];
    if (!q) { s = advancePhaseIfDone(s, set, spec, NOW); continue; }
    s = answerQuestion(s, q, true, NOW);
    s = advancePhaseIfDone(s, set, spec, NOW);
  }
  if (phase === 'result' && s.phase === 'mission') s = clearMission(s, NOW);
  return s;
};

const storageFor = (s: UnitRunState) => ({
  load: async () => s,
  save: async () => ({ ok: true as const }),
});

const page = (width: number, inner: string) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#f6f7f9}.frame{max-width:${width}px;margin:0 auto;padding:12px}</style></head>
<body><div class="frame">${inner}</div></body></html>`;

const OUT = 'docs/ai-course/rpg/generated/';
const shots: [string, UnitRunState['phase'], number][] = [
  ['n3-intro', 'intro', 720], ['n3-diagnostic', 'diagnostic', 720],
  ['n3-stage1', 'stage1', 720], ['n3-stage2', 'stage2', 720],
  ['n3-stage3', 'stage3', 720], ['n3-mission', 'mission', 720], ['n3-result', 'result', 720],
];
for (const [name, phase, w] of shots) {
  const st = stateAt(phase);
  const html = renderToStaticMarkup(
    <N3UnitPanel spec={spec} pool={pool} storage={storageFor(st)} areaName="ミナモ列島・はじまりの町"
      nextUnitTitleJa={N3_UNIT_SPECS[1].titleJa} onExit={() => {}} nowMs={NOW} initialRunState={st} />
  );
  writeFileSync(join(ROOT, OUT, `evidence-${name}.html`), page(w, html));
}
// mobile
const stM = stateAt('stage2');
writeFileSync(join(ROOT, OUT, 'evidence-n3-stage2-mobile.html'), page(390, renderToStaticMarkup(
  <N3UnitPanel spec={spec} pool={pool} storage={storageFor(stM)} areaName="ミナモ列島・はじまりの町"
    nextUnitTitleJa={null} onExit={() => {}} nowMs={NOW} initialRunState={stM} />)));
console.log('n3 evidence written:', shots.length + 1, 'files');
