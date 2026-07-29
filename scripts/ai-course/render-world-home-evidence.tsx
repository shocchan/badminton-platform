// learner画面の証拠スクリーンショット用 静的harness（§27）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/render-world-home-evidence.tsx
// staging はログインが要るため、同一UIコンポーネントをビルド済みCSSで描画して証拠を取る。
// learner mode のみ（開発表示なし）で描画する。
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import WorldHomeShell from '../../src/components/ai-course/rpg/WorldHomeShell';
import { N3AreaPanel } from '../../src/components/ai-course/n3unit/N3AreaPanel';
import { WORLD_AREAS, areaById } from '../../src/lib/aiLesson/course/rpg/worldAtlas';

const ROOT = process.cwd();
const cssFile = readdirSync(join(ROOT, 'dist/assets')).find(f => /^index-.*\.css$/.test(f));
if (!cssFile) throw new Error('dist/assets の index CSS が見つかりません。npm run build を先に実行してください');
const css = readFileSync(join(ROOT, 'dist/assets', cssFile), 'utf8');

const noop = () => {};
const facilities = [
  { id: 'lib', worldName: '記憶の書庫', functionName: 'ことばを学ぶ・復習する', descriptionJa: '語彙の学習と定着の確認', badge: 6, onOpen: noop },
  { id: 'workshop', worldName: '文法の工房', functionName: '日本語のしくみを学ぶ', descriptionJa: '文型と使い分けの練習', onOpen: noop },
  { id: 'plaza', worldName: '会話の広場', functionName: 'AI会話で話す', descriptionJa: '翔子先生と話して確かめる', onOpen: noop },
  { id: 'garden', worldName: 'オモイデ庭園', functionName: '復習して思い出す', descriptionJa: '前に学んだことばと再会する', badge: 6, onOpen: noop },
  { id: 'record', worldName: '冒険の記録', functionName: '成長と履歴を見る', descriptionJa: 'できるようになったことの記録', onOpen: noop },
];

const shell = (
  <WorldHomeShell
    areaName="ミナモ列島・はじまりの町"
    locationName="変化の丘（Week 3）"
    clarity="light_fog"
    reviewsDue={6}
    onOpenReview={noop}
    record={{ daysThisWeek: 3, totalSessions: 12 }}
    upcoming={[
      { label: 'はじまりの村（Week 1）', detail: '自己紹介・8/8語が定着', unlocked: true },
      { label: '思い出の道（Week 2）', detail: '過去の経験・7/8語が定着', unlocked: true },
      { label: '変化の丘（Week 3）', detail: '変化・成長・3/8語が定着', unlocked: false },
      { label: '習慣の並木道（Week 4）', detail: '習慣・継続・0/8語が定着', unlocked: false },
      { label: '理由の谷（Week 5）', detail: '理由・説明・0/8語が定着', unlocked: false },
      { label: '比較の展望台（Week 6）', detail: '比較・意見・0/8語が定着', unlocked: false },
    ]}
    todayAction={{
      worldLead: '会話の広場へ行く',
      learningTitle: '以前と今の変化を説明する',
      learningDetail: '目標表現「〜ようになりました」・AI会話1回・今日あと10回',
      ctaLabel: '今日の会話を始める',
      onStart: noop,
    }}
    facilities={facilities}
    areas={WORLD_AREAS}
    currentAreaId="area02-hinode"
    onOpenArea={noop}
  >
    <div className="bg-white border border-gray-100 rounded-2xl p-4">
      <p className="text-sm font-bold text-gray-900 mb-1">今日の学習</p>
      <p className="text-xs text-gray-500">（既存のホーム内容がここに続きます）</p>
    </div>
  </WorldHomeShell>
);

const page = (width: number, label: string) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>
<style>body{margin:0;background:#f6f7f9}.frame{width:${width}px;margin:0 auto;padding:12px}</style></head>
<body><div class="frame" data-label="${label}">${renderToStaticMarkup(shell)}</div></body></html>`;

const OUT = 'docs/ai-course/rpg/generated/';
writeFileSync(join(ROOT, OUT, 'evidence-world-home-desktop.html'), page(1280, 'desktop-1280'));
writeFileSync(join(ROOT, OUT, 'evidence-world-home-mobile.html'), page(390, 'mobile-390'));
writeFileSync(join(ROOT, OUT, 'evidence-world-home-mobile-small.html'), page(320, 'mobile-320'));

// エリア画面（N3AreaPanel）の証拠。SSRなのでstorage未解決＝一覧は「未完了」表示になる
const areaShot = (areaId: string, width: number, name: string) => {
  const area = areaById(areaId)!;
  const html = renderToStaticMarkup(
    <N3AreaPanel area={area} onExit={noop} onOpenArea={noop} onOpenReview={noop}
      onOpenAdventure={area.hasAdventure ? noop : undefined} />
  );
  writeFileSync(join(ROOT, OUT, `evidence-${name}.html`),
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;background:#f6f7f9}.frame{width:${width}px;margin:0 auto}</style></head><body><div class="frame">${html}</div></body></html>`);
};
areaShot('area01-minato', 390, 'area01-mobile');
areaShot('area05-yukari', 720, 'area05-desktop');
areaShot('area07-katachi', 390, 'area07-mobile');
console.log('evidence html written (world home ×3 / area ×3)');
