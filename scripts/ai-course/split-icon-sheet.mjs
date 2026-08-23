// 1枚にまとめて描かれた絵記号を、絵ごとに切り離す（2026-08-23）。
//
// なぜ1枚にまとめるか: 8個を1枚ずつ作ると、生成のたびに描き方がぶれて
// 並べたときに1つだけ浮く（実際に起きた）。1回の生成に入れれば画風が揃う。
//
// 切り離し方はグリッド前提にしない。**透明でないところの塊（連結成分）**を拾うので、
// 並びが多少ずれていても正しく分かれる。
//
//   node scripts/ai-course/split-icon-sheet.mjs <sheet.png> <out-dir> [--min 40] [--alpha 24]
//   → out-dir/part-01.png … 読み順（上の行から、左から右へ）
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const num = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const pos = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [input, outDir] = pos;
if (!input || !outDir) { console.error('usage: split-icon-sheet.mjs <sheet.png> <out-dir>'); process.exit(1); }
const MIN_SIDE = num('--min', 40);    // これより小さい塊はゴミとして捨てる
const ALPHA_TH = num('--alpha', 24);  // これ以上不透明なら「絵」
const PAD = num('--pad', 6);          // 切り出しに残す余白（px）

mkdirSync(outDir, { recursive: true });
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const solid = (i) => data[i * 4 + 3] >= ALPHA_TH;

// 連結成分（4近傍）。1024×1024 なので単純な反復で足りる
const label = new Int32Array(W * H).fill(-1);
const boxes = [];
for (let s = 0; s < W * H; s++) {
  if (label[s] !== -1 || !solid(s)) continue;
  const id = boxes.length;
  let x0 = s % W, x1 = x0, y0 = (s / W) | 0, y1 = y0, count = 0;
  const stack = [s];
  label[s] = id;
  while (stack.length) {
    const k = stack.pop();
    const x = k % W, y = (k / W) | 0;
    count++;
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
    const nb = [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, y > 0 ? k - W : -1, y < H - 1 ? k + W : -1];
    for (const n of nb) if (n >= 0 && label[n] === -1 && solid(n)) { label[n] = id; stack.push(n); }
  }
  boxes.push({ x0, y0, x1, y1, count });
}

// 小さい塊は捨てる（線の切れ端・にじみ）
let parts = boxes.filter((b) => (b.x1 - b.x0) >= MIN_SIDE && (b.y1 - b.y0) >= MIN_SIDE);

// 近すぎる塊は同じ絵の一部とみなして合体する（輪郭が途切れている絵のため）
const overlapOrNear = (a, b, gap) =>
  a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1;
const GAP = num('--gap', 18);
let merged = true;
while (merged) {
  merged = false;
  outer: for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      if (overlapOrNear(parts[i], parts[j], GAP)) {
        parts[i] = {
          x0: Math.min(parts[i].x0, parts[j].x0), y0: Math.min(parts[i].y0, parts[j].y0),
          x1: Math.max(parts[i].x1, parts[j].x1), y1: Math.max(parts[i].y1, parts[j].y1),
          count: parts[i].count + parts[j].count,
        };
        parts.splice(j, 1); merged = true; break outer;
      }
    }
  }
}

// 読み順（行 → 列）。行の判定は「中心のyが近ければ同じ行」
const cy = (b) => (b.y0 + b.y1) / 2;
const rowTol = H * 0.12;
parts.sort((a, b) => (Math.abs(cy(a) - cy(b)) > rowTol ? cy(a) - cy(b) : a.x0 - b.x0));

let n = 0;
for (const b of parts) {
  n++;
  const left = Math.max(0, b.x0 - PAD), top = Math.max(0, b.y0 - PAD);
  const width = Math.min(W - left, b.x1 - b.x0 + 1 + PAD * 2);
  const height = Math.min(H - top, b.y1 - b.y0 + 1 + PAD * 2);
  const out = join(outDir, `part-${String(n).padStart(2, '0')}.png`);
  await sharp(input).extract({ left, top, width, height }).png().toFile(out);
  console.log(JSON.stringify({ part: n, box: [left, top, width, height] }));
}
console.log(`# ${n} 個に分けた（${input}）`);
