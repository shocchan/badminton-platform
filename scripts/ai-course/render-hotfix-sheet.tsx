// hotfix対象5枚だけの新版シート（目視確認用）
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { VocabScene } from '../../src/components/ai-course/foundation/vocab/VocabScene';
import { ILLUSTRATION_MANIFEST } from '../../src/lib/aiLesson/course/vocabIllustrationManifest';
const ids = ['fi-chugoku', 'fi-suru', 'fi-kantan', 'fi-nareru', 'fi-joukyou', 'fi-nihon'];
const cells = ids.map((id) => {
  const e = ILLUSTRATION_MANIFEST.find((x) => x.itemId === id)!;
  const svg = renderToStaticMarkup(React.createElement(VocabScene, { spec: e.scene!, lang: 'ja' as const }));
  return `<figure><div class="box">${svg}</div><figcaption><code>${id}</code><br>${e.altJa}</figcaption></figure>`;
}).join('');
writeFileSync('/tmp/hotfix-sheet.html', `<!doctype html><meta charset="utf-8"><style>body{font-family:system-ui;padding:16px;background:#f7f7fb}.g{display:grid;grid-template-columns:repeat(3,280px);gap:12px}figure{margin:0;background:#fff;border-radius:10px;padding:8px}.box{aspect-ratio:4/3;background:#eef0fb;border-radius:8px;overflow:hidden}figcaption{font-size:11px;margin-top:6px}</style><div class="g">${cells}</div>`);
console.log('ok');
