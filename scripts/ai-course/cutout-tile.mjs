// ランドマークタイルの切り抜き（2026-08-22）。ChatGPT が白地で出した PNG を
// 「外周から続く白」だけ透明にし（建物の白壁は残す）、余白をトリムして WebP 1x/2x にする。
//   node scripts/ai-course/cutout-tile.mjs <in.png> <outBase> [--max 1024] [--th 238]
//   → <outBase>@2x.webp（幅 ≤ max）・<outBase>@1x.webp（半分）。寸法を JSON で標準出力に出す
import sharp from 'sharp';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const [input, outBase] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!input || !outBase) { console.error('usage: cutout-tile.mjs <in.png> <outBase> [--max 1024] [--th 238]'); process.exit(1); }
const MAX = opt('--max', 1024);
const TH = opt('--th', 238);   // これ以上明るい（min(r,g,b) ≥ TH）画素を「白地」とみなす
const SOFT = 8;                // 白地→絵の境目を少しだけ柔らかくする幅（明度差で alpha を補間）

const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const isBg = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) >= TH;
const bg = new Uint8Array(W * H);
const q = [];
const push = (x, y) => { const k = y * W + x; if (bg[k] || !isBg(k)) return; bg[k] = 1; q.push(k); };
for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
while (q.length) {
  const k = q.pop(); const x = k % W, y = (k - x) / W;
  if (x > 0) push(x - 1, y); if (x < W - 1) push(x + 1, y); if (y > 0) push(x, y - 1); if (y < H - 1) push(x, y + 1);
}
// 外周白の画素を透明に。境目（白に近い非背景画素）は明度で alpha を落として縁の白残りを減らす
let minX = W, minY = H, maxX = -1, maxY = -1;
for (let k = 0; k < W * H; k++) {
  if (bg[k]) { data[k * 4 + 3] = 0; continue; }
  const m = Math.min(data[k * 4], data[k * 4 + 1], data[k * 4 + 2]);
  // 背景に隣接する明るい画素だけ半透明化（内部の白壁は隣接しないので残る）
  const x = k % W, y = (k - x) / W;
  const nearBg = (x > 0 && bg[k - 1]) || (x < W - 1 && bg[k + 1]) || (y > 0 && bg[k - W]) || (y < H - 1 && bg[k + W]);
  if (nearBg && m >= TH - SOFT * 4) data[k * 4 + 3] = Math.round(255 * Math.min(1, (TH - m) / (SOFT * 4) + 0.35));
  if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const pad = 4;
const left = Math.max(0, minX - pad), top = Math.max(0, minY - pad);
const cw = Math.min(W, maxX + pad + 1) - left, ch = Math.min(H, maxY + pad + 1) - top;
const cut = sharp(data, { raw: { width: W, height: H, channels: 4 } }).extract({ left, top, width: cw, height: ch });
const w2 = Math.min(MAX, cw); const h2 = Math.round(ch * w2 / cw);
await cut.clone().resize(w2, h2).webp({ quality: 88, alphaQuality: 90 }).toFile(`${outBase}@2x.webp`);
await cut.clone().resize(Math.round(w2 / 2), Math.round(h2 / 2)).webp({ quality: 86, alphaQuality: 90 }).toFile(`${outBase}@1x.webp`);
const sz = async (p) => (await sharp(p).metadata());
const m2 = await sz(`${outBase}@2x.webp`), m1 = await sz(`${outBase}@1x.webp`);
console.log(JSON.stringify({ input: basename(input), source: [W, H], crop: [cw, ch], out2x: [m2.width, m2.height], out1x: [m1.width, m1.height], bgPixels: bg.reduce((a, b) => a + b, 0) }));
