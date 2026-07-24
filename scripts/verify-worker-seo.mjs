/**
 * SEO 回帰テスト（要: 事前に `npm run build` で dist/_worker.js を生成）。
 *
 * 検証内容:
 *  - 旧URLが真の 301 で正規URLへ遷移する（クエリ保持）
 *  - POST 等の処理リクエストは 301 しない
 *  - 正規URL・言語非依存ページ(/cancel)はリダイレクトしない（ループ防止）
 *  - 各ページの canonical はちょうど1件（meta 重複の再発防止）
 *  - /zh/blog は noindex, follow
 *
 * 実行: node scripts/verify-worker-seo.mjs
 */
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const workerPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', '_worker.js');
const worker = (await import(workerPath)).default;
const BASE = 'https://kawabado.com';
const env = {}; // Supabase 無し → ID系は fail-open 200、ネットワーク呼び出し無し

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : '  <<< ' + detail}`);
  ok ? pass++ : fail++;
};
const hit = async (method, path) => {
  const res = await worker.fetch(new Request(BASE + path, { method }), env);
  return { status: res.status, loc: res.headers.get('location'), robots: res.headers.get('x-robots-tag'), text: () => res.text() };
};

// 1) 301 リダイレクト（代表例）
const REDIRECTS = [
  ['/', '/ja/'], ['/faq', '/ja/faq'], ['/blog', '/ja/blog'], ['/blog/12', '/ja/blog/12'],
  ['/activity', '/ja/activity'], ['/activity-cn', '/zh/activity'], ['/tournaments/22', '/ja/tournaments/22'],
  ['/admin', '/ja/admin'], ['/results/vol1', '/ja/results/vol1'],
  ['/chaoxianzu/admin', '/chaoxianzu/ja/admin'],
];
for (const [from, to] of REDIRECTS) {
  const r = await hit('GET', from);
  check(`301 GET ${from} -> ${to}`, r.status === 301 && r.loc === BASE + to, `${r.status} ${r.loc}`);
}

// 2) クエリ保持
{
  const r = await hit('GET', '/blog/12?utm=x&a=1');
  check('query preserved on 301', r.status === 301 && r.loc === BASE + '/ja/blog/12?utm=x&a=1', r.loc);
}

// 3) POST は 301 しない
{
  const r = await hit('POST', '/blog/12');
  check('POST /blog/12 not redirected', r.status !== 301, `status ${r.status}`);
}

// 4) 正規URL・/cancel はリダイレクトしない（ループ防止）
for (const p of ['/ja/blog/12', '/ja/', '/cancel', '/zh/activity/uid']) {
  const r = await hit('GET', p);
  check(`no-loop: ${p} not 301`, r.status !== 301, `status ${r.status}`);
}

// 5) canonical はちょうど1件（静的ページ）
for (const p of ['/ja/faq', '/zh/faq', '/ja/', '/zh/blog']) {
  const html = await (await hit('GET', p)).text();
  const n = (html.match(/<link[^>]*rel="canonical"[^>]*>/gi) || []).length;
  check(`single canonical on ${p}`, n === 1, `found ${n}`);
}

// 6) /zh/blog は noindex, follow
{
  const r = await hit('GET', '/zh/blog');
  check('/zh/blog noindex,follow', r.status === 200 && /noindex/.test(r.robots || ''), `${r.status} ${r.robots}`);
  const rja = await hit('GET', '/ja/blog');
  check('/ja/blog NOT noindexed', rja.status === 200 && !rja.robots, `${rja.status} ${rja.robots}`);
}

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail > 0 ? 1 : 0);
