// ホーム画面の画像を WebP 1x/2x にする（2026-08-22・第2フェーズ）。
//
//   node scripts/ai-course/optimize-home-images.mjs <in.png> <outBase> [--w2x 1152] [--q 78]
//     → <outBase>@2x.webp（幅 w2x）・<outBase>@1x.webp（その半分）
//
// 拡大はしない（元より大きくしない）。比率も変えない。
// 3:1 から外れていたら警告だけ出して**切らない**（切ると構図の約束＝左45%・下30%が崩れるため）。
import sharp from 'sharp';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [input, outBase] = positional;
if (!input || !outBase) {
  console.error('usage: optimize-home-images.mjs <in.png> <outBase> [--w2x 1152] [--q 78]');
  process.exit(1);
}
const W2X = opt('--w2x', 1152);
const Q = opt('--q', 78);

const meta = await sharp(input).metadata();
const ratio = (meta.width ?? 1) / (meta.height ?? 1);
if (Math.abs(ratio - 3) > 0.05) console.warn(`⚠ 3:1 ではありません（${ratio.toFixed(2)}:1）。切らずにそのまま縮小します`);

const w2 = Math.min(W2X, meta.width ?? W2X);
const h2 = Math.round(w2 / ratio);
await sharp(input).resize(w2, h2).webp({ quality: Q }).toFile(`${outBase}@2x.webp`);
await sharp(input).resize(Math.round(w2 / 2), Math.round(h2 / 2)).webp({ quality: Q }).toFile(`${outBase}@1x.webp`);

const size = async (p) => {
  const m = await sharp(p).metadata();
  const { size: bytes } = await sharp(p).toBuffer({ resolveWithObject: true }).then((r) => r.info);
  return `${m.width}×${m.height} ${Math.round(bytes / 1024)}KB`;
};
console.log(JSON.stringify({
  input: basename(input), source: [meta.width, meta.height],
  out2x: await size(`${outBase}@2x.webp`), out1x: await size(`${outBase}@1x.webp`),
}));
