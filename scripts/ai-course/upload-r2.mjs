#!/usr/bin/env node
// 教材シャードと聴解音声を R2 バケットへアップロードする。
//
// **CEO承認済みの staging バケットにのみ使う。** 対象バケットは引数で明示させ、
// 既定値を持たせない（うっかり本番バケットへ流し込む事故を仕組みで防ぐ）。
//
//   node scripts/ai-course/upload-r2.mjs ai-course-content-staging
//
// 実測でわかった制約（この2つを踏まえた実装になっている）:
//   1. wrangler CLI を1ファイルずつ呼ぶ方式は、1,833プロセスの起動に耐えられず
//      途中で落ちる（50件で停止）→ 単一プロセスから REST API を叩く
//   2. Cloudflare API は **1,200リクエスト/5分** で、超えると接続ごと切られる
//      → 秒あたりのリクエスト数を絞る（下の RATE_PER_SEC）
//
// 何度実行してもよい: 先にバケットの中身を一覧し、**まだ無いものだけ**を送る。
// 認証は wrangler が保存済みの OAuth トークンを読む。**画面にもログにも出さない。**

import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { homedir } from 'node:os';

const bucket = process.argv[2];
const force = process.argv.includes('--force');
if (!bucket) {
  console.error('使い方: node scripts/ai-course/upload-r2.mjs <bucket-name> [--force]');
  process.exit(2);
}
if (!bucket.endsWith('-staging') && process.env.ALLOW_NON_STAGING !== 'yes') {
  console.error(`バケット名 "${bucket}" は -staging で終わっていません。`);
  console.error('本番バケットへの誤投入を防ぐため停止します（意図的なら ALLOW_NON_STAGING=yes）。');
  process.exit(2);
}

// ── 認証情報（値は決して出力しない） ──
const readToken = () => {
  if (process.env.CF_API_TOKEN) return process.env.CF_API_TOKEN;
  const cfg = join(homedir(), 'Library/Preferences/.wrangler/config/default.toml');
  if (!existsSync(cfg)) return null;
  const m = readFileSync(cfg, 'utf8').match(/^oauth_token\s*=\s*"([^"]+)"/m);
  return m ? m[1] : null;
};
const token = readToken();
const accountId = process.env.CF_ACCOUNT_ID || '9e3a76dce49e8c31804afc8b0f3b2489';
if (!token) {
  console.error('Cloudflareの認証情報が見つかりません（wrangler login 済みか確認してください）。');
  process.exit(2);
}
const api = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}`;
const auth = { Authorization: `Bearer ${token}` };

// ── レート制限（1,200/5分 = 4/秒。安全側で 3/秒に絞る） ──
const RATE_PER_SEC = 3;
let nextSlotMs = Date.now();
const takeSlot = async () => {
  const now = Date.now();
  nextSlotMs = Math.max(nextSlotMs, now) + 1000 / RATE_PER_SEC;
  const waitMs = nextSlotMs - now - 1000 / RATE_PER_SEC;
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
};

const SRC = 'content-dist';
const AUDIO_SRC = 'content-audio/ai-course';

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

if (!existsSync(SRC)) {
  console.error(`${SRC}/ がありません。先に npm run build:ai-course-content を実行してください。`);
  process.exit(2);
}

/** ローカルにある全ファイル */
const all = [];
for (const p of walk(SRC)) {
  const key = relative(SRC, p);
  if (key === 'manifest.json') continue;   // manifest はローカル検証用。R2 には置かない
  all.push({ key, path: p, contentType: 'application/json' });
}
if (existsSync(AUDIO_SRC)) {
  for (const p of walk(AUDIO_SRC)) {
    all.push({ key: `v2/audio/${relative(AUDIO_SRC, p)}`, path: p, contentType: 'audio/mp4' });
  }
} else {
  console.warn(`⚠️ ${AUDIO_SRC} がありません。音声はアップロードされません`);
}

// ── 既にあるものを一覧（1リクエストで最大1000件） ──
const listExisting = async () => {
  const found = new Set();
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    await takeSlot();
    const url = `${api}/objects?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) break;
    const body = await res.json();
    for (const o of body.result ?? []) found.add(o.key);
    cursor = body.result_info?.cursor ?? '';
    if (!cursor || (body.result ?? []).length === 0) break;
  }
  return found;
};

console.log(`アップロード先: ${bucket}`);
const existing = force ? new Set() : await listExisting();
const jobs = all.filter((j) => !existing.has(j.key));
console.log(`ローカル ${all.length} 件 / R2に既存 ${existing.size} 件 → 今回送る ${jobs.length} 件`);
if (jobs.length === 0) {
  console.log('✅ すべて投入済みです。');
  process.exit(0);
}

const CONCURRENCY = 6;   // レート制限側で絞るので、並列は接続の待ち時間を隠す程度でよい
let done = 0;
let failed = 0;
let bytes = 0;
const failures = [];
const started = Date.now();

const put = async (job) => {
  const body = readFileSync(job.path);
  for (let attempt = 1; attempt <= 5; attempt++) {
    await takeSlot();
    try {
      const res = await fetch(`${api}/objects/${job.key}`, {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': job.contentType },
        body,
      });
      if (res.ok) {
        done += 1;
        bytes += body.length;
        if (done % 100 === 0 || done === jobs.length) {
          const sec = (Date.now() - started) / 1000;
          const eta = Math.round((jobs.length - done) / Math.max(done / sec, 0.01));
          console.log(`  ${done}/${jobs.length} 投入（${(bytes / 1e6).toFixed(1)} MB・残り約${eta}秒）`);
        }
        return;
      }
      if (res.status < 500 && res.status !== 429) {
        failed += 1;
        failures.push(`${job.key} → HTTP ${res.status}`);
        return;
      }
    } catch { /* 接続断。下で待って再試行 */ }
    await new Promise((r) => setTimeout(r, 1000 * attempt));   // 制限に当たったら素直に待つ
  }
  failed += 1;
  failures.push(`${job.key} → 再試行上限`);
};

const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) {
    const job = queue.pop();
    if (job) await put(job);
  }
}));

const mins = ((Date.now() - started) / 60000).toFixed(1);
console.log(`\n${failed === 0 ? '✅' : '❌'} 完了: ${done}/${jobs.length} 件 / ${(bytes / 1e6).toFixed(1)} MB（失敗 ${failed}・所要 ${mins}分）`);
if (failures.length > 0) {
  console.log('失敗したキー（先頭10件）:');
  for (const f of failures.slice(0, 10)) console.log(`  ${f}`);
  console.log('\n※ もう一度同じコマンドを実行すると、残りだけを送ります。');
}
process.exit(failed === 0 ? 0 : 1);
