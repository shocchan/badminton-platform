#!/usr/bin/env node
// content-dist/ のシャードを **local の** R2（miniflare）へ入れる。
//
// remote は一切触らない（--local）。HTTP レベルの検証を remote 変更なしで行うために使う。
//
//   node scripts/ai-course/seed-local-r2.mjs        # 検証に必要な分だけ（速い）
//   node scripts/ai-course/seed-local-r2.mjs --all  # 全ページ（1,024個・時間がかかる）

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const BUCKET = 'ai-course-content';
const PERSIST = '.wrangler/state';
const SRC = 'content-dist';

if (!existsSync(SRC)) {
  console.error(`${SRC}/ がありません。先に npm run build:ai-course-content を実行してください。`);
  process.exit(2);
}

/** 検証シナリオで実際に触るページだけ。60分連続学習ぶんの vocab を厚めに入れる */
const VERIFY_KEYS = [
  'v1/reading/n3/read-n3-shortPassage/0.json',
  'v1/listening/n3/listen-n3-taskComprehension/0.json',
  'v1/reading/n2/read-n2-thematic/0.json',
  ...Array.from({ length: 10 }, (_, i) => `v1/vocab/n3/vocab-n5/${i}.json`),
];

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const all = process.argv.includes('--all');
const keys = all
  ? walk(SRC).map((p) => relative(SRC, p)).filter((k) => k !== 'manifest.json')
  : VERIFY_KEYS;

let done = 0;
for (const key of keys) {
  const file = join(SRC, key);
  if (!existsSync(file)) {
    console.error(`  skip（存在しない）: ${key}`);
    continue;
  }
  execFileSync(
    './node_modules/.bin/wrangler',
    ['r2', 'object', 'put', `${BUCKET}/${key}`, '--file', file, '--local', '--persist-to', PERSIST],
    { stdio: 'pipe' },
  );
  done += 1;
  process.stdout.write(`\r  ${done}/${keys.length} 投入`);
}
console.log(`\n✅ local R2 へ ${done} ページ投入しました（remote は触っていません）`);
