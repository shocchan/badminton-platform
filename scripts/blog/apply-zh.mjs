// 訳文（scripts/blog/zh/<id>.zh.json）を元記事のHTML骨格へ戻し、blog_posts へ反映する。
//
//   検品だけ（DBは変えない・SQLを書き出す）:
//     node --experimental-strip-types scripts/blog/apply-zh.mjs --ids 9,12,13,19,21,22,24,35
//   実際に反映（**親が実行する**）:
//     node --experimental-strip-types scripts/blog/apply-zh.mjs --ids 9 --write
//
// 【--experimental-strip-types が要る理由】
// 検品に src/lib/aiLesson/course/adventure/advLanguageIntegrity.ts の checkText をそのまま使う。
// .ts を .mjs から読むため Node の type stripping が要る（Node 22.6+ はこのフラグ、23.6+ は既定で有効）。
// 読めなかった場合、**--write は拒否する**（検査していない訳を公開しない = fail closed）。
//
// 【安全装置】
//   1. 既定は読み取りのみ。--write を明示しない限り1行も UPDATE しない
//   2. project ref は supabase/.temp/project-ref と一致必須（別プロジェクトへ誤射しない）
//   3. 検品NG（固有名詞が訳されている・骨格が変わった・記事が編集済み）なら --write でも中止
//   4. 更新するのは title_zh / excerpt_zh / content_zh の3列だけ。
//      日本語側（title・excerpt・content）と status・published_at には**触らない**
//   5. token は環境変数または ~/.supabase_backup_token から読み、標準出力へ出さない
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchPosts } from './export-zh-todo.mjs';
import { verifyTranslation } from './verify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_REF = 'jdkwijdphlkrcoiggfqw';

const argv = process.argv.slice(2);
const arg = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const flag = (name) => argv.includes(name);

function loadEnv() {
  const env = {};
  for (const line of readFileSync(join(ROOT, '.env'), 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0 || line.trim().startsWith('#')) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  return { url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_ANON_KEY };
}

/** SQLリテラル。'' で括り、シングルクォートを2つにする（値はここでしか組み立てない） */
const lit = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

export function buildUpdateSql(id, { title_zh, excerpt_zh, content_zh }) {
  return `update public.blog_posts set title_zh = ${lit(title_zh)}, `
    + `excerpt_zh = ${lit(excerpt_zh)}, content_zh = ${lit(content_zh)} `
    + `where id = ${Number(id)};`;
}

/** Management API 経由でSQLを流す（remote-sql.mjs と同じ経路・同じ安全装置） */
async function runSql(sql) {
  const linked = existsSync(join(ROOT, 'supabase/.temp/project-ref'))
    ? readFileSync(join(ROOT, 'supabase/.temp/project-ref'), 'utf8').trim() : '';
  if (linked !== EXPECTED_REF) {
    throw new Error(`refuse: linked project ref mismatch (linked="${linked}" expected="${EXPECTED_REF}")`);
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN
    || (existsSync(join(homedir(), '.supabase_backup_token'))
      ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
  if (!token) throw new Error('refuse: no access token (SUPABASE_ACCESS_TOKEN or ~/.supabase_backup_token)');

  const res = await fetch(`https://api.supabase.com/v1/projects/${EXPECTED_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function main() {
  const ids = String(arg('--ids', '')).split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    console.error('usage: node --experimental-strip-types scripts/blog/apply-zh.mjs --ids 9,12 [--write]');
    process.exit(2);
  }
  const write = flag('--write');
  const posts = await fetchPosts(ids, loadEnv());
  const byId = new Map(posts.map((p) => [String(p.id), p]));

  // 列が無いまま UPDATE を投げると Postgres の生エラーで落ちる。先に分かりやすく止める
  // （fetchPosts は列が無いとき zh 抜きの select にフォールバックするので、キーの有無で判る）
  const columnsReady = posts.length === 0 || Object.hasOwn(posts[0], 'content_zh');
  if (!columnsReady) {
    console.error('⚠️  blog_posts に title_zh / excerpt_zh / content_zh がありません。');
    console.error('   supabase/migrations/20260825110000_blog_zh_columns.sql を先に適用してください。');
    if (write) process.exit(2);
  }

  const statements = [];
  let bad = 0;
  let integrityMissing = false;
  let sourceEdited = false;

  for (const id of ids) {
    const post = byId.get(id);
    if (!post) { console.error(`✗ id=${id}: 記事を取得できませんでした`); bad++; continue; }
    const path = join(ROOT, 'scripts/blog/zh', `${id}.zh.json`);
    if (!existsSync(path)) { console.error(`✗ id=${id}: ${path} がありません`); bad++; continue; }
    const zhDoc = JSON.parse(readFileSync(path, 'utf8'));

    const r = await verifyTranslation(post, zhDoc);
    if (!r.integrityRan) integrityMissing = true;
    for (const w of r.warnings || []) {
      console.error(`⚠️  [${w.kind}] ${w.where}: ${w.detail}`);
      if (write && !flag('--allow-source-edited')) sourceEdited = true;
    }
    if (!r.ok) {
      bad++;
      console.error(`✗ id=${id}: 検品NG（${r.issues.length}件）`);
      for (const i of r.issues) console.error(`   [${i.kind}] ${i.where}: ${i.detail}`);
      continue;
    }
    console.log(`✓ id=${id}: nodes=${zhDoc.nodes.length} content_zh=${r.contentZh.length}文字`
      + `${r.integrityRan ? '' : ' （⚠️ 言語整合性チェックは走っていません）'}`);
    statements.push(buildUpdateSql(id, {
      title_zh: zhDoc.title_zh || null,
      excerpt_zh: zhDoc.excerpt_zh || null,
      content_zh: r.contentZh,
    }));
  }

  const sql = `${statements.join('\n')}\n`;
  const out = join(ROOT, 'scripts/blog/zh/apply-zh.generated.sql');
  writeFileSync(out, sql, 'utf8');
  console.log(`\nSQL: ${out}（${statements.length}件）`);

  if (!write) {
    console.log('（--write が無いのでDBは変更していません。反映は親が実行します）');
    process.exit(bad ? 1 : 0);
  }
  if (bad) { console.error('refuse: 検品NGがあるため --write を中止しました'); process.exit(1); }
  if (integrityMissing) {
    console.error('refuse: 言語整合性チェック（checkText）が読めていません。');
    console.error('  node --experimental-strip-types scripts/blog/apply-zh.mjs ... で実行してください');
    process.exit(2);
  }
  if (!statements.length) { console.error('refuse: 更新対象が0件です'); process.exit(1); }
  if (sourceEdited) {
    console.error('refuse: 日本語本文が編集された記事があります。');
    console.error('  訳を読み直したうえで、それでも反映するなら --allow-source-edited を付けてください');
    process.exit(1);
  }

  await runSql(sql);
  console.log(`✅ ${statements.length}件を反映しました`);
}

if (process.argv[1] && process.argv[1].endsWith('apply-zh.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
