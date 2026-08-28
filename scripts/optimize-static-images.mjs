/**
 * public/ 配下の静的画像から表示サイズに合わせたWebP変種を事前生成する。
 * Cloudflare/Supabase の有料画像変換を使わないための「ビルド前生成」方式（再実行可能）。
 *
 * 実行: node scripts/optimize-static-images.mjs
 * 新しい画像を追加したら TARGETS に1行足して再実行する。
 * 注意: 生成物のファイル名は src 側（staticImageSets.ts 等）の参照と一致させること。
 */
import { readFileSync, writeFileSync, statSync } from 'fs';
import path from 'path';
import sharp from 'sharp';

const PUBLIC = new URL('../public/', import.meta.url).pathname;

// { src, widths, suffix?: (w) => name } — 幅は「表示CSS幅×2(Retina)」を上限に選ぶ
const TARGETS = [
  // ヒーロー（トップページLCP）。元は hero.jpg 1376×768
  { src: 'hero.jpg', widths: [768, 1280, 1376], name: w => `hero-${w}.webp` },
  // 会場写真（通常活動一覧 h-32 / 会場ガイド h-48〜64）
  { src: 'venues/shibaen-kouminkan.jpg', widths: [480, 768, 900], name: w => `venues/shibaen-kouminkan-${w}.webp` },
  { src: 'venues/warabi-taiikukan.jpg', widths: [480, 640], name: w => `venues/warabi-taiikukan-${w}.webp` },
  // シャトル募金カウンター（表示 28〜56px）
  { src: 'icons/shuttle-icon.png', widths: [112], name: () => 'icons/shuttle-icon-112.webp' },
  // 景品ロードマップのアイコン（表示 28px）
  ...['shiori', 'strap', 'coaster', 'resin_medal', 'penholder', 'artracket'].map(n => ({
    src: `icons/${n}.png`, widths: [64], name: () => `icons/${n}-64.webp`,
  })),
  // 大会結果の表画像（max-w-4xl ≒ 864px 表示）
  { src: 'images/vol2/results-table.png', widths: [896, 1792], name: w => `images/vol2/results-table-${w}.webp` },
  { src: 'images/vol3/results-table.png', widths: [896, 1698], name: w => `images/vol3/results-table-${w}.webp` },
];

// JPEGフォールバックの再圧縮（寸法は維持、URLも維持）
const RECOMPRESS_JPEG = ['hero.jpg'];

const kb = n => `${Math.round(n / 1024)}KB`;

for (const t of TARGETS) {
  const srcPath = path.join(PUBLIC, t.src);
  const input = readFileSync(srcPath);
  const meta = await sharp(input).metadata();
  for (const w of t.widths) {
    const outName = t.name(w);
    const outPath = path.join(PUBLIC, outName);
    const buf = await sharp(input)
      .resize({ width: Math.min(w, meta.width), withoutEnlargement: true })
      .webp({ quality: 80, effort: 5 })
      .toBuffer();
    writeFileSync(outPath, buf);
    console.log(`${t.src} → ${outName}  ${kb(buf.length)}`);
  }
}

for (const f of RECOMPRESS_JPEG) {
  const p = path.join(PUBLIC, f);
  const before = statSync(p).size;
  const buf = await sharp(readFileSync(p)).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
  // 再実行時に劣化を重ねないよう、十分小さくなる場合のみ書き換える
  if (buf.length < before * 0.8) {
    writeFileSync(p, buf);
    console.log(`recompress ${f}  ${kb(before)} → ${kb(buf.length)}`);
  } else {
    console.log(`skip ${f} (already compact: ${kb(before)})`);
  }
}
console.log('done');
