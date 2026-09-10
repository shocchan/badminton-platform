#!/usr/bin/env node
// コードが呼んでいるDBの関数（RPC）とテーブルが、本番DBに本当にあるかを確かめる（2026-09-10）。
//
// 【なぜ】管理画面の「入金確認」ボタンは admin_set_entry_payment を呼ぶが、その関数を作る
// migration が本番DBに一度も適用されておらず、押すと404だった。8/28の統合から約2週間、
// 誰も気づかなかった（問い合わせタブも同じ理由で動いていなかった）。
// repo に migration ファイルがあっても、本番DBにある証拠にはならない。だから実物と突き合わせる。
//
// 使い方:
//   node scripts/check-db-objects.mjs src                          # 無ければ exit 1（本番デプロイの門(e)）
//   node scripts/check-db-objects.mjs supabase/functions/<名前> …  # Edge Function を出す前
//   node scripts/check-db-objects.mjs --warn src                   # 何があっても exit 0（ステージング）
//
// 終了コード: 0 = 全部ある / 1 = 本番DBに無いものがある / 2 = 確かめられなかった
// 確かめられなかったとき（トークンが無い・APIに届かない・調べるファイルが無い）も止める。
// 確かめずに通すと、この門が無いのと同じになる。
//
// 何を「呼んでいる」とみなすか（拾う書き方・拾わないもの）は scripts/dbObjectRefs.mjs。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { homedir } from 'node:os';
import { extractDbRefs, isScannedFile, findMissing, emptyRefs, addRefs } from './dbObjectRefs.mjs';

const argv = process.argv.slice(2);
const warnOnly = argv.includes('--warn');
const targets = argv.filter((a) => !a.startsWith('--'));

/** 確かめられなかった。--warn のときだけ続ける */
const unverified = (why) => {
  console.log(`  ${warnOnly ? '⚠️ ' : '❌'} 本番DBと突き合わせられませんでした: ${why}`);
  process.exit(warnOnly ? 0 : 2);
};

if (targets.length === 0) {
  console.error('使い方: node scripts/check-db-objects.mjs [--warn] <調べるフォルダ・ファイル…>');
  process.exit(2);
}

// 指定したフォルダ・ファイルに加えて、そこから相対パスで import しているファイルも辿る。
// Edge Function は _shared の共有部品を import して使う。_shared を丸ごと見ると、
// その関数が使っていない部品のせいで無関係な関数のデプロイまで止まる
// （2026-09-10 実測: AIレッスン用の _shared/aiCostMeter.ts が呼ぶ関数が本番DBに無く、
//   丸ごと見ていたら、それを読まない Stripe webhook のデプロイまで止めていた）。
// `--list-files` を付けると、DBを見ずに「調べるファイル」だけを表示して終わる（確認・テスト用）。
const listOnly = argv.includes('--list-files');
const SKIP = new Set(['node_modules', 'dist', '.git']);
const RESOLVE = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx', '/index.js'];
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;
const seen = new Set();
const files = [];
const addFile = (p) => {
  if (seen.has(p) || !isScannedFile(p)) return;
  seen.add(p);
  files.push(p);
  for (const m of readFileSync(p, 'utf8').matchAll(IMPORT)) {
    const base = resolve(p, '..', m[2].split('?')[0]);
    const hit = RESOLVE.map((ext) => base + ext).find((c) => existsSync(c) && statSync(c).isFile());
    if (hit) addFile(hit);
  }
};
const walk = (p) => {
  if (!existsSync(p)) return;
  if (statSync(p).isFile()) return addFile(p);
  for (const name of readdirSync(p)) if (!SKIP.has(name)) walk(join(p, name));
};
for (const t of targets) walk(resolve(t));
if (listOnly) {
  for (const f of files) console.log(relative(process.cwd(), f));
  process.exit(0);
}
if (files.length === 0) unverified(`調べるファイルが1つもありません（${targets.join(' ')}）`);

const refs = emptyRefs();
for (const f of files) addRefs(refs, extractDbRefs(readFileSync(f, 'utf8')), relative(process.cwd(), f));

const REF = process.env.PROJECT_REF || 'jdkwijdphlkrcoiggfqw';
const tokenFile = join(homedir(), '.supabase_backup_token');
const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '');
if (!token) unverified('Supabase のトークンがありません（~/.supabase_backup_token か SUPABASE_ACCESS_TOKEN）');

// public スキーマの関数と、テーブル・ビュー類。PostgREST が /rest/v1 で見せるのはここ
const SQL = `select 'fn' as kind, p.proname as name
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
union all
select 'rel', c.relname
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f')`;

let rows;
try {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: SQL }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) unverified(`Supabase API が ${res.status} を返しました`);
  rows = await res.json();
} catch (e) {
  unverified(`Supabase API に届きません（${e.message}）`);
}
if (!Array.isArray(rows)) unverified('Supabase API の応答が想定と違いました');

const liveFunctions = new Set(rows.filter((r) => r.kind === 'fn').map((r) => r.name));
const liveRelations = new Set(rows.filter((r) => r.kind === 'rel').map((r) => r.name));
// 0件は「DBが空」ではなく、見る先か権限が違う。0件と比べて全部「無い」と言うのは嘘になる
if (liveFunctions.size === 0 || liveRelations.size === 0) unverified(`本番DBの一覧が空でした（project ${REF}）`);

const missing = findMissing(refs, liveFunctions, liveRelations);
const count = missing.rpcs.length + missing.tables.length;
console.log(`  調べたファイル ${files.length} ／ 呼んでいる関数 ${refs.rpcs.size}・テーブル ${refs.tables.size}（本番DB ${REF}）`);
if (count === 0) {
  console.log('  すべて本番DBにあります');
  process.exit(0);
}

console.log(`  ${warnOnly ? '⚠️ ' : '❌'} 本番DBに無いもの ${count}件:`);
const show = (label, list, where) => {
  for (const n of list) {
    const at = where.get(n);
    console.log(`     ${label} ${n}`);
    console.log(`       ← ${at.slice(0, 3).join(' / ')}${at.length > 3 ? ` ほか${at.length - 3}か所` : ''}`);
  }
};
show('関数', missing.rpcs, refs.rpcs);
show('テーブル', missing.tables, refs.tables);
process.exit(warnOnly ? 0 : 1);
