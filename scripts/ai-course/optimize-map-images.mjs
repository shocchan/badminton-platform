#!/usr/bin/env node
// 冒険の世界地図・画像素材の最適化（2026-08-22・画像差し替えの土台）。
//
// 入力 PNG（ChatGPT 生成）→ WebP 1x/2x（＋ --avif で AVIF 1x/2x）を public/ai-course/map/ に出す。
// 画像は作らない。あるものを縮小・変換するだけ。
//
// 使い方:
//   node scripts/ai-course/optimize-map-images.mjs <input.png> [--name world-bg] [--out public/ai-course/map]
//        [--width2x 1440] [--quality 82] [--avif] [--ratio 3:5] [--dry-run]
//
//   例: node scripts/ai-course/optimize-map-images.mjs ~/Downloads/world-bg.png --avif
//       → public/ai-course/map/world-bg@2x.webp (1440幅) / world-bg@1x.webp (720幅) / (+ .avif)
//
// 依存: sharp。**無ければ依存は追加せず、その旨を出して終了する（exit 2）**。
// 入れるかどうかは CEO 判断（npm i -D sharp）。
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const VALUE_FLAGS = new Set(['--name', '--out', '--width2x', '--quality', '--ratio']);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && VALUE_FLAGS.has(args[i - 1])));

const input = positional[0];
if (!input || args.includes('--help')) {
  console.log('使い方: node scripts/ai-course/optimize-map-images.mjs <input.png> [--name world-bg] [--out public/ai-course/map] [--width2x 1440] [--quality 82] [--avif] [--ratio 3:5] [--dry-run]');
  process.exit(args.includes('--help') ? 0 : 1);
}
if (!existsSync(input)) {
  console.error(`入力が見つかりません: ${input}`);
  process.exit(1);
}

let sharp;
try {
  sharp = (await import('sharp')).default;
} catch {
  console.error([
    'sharp が見つかりません。依存は追加していません。',
    '  画像最適化を行うには CEO 判断で `npm i -D sharp` を入れてから再実行してください。',
    '  代替: squoosh.app 等で WebP（品質 80 前後）に変換し、world-bg@2x.webp（幅1440）/ world-bg@1x.webp（幅720）として',
    '        public/ai-course/map/ に手動で置いても同じ結果になります。',
  ].join('\n'));
  process.exit(2);
}

const name = String(flag('name', basename(input, extname(input))));
const outDir = resolve(String(flag('out', 'public/ai-course/map')));
const width2x = Number(flag('width2x', 1440));
const quality = Number(flag('quality', 82));
const wantAvif = flag('avif', false) === true;
const dryRun = flag('dry-run', false) === true;
const ratioArg = String(flag('ratio', '3:5'));

const meta = await sharp(input).metadata();
const srcW = meta.width ?? 0;
const srcH = meta.height ?? 0;
console.log(`入力: ${input}  ${srcW}×${srcH}  ${meta.format}  alpha=${meta.hasAlpha ? 'yes' : 'no'}`);

// 縦横比の検品（背景は 3:5 が前提。±2% を超えたら警告。object-fit: cover で中央トリミングされるので致命ではない）
if (ratioArg !== 'any') {
  const [rw, rh] = ratioArg.split(':').map(Number);
  if (rw > 0 && rh > 0 && srcW > 0 && srcH > 0) {
    const want = rw / rh;
    const got = srcW / srcH;
    const diff = Math.abs(got - want) / want;
    if (diff > 0.02) {
      console.warn(`⚠ 縦横比が ${ratioArg} から ${(diff * 100).toFixed(1)}% ずれています（${got.toFixed(4)} vs ${want.toFixed(4)}）。表示は cover で中央トリミングされ、ノード座標は画像に対して相対的にずれます。`);
    }
  }
}
if (srcW < width2x) {
  console.warn(`⚠ 入力幅 ${srcW}px が 2x 目標 ${width2x}px より小さい。拡大はせず、元サイズのまま 2x として出します。`);
}

const targets = [
  { suffix: '@2x', width: Math.min(width2x, srcW || width2x) },
  { suffix: '@1x', width: Math.round(Math.min(width2x, srcW || width2x) / 2) },
];
const formats = [{ ext: 'webp', apply: (s) => s.webp({ quality, effort: 5 }) }];
if (wantAvif) formats.push({ ext: 'avif', apply: (s) => s.avif({ quality: Math.max(40, quality - 22), effort: 6 }) });

if (!dryRun) mkdirSync(outDir, { recursive: true });
const results = [];
for (const t of targets) {
  for (const f of formats) {
    const file = join(outDir, `${name}${t.suffix}.${f.ext}`);
    if (dryRun) { console.log(`(dry-run) ${file}  幅${t.width}`); continue; }
    const pipeline = sharp(input).resize({ width: t.width, withoutEnlargement: true });
    await f.apply(pipeline).toFile(file);
    const out = await sharp(file).metadata();
    const kb = (statSync(file).size / 1024).toFixed(1);
    results.push({ file, w: out.width, h: out.height, kb });
    console.log(`出力: ${file}  ${out.width}×${out.height}  ${kb} KB`);
  }
}

if (!dryRun && results.length) {
  const big = results.filter((r) => Number(r.kb) > 400);
  if (big.length) console.warn(`⚠ 400KB 超: ${big.map((r) => basename(r.file)).join(', ')}。--quality を下げるか width2x を見直してください`);
  const one = results.find((r) => r.file.endsWith('@1x.webp'));
  if (one) {
    console.log('\n次の手順: src/lib/aiLesson/course/adventure/advWorldMapAssets.ts の WORLD_MAP_BG を確認');
    console.log(`  width: ${one.w}, height: ${one.h}${wantAvif ? '  （avif1x/avif2x のコメントを外す）' : ''}`);
    console.log('  確認: staging の /ja/ai-course?map=image で表示。戻す: ?map=svg（手順は docs/ai-course/design/INTEGRATION.md）');
  }
}
