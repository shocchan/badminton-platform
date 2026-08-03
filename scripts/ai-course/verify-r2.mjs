#!/usr/bin/env node
// R2 バケットの中身がローカルと一致するかを検証する（承認パック A の確認手順）。
//
//   node scripts/ai-course/verify-r2.mjs ai-course-content-staging
//
// 見るもの:
//   - 件数（ローカルと R2 で過不足がないか）
//   - 各ファイルのサイズ一致（1バイトでも違えば壊れている）
//   - 合計容量
//   - 代表ファイルの中身の一致（先頭・末尾ではなく全体のハッシュ）
//
// 「一覧に出たから OK」で済ませない。サイズまで見ないと、途中で切れた
// オブジェクトを正常と誤認する（実測でアップロードの誤検知があったため）。

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';

const bucket = process.argv[2];
if (!bucket) {
  console.error('使い方: node scripts/ai-course/verify-r2.mjs <bucket-name>');
  process.exit(2);
}

const readToken = () => {
  if (process.env.CF_API_TOKEN) return process.env.CF_API_TOKEN;
  const cfg = join(homedir(), 'Library/Preferences/.wrangler/config/default.toml');
  if (!existsSync(cfg)) return null;
  const m = readFileSync(cfg, 'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
};
const token = readToken();
const accountId = process.env.CF_ACCOUNT_ID || '9e3a76dce49e8c31804afc8b0f3b2489';
if (!token) { console.error('Cloudflareの認証情報が見つかりません。'); process.exit(2); }
const api = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`;
const auth = { Authorization: `Bearer ${token}` };

const SRC = 'content-dist';
const AUDIO_SRC = 'content-audio/ai-course';
const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/** ローカル: key → { size, path } */
const local = new Map();
for (const p of walk(SRC)) {
  const key = relative(SRC, p);
  if (key === 'manifest.json') continue;
  local.set(key, { size: statSync(p).size, path: p });
}
if (existsSync(AUDIO_SRC)) {
  for (const p of walk(AUDIO_SRC)) {
    local.set(`v2/audio/${relative(AUDIO_SRC, p)}`, { size: statSync(p).size, path: p });
  }
}

/** R2: key → size */
const remote = new Map();
let cursor = '';
for (let page = 0; page < 20; page++) {
  const url = `${api}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
  const res = await fetch(url, { headers: auth });
  if (!res.ok) { console.error(`一覧取得に失敗: HTTP ${res.status}`); process.exit(1); }
  const body = await res.json();
  for (const o of body.result ?? []) remote.set(o.key, o.size);
  cursor = body.result_info?.cursor ?? '';
  if (!cursor || (body.result ?? []).length === 0) break;
  await new Promise((r) => setTimeout(r, 400));
}

const missing = [...local.keys()].filter((k) => !remote.has(k));
const extra = [...remote.keys()].filter((k) => !local.has(k));
const sizeMismatch = [...local.entries()]
  .filter(([k, v]) => remote.has(k) && remote.get(k) !== v.size)
  .map(([k, v]) => `${k}: local ${v.size} / r2 ${remote.get(k)}`);

const localBytes = [...local.values()].reduce((n, v) => n + v.size, 0);
const remoteBytes = [...remote.values()].reduce((n, v) => n + v, 0);

console.log('R2 検証（' + bucket + '）\n');
console.log(`  ローカル : ${local.size} ファイル / ${localBytes.toLocaleString()} bytes`);
console.log(`  R2       : ${remote.size} ファイル / ${remoteBytes.toLocaleString()} bytes`);
console.log(`  不足     : ${missing.length}`);
console.log(`  余分     : ${extra.length}`);
console.log(`  サイズ不一致: ${sizeMismatch.length}`);

// 代表ファイルの中身を実際に取得してハッシュ比較（種類ごとに1つずつ）
const samples = [
  'v2/meta/pool-index.json',
  'v2/diagnosis/pools.json',
  'v2/conversation/w01m1.json',
  'v2/grammar-doc/n3g-mama.json',
  'v2/sets/reading/n3.json',
  [...local.keys()].find((k) => k.startsWith('v2/pool/vocab/')),
  [...local.keys()].find((k) => k.startsWith('v2/audio/')),
].filter(Boolean);

console.log('\n  中身の一致（sha256・全体）:');
let contentOk = 0;
for (const key of samples) {
  const l = local.get(key);
  if (!l) { console.log(`    ${key} — ローカルに無い`); continue; }
  const res = await fetch(`${api}/objects/${key}`, { headers: auth });
  if (!res.ok) { console.log(`    ❌ ${key} — 取得失敗 HTTP ${res.status}`); continue; }
  const buf = Buffer.from(await res.arrayBuffer());
  const h = (b) => createHash('sha256').update(b).digest('hex').slice(0, 16);
  const same = h(buf) === h(readFileSync(l.path));
  console.log(`    ${same ? '✅' : '❌'} ${key} (${buf.length.toLocaleString()} bytes)`);
  if (same) contentOk += 1;
  await new Promise((r) => setTimeout(r, 400));
}

const pass = missing.length === 0 && sizeMismatch.length === 0 && contentOk === samples.length;
console.log(`\n${pass ? '✅ 一致しています。' : '❌ 差分があります。'}`);
if (missing.length > 0) {
  console.log('不足（先頭10件）:');
  for (const k of missing.slice(0, 10)) console.log(`  ${k}`);
}
if (sizeMismatch.length > 0) {
  console.log('サイズ不一致（先頭10件）:');
  for (const m of sizeMismatch.slice(0, 10)) console.log(`  ${m}`);
}
process.exit(pass ? 0 : 1);
