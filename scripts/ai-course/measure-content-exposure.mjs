#!/usr/bin/env node
/**
 * 有料教材が「認証なしで何バイト取れるか」を実測する（読み取りのみ・GETだけ）。
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 * 2026-08-24 の監査で、教材データが認証なしで取得できていることが分かった。
 *   GET https://kawabado.com/assets/ai-course-vocab-content-*.js
 *     → HTTP 200 / 2,080,346 bytes
 * ¥600 / ¥2,980 / ¥100,000 で売っている商品の中身が、URLを叩くだけで全量取れる状態。
 *
 * 門（scripts/generate-worker.mjs の AI_COURSE_ASSET_GATE）をONにしたあと、
 * **本当に0バイトになったか**を人の目で確かめるためのスクリプト。
 * 「実装したから閉じたはず」で終わらせないための道具。
 *
 * ── 使い方 ─────────────────────────────────────────────────
 *   node scripts/ai-course/measure-content-exposure.mjs
 *   node scripts/ai-course/measure-content-exposure.mjs https://staging.badminton-platform.pages.dev
 *
 * 終了コード: 露出が0なら 0 / 1バイトでも取れたら 1（CIに載せられる）
 *
 * ⚠️ GET しかしない。POST・書き込み・Cookie送信は一切しない（＝非購入者と同じ立場で見る）。
 */

const base = (process.argv[2] || 'https://kawabado.com').replace(/\/+$/, '');

/** 門の対象。scripts/generate-worker.mjs の GATED_ASSET_PREFIXES と同じ意味 */
const MATERIAL_PREFIXES = [
  'ai-course-vocab-content-',
  'ai-course-reading-',
  'ai-course-listening-',
];

const UA = 'kawabado-exposure-check/1.0 (+read-only)';

async function get(url, method = 'GET') {
  const res = await fetch(url, {
    method,
    headers: { 'User-Agent': UA },
    redirect: 'follow',
  });
  return res;
}

/**
 * 教材チャンクのURLは中身のハッシュ付きで、ビルドごとに変わる。
 * 公開されている index.html → メインバンドルを辿って、実際のファイル名を見つける。
 * （ハッシュを直書きすると、次のビルドで「取れなくなった＝閉じた」と誤判定する）
 */
