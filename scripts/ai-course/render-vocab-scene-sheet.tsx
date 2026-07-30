// 語彙イラスト140枚の一覧を静的HTMLへ書き出す（目視確認用・Phase B-4）。
// 学習者向けの成果物ではなく、意味の取り違えを人が見つけるための検査シート。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-vocab-scene-sheet.tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { VocabScene } from '../../src/components/ai-course/foundation/vocab/VocabScene';
import { ALL_SCENES } from '../../src/lib/aiLesson/course/vocabIllustrationManifest';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';

const label = new Map(allVocabularyItems().map((i) => [i.id, (i as any).displayForm ?? i.id]));
const PAGE = Number(process.env.SHEET_PAGE ?? '0');
const PER = 24;
const SLICE = PAGE ? ALL_SCENES.slice((PAGE - 1) * PER, PAGE * PER) : ALL_SCENES;
const cells = SLICE.map((spec) => {
  const svg = renderToStaticMarkup(React.createElement(VocabScene, { spec, lang: 'ja' as const }));
  return `<figure><div class="box">${svg}</div><figcaption>${label.get(spec.itemId) ?? ''}<br><code>${spec.itemId}</code><br><span>${spec.altJa}</span></figcaption></figure>`;
}).join('\n');

writeFileSync(PAGE ? `dist-scene-sheet-${PAGE}.html` : 'dist-scene-sheet.html', `<!doctype html><meta charset="utf-8">
<title>語彙イラスト検査シート</title>
<style>
 body{font-family:system-ui,sans-serif;background:#f7f7fb;margin:0;padding:20px}
 h1{font-size:16px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
 figure{margin:0;background:#fff;border-radius:10px;padding:8px;box-shadow:0 1px 4px #0001}
 .box{aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:#eef0fb}
 figcaption{font-size:11px;margin-top:6px;line-height:1.4}
 code{color:#666;font-size:10px}
 figcaption span{color:#888;font-size:10px;display:block;margin-top:2px}
</style>
<h1>語彙イラスト検査シート — page ${PAGE || 'all'} / ${SLICE.length}枚</h1>
<div class="grid">${cells}</div>`);
console.log(`wrote page ${PAGE} (${SLICE.length} scenes)`);
