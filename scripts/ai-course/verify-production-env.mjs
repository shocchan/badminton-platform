#!/usr/bin/env node
/**
 * 本番デプロイ前の環境チェック（Phase Release Closure）。
 *
 * **秘密の値は絶対に表示しない。** 名前・存在・形・scope だけを見る。
 * 本番の認証情報が手元に無くても意味のある検査になるように、
 * 「値そのものの確認」と「構成の検査」を分けている。
 *
 * 実行: node scripts/ai-course/verify-production-env.mjs
 * 終了コード: 0=PASS / 1=FAIL（P0あり）
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/\/$/, '');
const results = [];
const add = (level, name, ok, detail) => results.push({ level, name, ok, detail });

const readEnv = (f) => {
  const p = join(ROOT, f);
  if (!existsSync(p)) return null;
  const out = {};
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
};

const base = readEnv('.env') ?? {};
const prod = readEnv('.env.production') ?? {};

// ── P0: クライアントへ秘密が露出していないか ──────────────────
const SECRET_HINT = /(SECRET|SERVICE_ROLE|PRIVATE|_SK_|^sk-)/i;
const leaked = Object.keys({ ...base, ...prod })
  .filter((k) => k.startsWith('VITE_') && SECRET_HINT.test(k));
add('P0', 'VITE_ 接頭辞で秘密が露出していない', leaked.length === 0,
  leaked.length ? `露出: ${leaked.join(', ')}` : '露出0件');

// ソース中に秘密がベタ書きされていないか（形だけを見る。値は出さない）
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  if (n === 'node_modules' || n === 'dist') return [];
  return statSync(p).isDirectory() ? walk(p) : (/\.(ts|tsx)$/.test(p) ? [p] : []);
});
const HARDCODED = [
  { re: /\bsk-[A-Za-z0-9_-]{20,}/, what: 'OpenAI APIキーらしき文字列' },
  { re: /\bsk_live_[A-Za-z0-9]{10,}/, what: 'Stripe secret keyらしき文字列' },
  { re: /\bservice_role\b\s*[:=]\s*['"][A-Za-z0-9._-]{40,}/, what: 'service_roleキーらしき文字列' },
];
const hardcodedHits = [];
for (const f of walk(join(ROOT, 'src'))) {
  const src = readFileSync(f, 'utf8');
  for (const h of HARDCODED) if (h.re.test(src)) hardcodedHits.push(`${f.replace(ROOT + '/', '')}: ${h.what}`);
}
add('P0', 'ソースに秘密のベタ書きがない', hardcodedHits.length === 0,
  hardcodedHits.length ? hardcodedHits.join(' / ') : '検出0件');

// ── P1: クライアントに必要な env が揃っているか ──────────────
for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
  add('P1', `${k} が存在する`, !!(prod[k] ?? base[k]), (prod[k] ?? base[k]) ? '存在' : '未設定');
}
// anon key が service_role になっていないか（JWTのrole部分だけを見る）
const anon = prod.VITE_SUPABASE_ANON_KEY ?? base.VITE_SUPABASE_ANON_KEY ?? '';
let anonRole = 'unknown';
try {
  const payload = JSON.parse(Buffer.from(anon.split('.')[1] ?? '', 'base64').toString('utf8'));
  anonRole = payload.role ?? 'unknown';
} catch { /* 形が違うなら unknown のまま */ }
add('P0', 'クライアント鍵が service_role ではない', anonRole !== 'service_role', `role=${anonRole}`);

// ── P1: Supabase URL の環境分離 ────────────────────────────
const baseUrl = base.VITE_SUPABASE_URL ?? '';
const prodUrl = prod.VITE_SUPABASE_URL ?? '';
add('INFO', 'production が Supabase URL を上書きしているか', true,
  prodUrl ? '上書きあり（環境分離）' : '上書きなし（staging と同一プロジェクトを共有：既知の構成）');
add('P1', 'Supabase URL の形式が正しい', /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(prodUrl || baseUrl),
  (prodUrl || baseUrl) ? '形式OK' : 'URL未設定');

// ── P1: 本番ビルドに source map を出していないか ───────────────
const viteCfg = existsSync(join(ROOT, 'vite.config.ts')) ? readFileSync(join(ROOT, 'vite.config.ts'), 'utf8') : '';
add('P1', '本番ビルドで source map を出していない', !/sourcemap:\s*true/.test(viteCfg),
  /sourcemap:\s*true/.test(viteCfg) ? 'sourcemap: true が有効' : '既定（無効）');

// ── P1: 学習アプリが noindex か ───────────────────────────
const coursePage = readFileSync(join(ROOT, 'src/pages/ai-lesson/AiCoursePage.tsx'), 'utf8');
add('P1', '学習アプリが noindex', /name="robots"\s+content="noindex/.test(coursePage), '');

// ── P1: 法務ページの公開ゲート ─────────────────────────────
const facts = readFileSync(join(ROOT, 'src/lib/aiLesson/course/legal/legalFacts.ts'), 'utf8');
const pendingCount = (facts.match(/^\s+\w+: null,$/gm) ?? []).length;
add('INFO', '法務ページの未確定事実', true,
  pendingCount ? `${pendingCount}件が未確定 → LEGAL_PUBLISH=false（非公開）` : '全確定 → 公開される');

// ── P1: サポート窓口の一貫性 ───────────────────────────────
add('P1', 'サポート窓口が info@kawabado.com に集約', facts.includes("info@kawabado.com"), '');

const fail = results.filter((r) => r.level === 'P0' && !r.ok);
const warn = results.filter((r) => r.level === 'P1' && !r.ok);

for (const r of results) {
  const mark = r.level === 'INFO' ? 'i' : r.ok ? 'PASS' : 'FAIL';
  console.log(`[${r.level}] ${mark.padEnd(4)} ${r.name}${r.detail ? `  — ${r.detail}` : ''}`);
}
console.log('');
console.log(`P0 FAIL: ${fail.length} / P1 FAIL: ${warn.length}`);
console.log('※ 本番の認証情報そのものの確認（Cloudflare/Supabaseダッシュボードの実値）は');
console.log('   VALUE_CONFIRMATION_DEFERRED_BY_CEO — このscriptの対象外。');
process.exit(fail.length ? 1 : 0);
