// UX監査用の単一HTML contact sheet（140語・メタデータつき・read-only）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-ux-contact-sheet.tsx
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { VocabScene } from '../../src/components/ai-course/foundation/vocab/VocabScene';
import { ILLUSTRATION_MANIFEST } from '../../src/lib/aiLesson/course/vocabIllustrationManifest';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';
import { N3_ITEMS } from '../../src/lib/aiLesson/course/foundationVocabN3';

const items = new Map(allVocabularyItems().map(i => [i.id, i]));
const n3 = new Set(N3_ITEMS.map(i => i.id));
const hashes = new Map<string, string[]>();

const cells = ILLUSTRATION_MANIFEST.map((e) => {
  const item = items.get(e.itemId)!;
  const svg = e.scene ? renderToStaticMarkup(React.createElement(VocabScene, { spec: e.scene, lang: 'ja' as const })) : '';
  const h = createHash('sha1').update(svg).digest('hex').slice(0, 10);
  (hashes.get(h) ?? hashes.set(h, []).get(h)!).push(e.itemId);
  const meaning = (item as { meaningZh?: string }).meaningZh ?? '';
  return `<figure data-id="${e.itemId}" data-hash="${h}">
  <div class="box">${svg}</div>
  <figcaption><b>${item.displayForm}</b> <span class="zh">${meaning}</span><br>
  <code>${e.itemId}</code> · ${n3.has(e.itemId) ? 'N3' : '基礎'} · ${item.partOfSpeech}<br>
  <span class="meta">${e.assetType} / ${e.semanticState}${e.humanApproved ? ' / human✓' : ''}</span><br>
  <span class="alt">ja: ${e.altJa}</span><br><span class="alt">zh: ${e.altZh}</span></figcaption></figure>`;
}).join('\n');

const dups = [...hashes.entries()].filter(([, v]) => v.length > 1);
writeFileSync('docs/ai-course/ux-audit/illustration-contact-sheet.html', `<!doctype html><meta charset="utf-8">
<title>UX監査 イラストcontact sheet（140語）</title>
<style>body{font-family:system-ui;background:#f7f7fb;margin:0;padding:16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
figure{margin:0;background:#fff;border-radius:10px;padding:8px;box-shadow:0 1px 4px #0001}
.box{aspect-ratio:4/3;border-radius:8px;overflow:hidden;background:#eef0fb}
figcaption{font-size:11px;line-height:1.45;margin-top:6px}
.zh{color:#c2554a}.meta{color:#888;font-size:10px}.alt{color:#aaa;font-size:9px}
code{font-size:9px;color:#666}.dup{background:#fff3cd;padding:8px;border-radius:8px;margin-bottom:12px;font-size:12px}</style>
<h1 style="font-size:16px">語彙イラスト contact sheet — ${ILLUSTRATION_MANIFEST.length}語（UX監査 2026-07-31）</h1>
${dups.length ? `<div class="dup">⚠ 同一hash: ${dups.map(([, ids]) => ids.join('=')).join(' / ')}</div>` : '<p style="font-size:12px;color:#2f8f4e">duplicate hash: 0</p>'}
<div class="grid">${cells}</div>`);
console.log(`wrote contact sheet: 140 cells, duplicate hashes: ${dups.length}`);
