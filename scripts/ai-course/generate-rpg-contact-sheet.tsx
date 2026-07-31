// RPG Asset Contact Sheet＋manifest生成（§6-§7）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/generate-rpg-contact-sheet.tsx
// 全asset・状態・Fog Before/After・mobile/desktop cropを一画面で比較できるHTMLと、
// provenance manifest（sha256付き）を docs/ai-course/rpg/generated/ へ出力する。
// reviewStatusはすべて human_review_candidate（approvedへ自動昇格しない）。
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  HeroSprite, ShokoSprite, NpcHanaSprite, NpcGenSprite, LanternMarker, NpcSilhouette,
  TownMapBase, LocationFogOverlay, type SpritePose,
} from '../../src/components/ai-course/rpg/pixelAssets';

const OUT = 'docs/ai-course/rpg/generated/';
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);

const POSES: SpritePose[] = ['idle', 'walk', 'talk', 'happy'];
const CHARS = [
  { assetId: 'rpg-hero', subject: '主人公（旅の学習者）', El: HeroSprite },
  { assetId: 'rpg-shoko', subject: '翔子先生（言葉の案内人・黒ボブ＋四角メガネ＋ブルーグレー）', El: ShokoSprite },
  { assetId: 'rpg-hana', subject: 'パン屋のハナさん', El: NpcHanaSprite },
  { assetId: 'rpg-gen', subject: '駅員のゲンさん', El: NpcGenSprite },
] as const;

const cell = (label: string, inner: string, w = 96, h = 132) =>
  `<figure style="margin:0;text-align:center"><div style="width:${w}px;height:${h}px;margin:0 auto;background:#efe9dc;border-radius:8px;padding:4px">${inner}</div><figcaption style="font-size:11px;color:#555">${label}</figcaption></figure>`;

const FOG_STATES = ['clear', 'light_fog', 'foggy', 'review_needed'] as const;
const REGION = { x: 12, y: 15, w: 15, h: 16 };

const mapSvg = (opts: { discovered: string[]; fogged: boolean; viewW?: number }) => renderToStaticMarkup(
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 36" width={opts.viewW ?? 480} height={(opts.viewW ?? 480) * 0.75}>
    <TownMapBase discoveredLocationIds={opts.discovered} />
    {opts.fogged && (<>
      <LocationFogOverlay region={{ x: 12, y: 15, w: 15, h: 16 }} level="foggy" />
      <LocationFogOverlay region={{ x: 24, y: 8, w: 12, h: 12 }} level="foggy" />
      <LocationFogOverlay region={{ x: 35, y: 0, w: 13, h: 13 }} level="foggy" />
    </>)}
  </svg>
);

const manifest = {
  generatedAt: new Date().toISOString(),
  provenance: 'すべて src/components/ai-course/rpg/pixelAssets.tsx 内の文字マップから生成した完全オリジナルprocedural SVG。既存IP素材の抽出・模倣・流用なし',
  reviewStatus: 'human_review_candidate（approvedへは人間のみ）',
  assets: [] as object[],
};

let charRows = '';
for (const c of CHARS) {
  const cells = POSES.map(p => {
    const svg = renderToStaticMarkup(<c.El pose={p} />);
    manifest.assets.push({
      assetId: `${c.assetId}-${p}`, subject: c.subject, state: p,
      file: 'pixelAssets.tsx（procedural）', dimensions: '10x13〜10x14 grid', pixelScale: 'vector（imageRendering: pixelated）',
      source: 'original_character_map', sha256_16: sha(svg), bytes: svg.length,
      displayed: true, mobileChecked: 'automated_only', reviewStatus: 'human_review_candidate',
    });
    return cell(p, svg);
  }).join('');
  charRows += `<section style="margin-bottom:12px"><h3 style="margin:4px 0;font-size:14px">${c.subject}</h3><div style="display:flex;gap:10px">${cells}</div></section>`;
}

const extraCells = [
  cell('ことばの灯', renderToStaticMarkup(<LanternMarker />), 96, 96),
  cell('霧の人影', renderToStaticMarkup(<NpcSilhouette />), 96, 96),
].join('');

const fogCells = FOG_STATES.map(level => {
  const svg = renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="10 13 19 20" width={150} height={158}>
      <TownMapBase discoveredLocationIds={['c1-town-gate', 'c1-main-street']} />
      <LocationFogOverlay region={REGION} level={level} />
    </svg>
  );
  manifest.assets.push({ assetId: `rpg-fog-${level}`, subject: `Fog状態（${level}）`, state: level,
    file: 'pixelAssets.tsx（LocationFogOverlay）', source: 'original_procedural', sha256_16: sha(svg),
    bytes: svg.length, displayed: true, mobileChecked: 'automated_only', reviewStatus: 'human_review_candidate' });
  return cell(level, svg, 158, 175);
}).join('');

const before = mapSvg({ discovered: ['c1-town-gate'], fogged: true });
const after = mapSvg({ discovered: ['c1-town-gate', 'c1-main-street', 'c1-plaza', 'c1-station-front'], fogged: false });
const mobileCrop = mapSvg({ discovered: ['c1-town-gate'], fogged: true, viewW: 180 });
manifest.assets.push(
  { assetId: 'rpg-town-map-before', subject: '町マップ（Fog Before・序盤）', state: 'before', file: 'pixelAssets.tsx（TownMapBase）', source: 'original_procedural', sha256_16: sha(before), bytes: before.length, displayed: true, mobileChecked: 'automated_only', reviewStatus: 'human_review_candidate' },
  { assetId: 'rpg-town-map-after', subject: '町マップ（Fog After・全解放）', state: 'after', file: 'pixelAssets.tsx（TownMapBase）', source: 'original_procedural', sha256_16: sha(after), bytes: after.length, displayed: true, mobileChecked: 'automated_only', reviewStatus: 'human_review_candidate' },
);

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>RPG Chapter 1 Asset Contact Sheet</title></head>
<body style="font-family:sans-serif;margin:16px;background:#faf7f0;color:#333">
<h1 style="font-size:18px">RPG Chapter 1 Asset Contact Sheet（human_review_candidate）</h1>
<p style="font-size:12px;color:#666">生成: ${manifest.generatedAt}／全て文字マップ由来のオリジナルprocedural SVG・既存IP流用0。
承認は人間のみ（このsheetは状態を変更しない）。</p>
<h2 style="font-size:15px">キャラクター（idle / walk / talk / happy）</h2>
${charRows}
<h2 style="font-size:15px">マーカー・記号</h2>
<div style="display:flex;gap:10px">${extraCells}</div>
<h2 style="font-size:15px">Fog状態（ことば通り区画・4段階）</h2>
<div style="display:flex;gap:10px;flex-wrap:wrap">${fogCells}</div>
<h2 style="font-size:15px">マップ Before／After・mobile crop</h2>
<div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-start">
${cell('Before（序盤・霧）', before, 492, 372)}
${cell('After（全解放）', after, 492, 372)}
${cell('mobile 320px相当', mobileCrop, 192, 148)}
</div>
<p style="font-size:11px;color:#888">revise理由の候補: 個性不足／判別困難／既存IP類似の疑い／モバイル視認性。
判断は grammar/asset Decision Queue へ。</p>
</body></html>`;

writeFileSync(OUT + 'asset-contact-sheet.html', html);
writeFileSync(OUT + 'pixel-asset-manifest.json', JSON.stringify(manifest, null, 1) + '\n');
console.log('contact sheet written. assets:', manifest.assets.length,
  'duplicate hashes:', manifest.assets.length - new Set(manifest.assets.map((a) => (a as { sha256_16: string }).sha256_16)).size);
