// step の絵記号を納品サイズにする（2026-08-23）。
//
// ChatGPT は透過PNGで出してくるが、周囲に大きな余白が残る。24〜36pxの丸の中に
// 入れるので、余白を詰めないと絵が豆粒になる。**透明部分でトリム**してから
// 正方形に整え、96px(@2x)/48px(@1x) の WebP にする。
//
//   node scripts/ai-course/optimize-step-icons.mjs <in-dir> <out-dir>
//   入力: icon-<id>.png  →  出力: step-<id>@2x.webp / step-<id>@1x.webp
import sharp from 'sharp';
import { readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) { console.error('usage: optimize-step-icons.mjs <in-dir> <out-dir>'); process.exit(1); }
mkdirSync(outDir, { recursive: true });

const SIZE = 96;         // @2x（表示24px の 4倍。将来36pxにしても耐える）
const PAD_FRAC = 0.06;   // 丸の縁に触れないだけの余白

const files = readdirSync(inDir).filter((f) => /^icon-.+\.png$/i.test(f)).sort();
if (!files.length) { console.error(`no icon-*.png in ${inDir}`); process.exit(1); }

for (const f of files) {
  const id = basename(f).replace(/^icon-/, '').replace(/\.png$/i, '');
  const src = join(inDir, f);

  // 透明部分でトリム（alpha のある画像はこれで絵の実寸になる）
  const trimmed = await sharp(src).trim({ threshold: 1 }).toBuffer();
  const meta = await sharp(trimmed).metadata();
  const side = Math.max(meta.width, meta.height);
  const inner = Math.round(SIZE * (1 - PAD_FRAC * 2));

  // 正方形の透明キャンバスに中央寄せ（縦長・横長どちらでも丸の中で偏らない）
  const fitted = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const out2x = join(outDir, `step-${id}@2x.webp`);
  const out1x = join(outDir, `step-${id}@1x.webp`);
  await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fitted, gravity: 'center' }])
    .webp({ quality: 92, alphaQuality: 100 }).toFile(out2x);
  await sharp(out2x).resize(SIZE / 2, SIZE / 2).webp({ quality: 92, alphaQuality: 100 }).toFile(out1x);

  console.log(JSON.stringify({ id, source: [meta.width, meta.height], square: side, out: [SIZE, SIZE] }));
}
