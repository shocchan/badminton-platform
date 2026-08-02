#!/usr/bin/env node
// content-dist/ のシャードと聴解音声を **local の** R2（miniflare）へ入れる。
//
// remote は一切触らない。wrangler dev の dev-seed 口（AI_COURSE_DEV_SEED=enabled の
// 環境でだけ開く）へ HTTP で流し込む。CLI の1件ずつ put は1,500ファイルで30分かかるため。
//
//   npm run dev:worker            # 先に起動しておく
//   node scripts/ai-course/seed-local-r2.mjs

import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const BASE = process.env.WORKER_URL || 'http://127.0.0.1:8787';
const SRC = 'content-dist';
const AUDIO_SRC = 'content-audio/ai-course';

if (!existsSync(SRC)) {
  console.error(`${SRC}/ がありません。先に npm run build:ai-course-content を実行してください。`);
  process.exit(2);
}

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

/** { r2key, path } の一覧 */
const jobs = walk(SRC)
  .map((p) => ({ key: relative(SRC, p), path: p }))
  .filter((j) => j.key !== 'manifest.json');
if (existsSync(AUDIO_SRC)) {
  for (const p of walk(AUDIO_SRC)) {
    jobs.push({ key: `v2/audio/${relative(AUDIO_SRC, p)}`, path: p });
  }
} else {
  console.warn(`⚠️ ${AUDIO_SRC} がありません。音声はseedされません`);
}

const CONCURRENCY = 24;
let done = 0;
let failed = 0;

const putOne = async (job) => {
  const res = await fetch(`${BASE}/api/ai-course/dev-seed?key=${encodeURIComponent(job.key)}`, {
    method: 'POST',
    body: readFileSync(job.path),
  });
  if (!res.ok) {
    failed += 1;
    if (failed <= 3) console.error(`\n  失敗: ${job.key} → ${res.status}`);
    return;
  }
  done += 1;
  if (done % 100 === 0 || done === jobs.length) process.stdout.write(`\r  ${done}/${jobs.length} 投入`);
};

const queue = [...jobs];
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length > 0) {
    const job = queue.pop();
    if (job) await putOne(job);
  }
}));

console.log(`\n${failed === 0 ? '✅' : '❌'} local R2 へ ${done} 件投入（失敗 ${failed}）。remote は触っていません`);
process.exit(failed === 0 ? 0 : 1);