async function discoverMaterialUrls() {
  const found = new Set();

  const indexRes = await get(base + '/');
  if (!indexRes.ok) throw new Error(`トップが取得できない: HTTP ${indexRes.status}`);
  const html = await indexRes.text();

  // まず HTML 内の直接参照
  for (const m of html.matchAll(/["'(](\/assets\/[A-Za-z0-9._-]+\.js)["')]/g)) {
    for (const p of MATERIAL_PREFIXES) if (m[1].includes(p)) found.add(m[1]);
  }

  /* 教材は lazy import（AdvShell 経由）なので HTML には出ない。
     メインバンドル → そこから参照される chunk → 教材、と2段辿る。
     ハッシュを直書きしないのは、次のビルドで「取れなくなった＝閉じた」と誤判定しないため。 */
  /* 暴走防止の上限。教材への参照は AdvShell の奥に居ることがあるので、
     チャンク名で絞らず全部辿る（絞ると「辿れなかった＝閉じた」と誤判定する）。
     公開チャンクは実測で100本超あるため、余裕を持たせている（1回の診断で数十秒かかる）。 */
  const MAX_FETCH = 200;
  const seen = new Set();
  const queue = [...html.matchAll(/src=["'](\/assets\/index-[A-Za-z0-9._-]+\.js)["']/g)].map((m) => m[1]);
  let fetched = 0;

  const collectFrom = (js) => {
    const next = [];
    // 絶対パス参照
    for (const m of js.matchAll(/["'`](\/assets\/[A-Za-z0-9._-]+\.js)["'`]/g)) next.push(m[1]);
    // 同一ディレクトリの相対参照（Vite が動的importで出す形）
    for (const m of js.matchAll(/["'`]\.\/([A-Za-z0-9._-]+\.js)["'`]/g)) next.push('/assets/' + m[1]);
    // チャンク名だけが配列で持たれている場合
    for (const m of js.matchAll(/["'`]([A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.js)["'`]/g)) next.push('/assets/' + m[1]);
    /* 教材チャンクは引用符の付き方が Vite のバージョンや import の書き方で変わる。
       ここだけは**引用符に依存せず**名前そのものを拾う（見落としが致命的なため） */
    for (const m of js.matchAll(/(ai-course-[a-z-]+-[A-Za-z0-9_-]{4,}\.js)/g)) next.push('/assets/' + m[1]);
    return next;
  };

  while (queue.length > 0 && fetched < MAX_FETCH) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);

    // 教材そのものなら中身は取りに行かない（測定は後段でやる）
    if (MATERIAL_PREFIXES.some((p) => path.includes(p))) { found.add(path); continue; }

    const r = await get(base + path);
    fetched++;
    if (!r.ok) continue;
    const ct = r.headers.get('Content-Type') || '';
    if (!ct.includes('javascript')) continue;
    const js = await r.text();
    for (const cand of collectFrom(js)) {
      if (MATERIAL_PREFIXES.some((p) => cand.includes(p))) { found.add(cand); continue; }
      if (!seen.has(cand) && /^\/assets\/[A-Za-z0-9._-]+\.js$/.test(cand)) queue.push(cand);
    }
  }
  if (fetched >= MAX_FETCH) {
    console.warn(`⚠️ 探索を ${MAX_FETCH} 本で打ち切りました。見つからなかった教材がある可能性があります。`);
  }
  return [...found];
}

const fmt = (n) => n.toLocaleString('en-US');

(async () => {
  console.log(`対象: ${base}`);
  console.log('（認証なし・GETのみ。非購入者と同じ立場で見ています）\n');

  let urls;
  try {
    urls = await discoverMaterialUrls();
  } catch (e) {
    console.error(`✗ 教材URLの発見に失敗: ${e.message}`);
    console.error('  トップページが取得できないか、バンドルの形が変わった可能性があります。');
    process.exit(2);
  }

  /* バンドル走査だけに頼ると「辿れなかった」を「閉じた」と誤判定する。
     ローカルの dist/assets/ に教材チャンクがあれば、その実ファイル名でも必ず叩く。 */
  const fromDist = [];
  try {
    const { readdirSync } = await import('node:fs');
    for (const f of readdirSync('dist/assets')) {
      if (MATERIAL_PREFIXES.some((p) => f.startsWith(p))) fromDist.push('/assets/' + f);
    }
  } catch { /* dist が無い環境ではバンドル走査のみ */ }
  for (const u of fromDist) if (!urls.includes(u)) urls.push(u);

  if (urls.length === 0) {
    console.log('教材チャンクへの参照がバンドルから見つかりませんでした。');
    console.log('考えられること:');
    console.log('  (a) 教材が公開バンドルから外された（＝望ましい状態）');
    console.log('  (b) バンドルの形が変わり、このスクリプトが辿れなくなった');
    console.log('  → 判定を誤らないため、リポジトリ直下（dist/assets/ がある場所）から実行してください。');
    process.exit(2);
  }
  if (fromDist.length > 0) {
    console.log(`（ローカル dist/assets/ の実ファイル名 ${fromDist.length} 件も突き合わせています）\n`);
  }

  let total = 0;
  const rows = [];
  for (const u of urls.sort()) {
    const full = base + u;
    let status = 0;
    let bytes = 0;
    let note = '';
    try {
      const res = await get(full);
      status = res.status;
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
      const ct = res.headers.get('Content-Type') || '';
      if (ct.includes('text/html')) note = '（HTMLが返った＝SPAフォールバック。教材ではない）';
      else if (status === 200) total += bytes;
    } catch (e) {
      note = `（取得失敗: ${e.message}）`;
    }
    rows.push({ u, status, bytes, note });
  }

  const w = Math.max(...rows.map((r) => r.u.length));
  for (const r of rows) {
    const mark = r.status === 403 ? '✅' : r.status === 200 && !r.note ? '🚨' : '  ';
    console.log(`${mark} ${r.u.padEnd(w)}  HTTP ${r.status}  ${fmt(r.bytes).padStart(10)} bytes ${r.note}`);
  }

  console.log(`\n認証なしで取得できた教材の合計: ${fmt(total)} bytes`);
  if (total > 0) {
    console.log('\n🚨 露出しています。');
    console.log('   門を閉じるには Cloudflare Pages の環境変数に次を設定してください:');
    console.log('     AI_COURSE_ASSET_GATE        = on');
    console.log('     AI_COURSE_ASSET_GATE_SECRET = <十分長いランダム文字列>');
    console.log('   ⚠️ 先に staging で学習が普通にできることを確認してから本番に入れてください。');
    process.exit(1);
  }
  console.log('\n✅ 認証なしでは教材本体を取得できません。');
  process.exit(0);
})();
