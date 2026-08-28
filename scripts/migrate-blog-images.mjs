/**
 * blog-images バケットの既存画像に WebP 変種（480/960/1600w）を一括生成する。
 * 命名規約は src/lib/blogImages.ts と同一: `{base}_w{width}.webp`
 * 原本は削除も変更もしない。DBも書き換えない（表示側がURL規約で変種を導出する）。
 * 再実行可能（upsert）。
 *
 * 実行:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=... \
 *     node scripts/migrate-blog-images.mjs
 *
 * 注意: service_role キーが必要（原本のダウンロードは公開URLでも可だが、
 * アップロードにRLSを越える権限が要る）。キーはファイルに保存しないこと。
 */
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { execFileSync } from 'child_process';
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_KEY を環境変数で指定してください');
  process.exit(1);
}

const WIDTHS = [480, 960, 1600];
const SOURCE_EXT_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
const VARIANT_RE = /_w(?:480|960|1600)\.webp$/;
const BUCKET = 'blog-images';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const storage = supabase.storage.from(BUCKET);

async function listPrefix(prefix) {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await storage.list(prefix, {
      limit: 100,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw new Error(`list(${prefix}) failed: ${error.message}`);
    // フォルダ行は id が null（ファイルのみ拾う）
    out.push(
      ...data
        .filter(r => r.id)
        .map(r => (prefix ? `${prefix}/${r.name}` : r.name)),
    );
    if (data.length < 100) break;
  }
  return out;
}

/** HEIC/HEIF は sharp が読めないため macOS の sips でJPEGへ変換してから処理する */
function heicToJpeg(buf) {
  const dir = mkdtempSync(path.join(tmpdir(), 'blogimg-'));
  try {
    const src = path.join(dir, 'in.heic');
    const dst = path.join(dir, 'out.jpg');
    writeFileSync(src, buf);
    execFileSync('sips', ['-s', 'format', 'jpeg', src, '--out', dst], { stdio: 'pipe' });
    return readFileSync(dst);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const results = { converted: [], skipped: [], failed: [] };
const files = [...(await listPrefix('')), ...(await listPrefix('body'))];
console.log(`対象バケット走査: ${files.length} オブジェクト`);

for (const name of files) {
  if (VARIANT_RE.test(name)) continue; // 生成済み変種そのもの
  if (!SOURCE_EXT_RE.test(name)) {
    results.skipped.push(name);
    continue;
  }
  try {
    const { data, error } = await storage.download(name);
    if (error) throw new Error(`download: ${error.message}`);
    let buf = Buffer.from(await data.arrayBuffer());
    if (/\.(heic|heif)$/i.test(name)) buf = heicToJpeg(buf);

    const base = name.replace(SOURCE_EXT_RE, '');
    for (const w of WIDTHS) {
      // .rotate() でEXIFの向きをピクセルに反映させる（変種はEXIFを持たないため必須）
      const webp = await sharp(buf)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 80, effort: 5 })
        .toBuffer();
      const { error: upErr } = await storage.upload(
        `${base}_w${w}.webp`,
        new Blob([webp], { type: 'image/webp' }),
        { upsert: true, contentType: 'image/webp', cacheControl: '31536000' },
      );
      if (upErr) throw new Error(`upload _w${w}: ${upErr.message}`);
    }
    results.converted.push(name);
    console.log(`✔ ${name}`);
  } catch (e) {
    results.failed.push({ name, error: String(e.message || e) });
    console.error(`✖ ${name}: ${e.message || e}`);
  }
}

// 検証: 変換した全原本について変種3つが公開URLで取得できること
let verifyNg = 0;
for (const name of results.converted) {
  const base = name.replace(SOURCE_EXT_RE, '');
  for (const w of WIDTHS) {
    const url = storage.getPublicUrl(`${base}_w${w}.webp`).data.publicUrl;
    const res = await fetch(url, { method: 'HEAD' });
    if (!res.ok) {
      verifyNg++;
      console.error(`✖ verify ${base}_w${w}.webp → HTTP ${res.status}`);
    }
  }
}

console.log('──────────');
console.log(`変換: ${results.converted.length} / 形式対象外: ${results.skipped.length} / 失敗: ${results.failed.length} / 検証NG: ${verifyNg}`);
if (results.skipped.length) console.log('対象外:', results.skipped.join(', '));
const reportPath = process.env.REPORT_PATH;
if (reportPath) writeFileSync(reportPath, JSON.stringify(results, null, 2));
process.exit(results.failed.length || verifyNg ? 1 : 0);
