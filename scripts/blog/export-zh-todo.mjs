// ブログ記事の「訳す対象テキスト」だけを取り出す（読み取り専用）。
//
//   node scripts/blog/export-zh-todo.mjs --ids 9,12,13,19,21,22,24,35
//   node scripts/blog/export-zh-todo.mjs --ids 9 --out scripts/blog/zh
//
// 出力: scripts/blog/zh/<id>.todo.json
//   { id, title, excerpt, skeleton, nodes: [{ index, ja }] }
//
// 【なぜタグを渡さないか】
// scripts/blog/htmlText.mjs の冒頭に書いた理由のとおり、本文HTMLをそのまま翻訳へ回すと
// URL・iframe属性が訳されて壊れる。ここではテキストノードだけを抜く。
//
// 【なぜ書き込みが無いか】
// このスクリプトはDBを一切変更しない。anon キーで公開記事を読むだけ。
// 反映は scripts/blog/apply-zh.mjs が担当（そちらは --write を明示しないと書かない）。
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractTextNodes, structureFingerprint, contentHash } from './htmlText.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};

/** .env から Supabase の接続情報を読む（値は出力しない） */
function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) throw new Error('.env が見つかりません');
  const env = {};
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const eq = line.indexOf('=');
    if (eq <= 0 || line.trim().startsWith('#')) continue;
    env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
  }
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('.env に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY がありません');
  return { url, key };
}

export async function fetchPosts(ids, { url, key }) {
  const res = await fetch(
    `${url}/rest/v1/blog_posts?id=in.(${ids.join(',')})`
    + '&select=id,title,excerpt,content,content_type,status,title_zh,excerpt_zh,content_zh',
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    // title_zh 等がまだ無いDB（migration適用前）でも動くようにフォールバックする
    const res2 = await fetch(
      `${url}/rest/v1/blog_posts?id=in.(${ids.join(',')})`
      + '&select=id,title,excerpt,content,content_type,status',
      { headers: { apikey: key, Authorization: `Bearer ${key}` } },
    );
    if (!res2.ok) throw new Error(`Supabase REST ${res2.status}: ${await res2.text()}`);
    return res2.json();
  }
  return res.json();
}

/** 1記事分の作業ファイルを組み立てる（DBに触らないのでテストから直接呼べる） */
export function buildTodo(post) {
  const nodes = extractTextNodes(post.content || '');
  return {
    id: post.id,
    status: post.status ?? null,
    contentType: post.content_type ?? 'html',
    // 骨格（タグの並び）の指紋。ズレたら index の対応が崩れているので適用を止める
    skeleton: structureFingerprint(post.content || ''),
    // 日本語本文の指紋。構造が同じでも文言が変わっていたら訳が古い
    contentHash: contentHash(post.content || ''),
    title: post.title ?? '',
    excerpt: post.excerpt ?? '',
    // ここに入るのは**テキストだけ**。タグ・属性・URLは1文字も入らない
    nodes: nodes.map((n) => ({ index: n.index, ja: n.text })),
  };
}

async function main() {
  const ids = String(arg('--ids', '')).split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    console.error('usage: node scripts/blog/export-zh-todo.mjs --ids 9,12,13 [--out scripts/blog/zh]');
    process.exit(2);
  }
  const outDir = join(ROOT, arg('--out', 'scripts/blog/zh'));
  mkdirSync(outDir, { recursive: true });

  const posts = await fetchPosts(ids, loadEnv());
  const found = new Set(posts.map((p) => String(p.id)));
  for (const id of ids) {
    if (!found.has(id)) console.error(`! id=${id} は取得できませんでした（下書きは anon では読めません）`);
  }

  for (const post of posts) {
    const todo = buildTodo(post);
    const path = join(outDir, `${post.id}.todo.json`);
    writeFileSync(path, `${JSON.stringify(todo, null, 2)}\n`, 'utf8');
    // 日本語本文のスナップショット。**翻訳には渡さない**（渡すとURL・iframe属性が訳される）。
    // これはテストの入力: ネットワーク無しで「訳を戻したら骨格が保たれるか」を確かめるために要る
    writeFileSync(join(outDir, `${post.id}.source.html`), post.content || '', 'utf8');
    const chars = todo.nodes.reduce((n, x) => n + x.ja.length, 0);
    console.log(`${path}  nodes=${todo.nodes.length}  chars=${chars}`
      + `  skeleton=${todo.skeleton}  contentHash=${todo.contentHash}`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('export-zh-todo.mjs')) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
