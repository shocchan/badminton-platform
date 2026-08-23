// 地図タイルの置き場所を、staging を開かずに確かめる（2026-08-23）。
//
// 世界地図の背景に、指定したアンカーでタイルを重ねて1枚の画像にする。
// 会話ルートの見え方（viewBox の下半分 y 300..600 を切り出し）も同時に出す。
//
//   node scripts/ai-course/preview-map-tile.mjs out.png \
//     "katari:/path/tile.png:0.62:0.80:0.16" "omoide:/path/tile2.png:0.20:0.86:0.14"
//   引数は id:ファイル:anchorX:anchorY:widthFrac（アンカーは絵の下端中央が来る位置）
import sharp from 'sharp';

const VB_W = 360, VB_H = 600;          // 論理座標（AdvWorldMap の viewBox）
const BG = 'public/ai-course/map/world-bg@2x.webp';
const SCALE = 3;                        // 論理1 = 3px で描く（1080×1800）

const [out, ...specs] = process.argv.slice(2);
if (!out || !specs.length) {
  console.error('usage: preview-map-tile.mjs <out.png> <id:file:ax:ay:widthFrac> ...');
  process.exit(1);
}

const W = VB_W * SCALE, H = VB_H * SCALE;
const base = await sharp(BG).resize(W, H, { fit: 'fill' }).png().toBuffer();

const composites = [];
for (const spec of specs) {
  const [id, file, ax, ay, wf] = spec.split(':');
  const w = Math.round(Number(wf) * W);
  const buf = await sharp(file).resize({ width: w }).png().toBuffer();
  const m = await sharp(buf).metadata();
  // アンカーは「絵の下端中央」がその座標に来る約束（advWorldMapAssets と同じ）
  const left = Math.round(Number(ax) * W - m.width / 2);
  const top = Math.round(Number(ay) * H - m.height);
  composites.push({ input: buf, left: Math.max(0, left), top: Math.max(0, top) });
  console.log(JSON.stringify({ id, drawn: [m.width, m.height], at: [left, top] }));
}

// 会話レーンの環状路（advWorldSpine の RING）を薄く重ねる。
// ノードはこの上に並ぶので、**タイルの足元がここに乗ると押せるボタンと重なる**。
const RING = { x0: 36, x1: 324, y0: 480, y1: 576, r: 36 };
const ringSvg = Buffer.from(
  `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
  `<rect x="${RING.x0 * SCALE}" y="${RING.y0 * SCALE}" width="${(RING.x1 - RING.x0) * SCALE}" ` +
  `height="${(RING.y1 - RING.y0) * SCALE}" rx="${RING.r * SCALE}" ` +
  `fill="none" stroke="#E11D48" stroke-width="6" stroke-dasharray="18 12" opacity="0.85"/></svg>`);
composites.push({ input: ringSvg, left: 0, top: 0 });

await sharp(base).composite(composites).png().toFile(out);

// 会話ルートの見え方（y 300..600 を 6:5 で切り出す）
const cropTop = Math.round((300 / VB_H) * H);
await sharp(out).extract({ left: 0, top: cropTop, width: W, height: H - cropTop })
  .png().toFile(out.replace(/\.png$/, '-conversation.png'));
console.log(`# ${out} と ${out.replace(/\.png$/, '-conversation.png')} を書いた`);
