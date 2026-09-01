// @vitest-environment node
//
// 素のHTML（JSを実行しないクローラーが受け取るHTML）に、本文・JSON-LD・canonical・hreflang が
// 実際に入るか。**生成されたWorkerをそのまま評価して**確認する。
//
// 【なぜ要るか】
// 2026-08-24 の本番実測:
//   kawabado.com /             → HTML 1,692B / 可視テキスト0文字 / h1 0個 / JSON-LD 0個
//   kawabado.com /ja/ai-course → 同じ（headだけ差し替わる）
// Worker が差し込んでいたのは <head> だけで、中身は1文字も配っていなかった。
// robots.txt では GPTBot・ClaudeBot・PerplexityBot など16種のAIクローラーを明示Allowしているのに、
// 渡す本文が0文字＝許可だけして何も渡していない状態だった。
//
// 【なぜ文字列 grep ではなく評価するのか】
// Worker はビルド時に生成される1枚のJSで、テンプレート文字列の中でコードを組み立てている。
// 「ソースにこの文字が含まれる」テストは、生成物が壊れていても通ってしまう。
// ここでは scripts/generate-worker.mjs の buildWorkerSource() を呼び、
// 出てきたソースを data: URL で import して**実際の関数を実行**している。
// 生成物が構文エラーになったら、この import が落ちる（それも検出したい事象）。
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildWorkerSource } from '../../../scripts/generate-worker.mjs';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const INDEX_HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** 生成されたWorkerの内部関数。テストのために名前付きexportを足して評価する */
let W;

beforeAll(async () => {
  const source = buildWorkerSource(INDEX_HTML)
    + '\nexport { matchOgpRoute, buildOgpMeta, injectOgp, isKnownPath, htmlToParagraphs,'
    // generateSitemap も評価する（2026-08-25）。中国語版がある記事だけ /zh/blog/:id を
    // 送る分岐が入ったので、「文字列に含まれる」ではなく実際のXMLで確認する
    + ' generateSitemap, STATIC_SEO, NAV, KNOWN_LEAVES, ORG_JSONLD, WEBSITE_JSONLD };\n';
  const url = 'data:text/javascript;base64,' + Buffer.from(source, 'utf8').toString('base64');
  W = await import(/* @vite-ignore */ url);
});

const ENV = { VITE_SUPABASE_URL: 'https://stub.supabase.co', VITE_SUPABASE_ANON_KEY: 'stub-key' };

const TOURNAMENT = {
  title: '第5回 川口・蕨バド交流杯',
  event_date: '2026-09-16',
  start_time: '19:00:00',
  end_time: '21:00:00',
  location: '芝園公民館',
  venue_address: '埼玉県川口市芝園町3-15',
  entry_fee: 2000,
  level: '初級',
  event_type: '混合ダブルス',
  status: 'active',
  description: '<p>4試合以上を保証します。</p><p>シャトルは3球お持ちください。</p>',
};

const ACTIVITY = {
  title: '通常活動（芝園公民館）',
  date: '2026-09-02',
  start_time: '19:00:00',
  end_time: '21:00:00',
  location: '芝園公民館',
  address: '埼玉県川口市芝園町3-15',
  price: 600,
};

const POST = {
  title: '第3回大会レポート',
  excerpt: '第3回大会の結果をお届けします。',
  image_url: 'https://kawabado.com/images/vol3/results-table.png',
  content: '<h2>結果</h2><p>吉田さんが優勝しました。</p><script>alert(1)</script><p>次回は9月です。</p>',
};

/** 中国語版がある記事（2026-08-25）。同じ id・同じURL構造のまま中身だけ入れ替わる */
const POST_ZH = {
  ...POST,
  title_zh: '第3回比赛报告',
  excerpt_zh: '为您送上第3回比赛的结果。',
  content_zh: '<h2>结果</h2><p>吉田 昌弘 夺冠。</p><script>alert(1)</script><p>下次是9月。</p>',
};

/** Supabase REST を差し替える。fetchFirst は global fetch を使うので、ここで足りる */
function stubFetch(rows) {
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () => {
      const u = String(url);
      if (u.includes('/rest/v1/tournaments')) return rows.tournament ? [rows.tournament] : [];
      if (u.includes('/rest/v1/activities')) return rows.activity ? [rows.activity] : [];
      // sitemap は「中国語版がある記事」を別クエリで取る。ここを分けないと
      // 未訳の記事まで /zh/blog に載ってしまう分岐を素通りさせてしまう
      if (u.includes('content_zh=not.is.null')) return rows.zhPosts || [];
      if (u.includes('/rest/v1/blog_posts')) {
        if (rows.posts) return rows.posts;
        return rows.post ? [rows.post] : [];
      }
      return [];
    },
  });
}

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

/** そのURLで実際に配られるHTMLを作る（Workerがやっているのと同じ手順） */
async function renderPath(pathname, rows) {
  stubFetch(rows || {});
  const route = W.matchOgpRoute(pathname);
  if (!route) return null;
  const meta = await W.buildOgpMeta(route, ENV, 'https://kawabado.com' + pathname);
  if (!meta) return null;
  return W.injectOgp(meta);
}

/**
 * プリレンダ本文の可視テキスト（タグを落とした文字数を測るため）。
 *
 * 2026-09-01: 最初の </div> で切っていたが、本文の中に <div> が入った時点で
 * 冒頭だけしか取れなくなった（読み込み中の帯・日時の表・案内の枠）。
 * ブロックは必ず <div id="root"> の直前で終わるので、そこまでを本文として取る。
 * 取り出し方を直しただけで、各テストが確かめている内容は変えていない。
 */
function prerenderText(html) {
  const m = /<div id="kb-prerender"[^>]*>([\s\S]*?)<\/div>\s*<div id="root">/.exec(html);
  if (!m) return '';
  return m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function jsonLds(html) {
  return [...html.matchAll(/<script type="application\/ld\+json" data-kb-prerender>([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
}

const types = (html) => jsonLds(html).map((o) => JSON.stringify(o['@type']));
const count = (html, needle) => html.split(needle).length - 1;
const canonicalOf = (html) => (/<link rel="canonical" href="([^"]+)"/.exec(html) || [])[1] || null;
const hreflangs = (html) =>
  [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]);

describe('前提: 素のHTMLは今まで本文0文字だった', () => {
  it('index.html 自体には h1 も本文も無い（＝直す対象が実在する）', () => {
    expect(INDEX_HTML).not.toContain('<h1');
    expect(INDEX_HTML).toContain('<div id="root"></div>');
  });

  it('プリレンダ本文は #root の外に置く（main.tsx は createRoot なので中に置くと捨てられる）', async () => {
    const html = await renderPath('/ja/');
    const pre = html.indexOf('<div id="kb-prerender"');
    const root = html.indexOf('<div id="root">');
    expect(pre).toBeGreaterThan(0);
    expect(pre).toBeLessThan(root);
    // #root は空のまま（Reactが描く場所には触らない）
    expect(html).toContain('<div id="root"></div>');
  });

  it('hidden / display:none で隠さない（クローラー専用の隠しテキストにしない）', async () => {
    const html = await renderPath('/ja/');
    const block = /<div id="kb-prerender"([^>]*)>/.exec(html)[1];
    expect(block).not.toContain('hidden');
    expect(block).not.toContain('display:none');
  });

  it('Reactの初回描画で消す掃除スクリプトが1つだけ入る', async () => {
    const html = await renderPath('/ja/');
    expect(count(html, 'kb-prerender')).toBeGreaterThan(1);
    expect(count(html, 'MutationObserver')).toBe(1);
  });

  it('掃除スクリプトは #root より後ろにある（前だと getElementById("root") が null になる）', async () => {
    // 最初に書いたときここを間違えて、本文が永久に消えないHTMLを出していた
    const html = await renderPath('/ja/');
    expect(html.indexOf('MutationObserver')).toBeGreaterThan(html.indexOf('<div id="root">'));
  });
});

describe('トップページ（/ja/ ・ /zh/）', () => {
  it('ja: h1が1つ・可視テキストが200文字以上入る', async () => {
    const html = await renderPath('/ja/');
    expect(count(html, '<h1>')).toBe(1);
    expect(html).toContain('<h1>仕事終わりに、4試合以上。</h1>');
    expect(prerenderText(html).length).toBeGreaterThan(200);
  });

  it('zh: 中国語の本文が出て <html lang> と og:locale が中国語になる', async () => {
    const html = await renderPath('/zh/');
    expect(html).toContain('<html lang="zh">');
    expect(html).toContain('zh_CN');
    expect(html).toContain('<h1>下班后，4场以上！</h1>');
    expect(prerenderText(html).length).toBeGreaterThan(150);
  });

  it('ja と zh で本文が違う（訳し忘れの検出）', async () => {
    const ja = prerenderText(await renderPath('/ja/'));
    const zh = prerenderText(await renderPath('/zh/'));
    expect(ja).not.toBe(zh);
  });

  it('Organization / SportsOrganization / SportsClub と WebSite の JSON-LD が出る', async () => {
    const html = await renderPath('/ja/');
    const ld = jsonLds(html);
    expect(ld.length).toBe(2);
    expect(ld[0]['@type']).toEqual(['Organization', 'SportsOrganization', 'SportsClub']);
    expect(ld[0]['@id']).toBe('https://kawabado.com/#organization');
    expect(ld[1]['@type']).toBe('WebSite');
  });

  it('SportsClub（LocalBusiness系）として会場と対象地域を持つ（2026-08-28）', async () => {
    // 実体を1ノードで表す。別に LocalBusiness を立てると同じ実体が2つになる
    const org = jsonLds(await renderPath('/ja/'))[0];
    expect(org['@type']).toContain('SportsClub');
    expect(org.location.map((l) => l.name)).toEqual(['芝園公民館', '蕨市民体育館']);
    expect(org.location[0].address.streetAddress).toBe('芝園町3-15');
    expect(org.location[0].address.addressLocality).toBe('川口市');
    expect(org.location[1].address.addressLocality).toBe('蕨市');
    expect(org.areaServed.map((a) => a.name)).toEqual(['川口市', '蕨市', '戸田市']);
  });

  it('団体そのものの住所は名乗らない（特商法ページと矛盾させない）', async () => {
    // src/lib/legal/kawabadoLegalFacts.ts は address: 'on_request'。
    // 構造化データだけが具体的な所在地を名乗ると、法務ページの記載と食い違う
    const org = jsonLds(await renderPath('/ja/'))[0];
    expect(org.address, 'Organization に address を書くと特商法ページと矛盾する').toBeUndefined();
    expect(org.telephone).toBeUndefined();
  });

  it('画面（HomePage.tsx）の orgJsonLd と同じ内容を持つ（片方だけ直す事故を防ぐ）', () => {
    const home = readFileSync(join(ROOT, 'src/pages/HomePage.tsx'), 'utf8');
    expect(home).toContain(`'@type': ['Organization', 'SportsOrganization', 'SportsClub']`);
    expect(home).toContain(`name: '芝園公民館'`);
    expect(home).toContain(`name: '蕨市民体育館'`);
    expect(home).toContain(`name: '戸田市'`);
  });

  it('canonicalとhreflang3本が出る（自己参照）', async () => {
    const html = await renderPath('/zh/');
    expect(canonicalOf(html)).toBe('https://kawabado.com/zh/');
    expect(hreflangs(html).map((h) => h[0])).toEqual(['ja', 'zh', 'x-default']);
  });

  it('サイト内リンクが出る（素のHTMLに <a> が1本も無いとクローラーは巡回できない）', async () => {
    const html = await renderPath('/ja/');
    expect(html).toContain('href="/ja/activity"');
    expect(html).toContain('href="/ja/tournaments/mixed-doubles"');
    expect(count(html, '<a href="/ja/')).toBeGreaterThanOrEqual(10);
  });

  it('ルート（/）は /ja/ を指す canonical を持ち、hreflangは出さない', async () => {
    // 実測で https://kawabado.com/ と /ja/ が両方200・別メタ・canonical無しだった
    const html = await renderPath('/');
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/');
    expect(hreflangs(html)).toEqual([]);
    expect(html).toContain('<h1>仕事終わりに、4試合以上。</h1>');
  });
});

describe('種目別ページ・FAQ（FAQPage）', () => {
  it('/ja/faq に FAQPage と BreadcrumbList が出る', async () => {
    const html = await renderPath('/ja/faq');
    const ld = jsonLds(html);
    expect(types(html)).toContain('"FAQPage"');
    expect(types(html)).toContain('"BreadcrumbList"');
    const faq = ld.find((o) => o['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(3);
    expect(faq.mainEntity[0]['@type']).toBe('Question');
    expect(faq.mainEntity[0].acceptedAnswer.text.length).toBeGreaterThan(5);
  });

  it('FAQの質問と答えが本文にも出る（JSON-LDだけで人に見えないのは避ける）', async () => {
    const html = await renderPath('/ja/faq');
    const text = prerenderText(html);
    expect(text).toContain('初めてでも参加できますか？');
    expect(text).toContain('超初級・初級クラスは初心者の方を対象');
  });

  it('/zh/tournaments/mixed-doubles が中国語の本文・自己参照canonicalになる', async () => {
    const html = await renderPath('/zh/tournaments/mixed-doubles');
    expect(canonicalOf(html)).toBe('https://kawabado.com/zh/tournaments/mixed-doubles');
    expect(hreflangs(html).length).toBe(3);
    expect(html).toContain('<h1>混合双打比赛（川口・蕨）</h1>');
    expect(prerenderText(html)).toContain('2,000日元');
  });
});

// 地域ページ（2026-08-28 新設）。
// Search Console 実測で「芝園公民館」（会場名）は73表示あるのに「川口市 バドミントン」は18位。
// 会場名では見つかっていて地域名＋競技名では受け皿が無い、という穴を埋める2枚。
describe('地域ページ（/kawaguchi ・ /toda）', () => {
  it('/ja/kawaguchi: 川口市とサークルが本文とtitleに入る', async () => {
    const html = await renderPath('/ja/kawaguchi');
    expect(html, '/ja/kawaguchi が差し込み対象になっていない').not.toBe(null);
    expect(html).toContain('<h1>川口市でバドミントンサークルを探している方へ</h1>');
    const title = /<title>([^<]*)<\/title>/.exec(html)[1];
    expect(title, 'titleに「川口市」が無い').toContain('川口市');
    expect(title, 'titleに「バドミントンサークル」が無い').toContain('バドミントンサークル');
    const text = prerenderText(html);
    expect(text).toContain('埼玉県川口市芝園町3-15');
    expect(text).toContain('600円');
    expect(text.length).toBeGreaterThan(400);
  });

  it('/ja/kawaguchi: FAQPage と BreadcrumbList が出る', async () => {
    const html = await renderPath('/ja/kawaguchi');
    expect(types(html)).toContain('"FAQPage"');
    expect(types(html)).toContain('"BreadcrumbList"');
    const faq = jsonLds(html).find((o) => o['@type'] === 'FAQPage');
    expect(faq.mainEntity.length).toBeGreaterThanOrEqual(5);
  });

  it('/ja/toda: 戸田とバドミントンがtitle・h1に入る', async () => {
    const html = await renderPath('/ja/toda');
    expect(html, '/ja/toda が差し込み対象になっていない').not.toBe(null);
    const title = /<title>([^<]*)<\/title>/.exec(html)[1];
    expect(title).toContain('戸田');
    expect(title).toContain('バドミントン');
    const h1 = /<h1>([^<]*)<\/h1>/.exec(html)[1];
    expect(h1).toContain('戸田');
    expect(h1).toContain('バドミントン');
  });

  it('/ja/toda: 出典のある事実だけを書く（電車の経路は断定しない）', async () => {
    // 2026-08-29: 「埼京線→赤羽で乗り換え→蕨駅」という経路を書いていたが、
    // サイト内に出典が無く、ダイヤ改正で古くなっても誰も気づけないので撤回した。
    // ここは「戻してしまわないこと」を見張るテスト。
    const text = prerenderText(await renderPath('/ja/toda'));
    // 出典のある事実（VenueGuidePage.tsx の実測値）は残す
    expect(text).toContain('徒歩約10分');
    expect(text).toContain('徒歩約14分');
    // 経路の断定はしない。案内は外部サービスへ委ねる
    expect(text, '乗り換え駅を断定している').not.toContain('赤羽');
    expect(text, '路線名を断定している').not.toContain('埼京線');
    expect(text).toContain('乗換案内');
    // 出典の無い所要時間も書かない
    expect(text).not.toMatch(/電車で\s*\d+\s*分/);
  });

  it('両ページとも自己参照canonicalとhreflang3本が出る（ja/zhの両方）', async () => {
    for (const page of ['kawaguchi', 'toda']) {
      for (const lang of ['ja', 'zh']) {
        const html = await renderPath(`/${lang}/${page}`);
        expect(canonicalOf(html), `${lang}/${page}`).toBe(`https://kawabado.com/${lang}/${page}`);
        expect(hreflangs(html), `${lang}/${page}`).toEqual([
          ['ja', `https://kawabado.com/ja/${page}`],
          ['zh', `https://kawabado.com/zh/${page}`],
          ['x-default', `https://kawabado.com/ja/${page}`],
        ]);
      }
    }
  });

  it('中国語版は中国語の本文になる（日本語のまま配らない）', async () => {
    for (const page of ['kawaguchi', 'toda']) {
      const html = await renderPath(`/zh/${page}`);
      expect(html).toContain('<html lang="zh">');
      const ja = prerenderText(await renderPath(`/ja/${page}`));
      expect(prerenderText(html)).not.toBe(ja);
    }
  });

  it('sitemapに ja/zh 両方が載る', async () => {
    stubFetch({});
    const xml = await W.generateSitemap(ENV);
    for (const loc of [
      'https://kawabado.com/ja/kawaguchi', 'https://kawabado.com/zh/kawaguchi',
      'https://kawabado.com/ja/toda', 'https://kawabado.com/zh/toda',
    ]) {
      expect(xml, `${loc} がsitemapに無い`).toContain('<loc>' + loc + '</loc>');
    }
  });

  it('言語プレフィックス無しの /kawaguchi ・ /toda は 301 する', async () => {
    stubFetch({});
    for (const [from, to] of [['/kawaguchi', '/ja/kawaguchi'], ['/toda', '/ja/toda']]) {
      const res = await W.default.fetch(new Request('https://kawabado.com' + from), ENV);
      expect(res.status, from).toBe(301);
      expect(res.headers.get('Location'), from).toBe('https://kawabado.com' + to);
    }
  });

  it('/ja/kawaguchi: 入会制サークルではないことを本文で明示する', async () => {
    // 検索語として「サークル」を受けている以上、入会制だと誤解させない責任がある。
    // JSON-LD やページ下部ではなく、**本文の上のほう**に出ていること
    const text = prerenderText(await renderPath('/ja/kawaguchi'));
    expect(text).toContain('入会制');
    expect(text).toContain('会員登録');
    const title = /<title>([^<]*)<\/title>/.exec(await renderPath('/ja/kawaguchi'))[1];
    expect(title).toContain('サークル');       // 検索語は受ける
    const desc = /<meta name="description" content="([^"]*)"/.exec(await renderPath('/ja/kawaguchi'))[1];
    expect(desc, 'SERPで見える位置に実態が書いていない').toContain('入会制ではなく');
  });

  it('素のHTMLのサイト内リンク（NAV）に両ページが入る（孤立した1枚にしない）', async () => {
    // sitemapに載せるだけではクローラーの巡回経路にならない。
    // NAVから漏れると、JSを実行しないクローラーにとって存在しないページになる
    const html = await renderPath('/ja/');
    expect(html).toContain('href="/ja/kawaguchi"');
    expect(html).toContain('href="/ja/toda"');
    const zh = await renderPath('/zh/');
    expect(zh).toContain('href="/zh/kawaguchi"');
    expect(zh).toContain('href="/zh/toda"');
  });
});

describe('会場ガイド（SportsActivityLocation）', () => {
  it('会場2件ぶんの構造化データと住所が出る', async () => {
    const html = await renderPath('/ja/venues');
    const places = jsonLds(html).filter((o) => o['@type'] === 'SportsActivityLocation');
    expect(places.length).toBe(2);
    expect(places.map((p) => p.name)).toEqual(['芝園公民館', '蕨市民体育館']);
    expect(places[0].address.streetAddress).toBe('芝園町3-15');
    expect(prerenderText(html)).toContain('埼玉県川口市芝園町3-15');
  });
});

describe('大会詳細（DB由来）', () => {
  it('zh: canonical が自己参照になる（以前は言語に関係なく常に /ja/ を指していた）', async () => {
    const html = await renderPath('/zh/tournaments/42', { tournament: TOURNAMENT });
    expect(canonicalOf(html)).toBe('https://kawabado.com/zh/tournaments/42');
    expect(hreflangs(html)).toEqual([
      ['ja', 'https://kawabado.com/ja/tournaments/42'],
      ['zh', 'https://kawabado.com/zh/tournaments/42'],
      ['x-default', 'https://kawabado.com/ja/tournaments/42'],
    ]);
    expect(html).toContain('<html lang="zh">');
  });

  it('ja: 日付・会場・参加費が本文に入り、SportsEvent が出る', async () => {
    const html = await renderPath('/ja/tournaments/42', { tournament: TOURNAMENT });
    const text = prerenderText(html);
    expect(text).toContain('2026年9月16日(水)');
    expect(text).toContain('芝園公民館');
    expect(text).toContain('¥2,000');
    expect(text).toContain('混合ダブルス');
    // 大会説明（管理画面のHTML）もプレーンテキストで入る
    expect(text).toContain('4試合以上を保証します。');
    const ev = jsonLds(html).find((o) => o['@type'] === 'SportsEvent');
    expect(ev.startDate).toBe('2026-09-16T19:00:00+09:00');
    expect(ev.location.address.streetAddress).toBe('埼玉県川口市芝園町3-15');
    expect(ev.offers.price).toBe(2000);
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/tournaments/42');
  });

  it('中止の大会は EventCancelled / SoldOut で出す', async () => {
    const html = await renderPath('/ja/tournaments/42', {
      tournament: { ...TOURNAMENT, status: 'cancelled' },
    });
    const ev = jsonLds(html).find((o) => o['@type'] === 'SportsEvent');
    expect(ev.eventStatus).toBe('https://schema.org/EventCancelled');
    expect(ev.offers.availability).toBe('https://schema.org/SoldOut');
  });

  it('DBに無い大会は差し込まない（＝Workerが noindex を付ける経路に落ちる）', async () => {
    expect(await renderPath('/ja/tournaments/999999', {})).toBe(null);
  });
});

describe('通常活動の詳細（今まで差し込み対象から抜けていた）', () => {
  it('UUIDのIDでもルートに一致する', () => {
    const r = W.matchOgpRoute('/zh/activity/3f0c1a2b-1111-4222-8333-444455556666');
    expect(r).toEqual({
      kind: 'activity', lang: 'zh', id: '3f0c1a2b-1111-4222-8333-444455556666',
    });
  });

  it('本文・SportsEvent・自己参照canonical・hreflangが出る', async () => {
    const html = await renderPath('/ja/activity/abc-123', { activity: ACTIVITY });
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/activity/abc-123');
    expect(hreflangs(html).length).toBe(3);
    const text = prerenderText(html);
    expect(text).toContain('通常活動（芝園公民館）');
    expect(text).toContain('600円（シャトル代込み）');
    const ev = jsonLds(html).find((o) => o['@type'] === 'SportsEvent');
    expect(ev.startDate).toBe('2026-09-02T19:00:00+09:00');
    expect(ev.offers.price).toBe(600);
  });
});

describe('ブログ記事（本文そのものを素のHTMLに出す）', () => {
  it('記事本文がプレーンテキストで入り、<script> は落ちる', async () => {
    const html = await renderPath('/ja/blog/7', { post: POST });
    const text = prerenderText(html);
    expect(text).toContain('吉田さんが優勝しました。');
    expect(text).toContain('次回は9月です。');
    expect(text).not.toContain('alert(1)');
  });

  it('中国語版が無い記事: 中国語URLは日本語版へcanonicalを寄せ、hreflangは出さない', async () => {
    const html = await renderPath('/zh/blog/7', { post: POST });
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/blog/7');
    expect(hreflangs(html)).toEqual([]);
    // 中身が日本語なので <html lang="zh"> とは名乗らない
    expect(html).toContain('<html lang="ja">');
  });

  it('中国語版がある記事: /zh は中国語本文＋自己参照canonical＋hreflang', async () => {
    const html = await renderPath('/zh/blog/7', { post: POST_ZH });
    expect(canonicalOf(html)).toBe('https://kawabado.com/zh/blog/7');
    expect(hreflangs(html)).toEqual([
      ['ja', 'https://kawabado.com/ja/blog/7'],
      ['zh', 'https://kawabado.com/zh/blog/7'],
      ['x-default', 'https://kawabado.com/ja/blog/7'],
    ]);
    expect(html).toContain('<html lang="zh">');
    const text = prerenderText(html);
    expect(text).toContain('第3回比赛报告');
    expect(text).toContain('吉田 昌弘 夺冠。');
    // 日本語本文が混ざらない（差し替えであって併記ではない）
    expect(text).not.toContain('吉田さんが優勝しました。');
    expect(text).not.toContain('alert(1)');
  });

  it('中国語版がある記事: /ja 側も自己参照canonicalのまま hreflang を出す（相互に結ぶ）', async () => {
    const html = await renderPath('/ja/blog/7', { post: POST_ZH });
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/blog/7');
    expect(hreflangs(html).length).toBe(3);
    expect(html).toContain('<html lang="ja">');
    expect(prerenderText(html)).toContain('吉田さんが優勝しました。');
  });

  it('中国語版があっても本文が空文字なら未翻訳あつかい（NULLと同じ）', async () => {
    const html = await renderPath('/zh/blog/7', { post: { ...POST_ZH, content_zh: '   ' } });
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/blog/7');
    expect(hreflangs(html)).toEqual([]);
  });

  // 限定公開（unlisted）は sitemap に載らないだけで、素のHTMLには noindex が
  // 何も入っていなかった。URLが漏れた瞬間に普通にインデックスされる状態だった
  it('限定公開・下書きは素のHTMLに noindex,nofollow が入り、hreflangとBlogPostingを出さない', async () => {
    for (const status of ['unlisted', 'draft']) {
      const html = await renderPath('/ja/blog/7', { post: { ...POST_ZH, status } });
      expect(html).toContain('<meta name="robots" content="noindex,nofollow" />');
      expect(hreflangs(html)).toEqual([]);
      expect(jsonLds(html).some((o) => o['@type'] === 'BlogPosting')).toBe(false);
      // 本文とcanonicalは今までどおり出す（リンクを知っている人には見せる）
      expect(canonicalOf(html)).toBe('https://kawabado.com/ja/blog/7');
      expect(prerenderText(html)).toContain('吉田さんが優勝しました。');
    }
  });

  it('公開記事には noindex を出さない', async () => {
    const html = await renderPath('/ja/blog/7', { post: { ...POST_ZH, status: 'published' } });
    expect(html).not.toContain('noindex');
    expect(hreflangs(html).length).toBe(3);
    expect(jsonLds(html).some((o) => o['@type'] === 'BlogPosting')).toBe(true);
  });

  it('htmlToParagraphs は上限で打ち切る', () => {
    const long = '<p>' + 'あ'.repeat(500) + '</p><p>' + 'い'.repeat(500) + '</p><p>う</p>';
    const out = W.htmlToParagraphs(long, 600);
    expect(out.length).toBe(1);
    expect(out[0].length).toBe(500);
  });
});

describe('sitemap: 中国語版がある記事だけ /zh/blog/:id を送る', () => {
  const sitemapOf = async (rows) => {
    stubFetch(rows);
    return W.generateSitemap(ENV);
  };

  it('訳済みの記事だけ /zh/blog に載り、未訳は /ja だけ', async () => {
    const xml = await sitemapOf({
      posts: [{ id: 9, updated_at: '2026-08-20T00:00:00Z' }, { id: 23, updated_at: null, created_at: '2026-08-01T00:00:00Z' }],
      zhPosts: [{ id: 9, updated_at: '2026-08-20T00:00:00Z' }],
    });
    expect(xml).toContain('<loc>https://kawabado.com/ja/blog/9</loc>');
    expect(xml).toContain('<loc>https://kawabado.com/ja/blog/23</loc>');
    expect(xml).toContain('<loc>https://kawabado.com/zh/blog/9</loc>');
    // 未訳の記事は canonical を /ja へ寄せている。送ると Search Console が
    // 「正規URLとして別のページが選択されています」を毎回出す
    expect(xml).not.toContain('<loc>https://kawabado.com/zh/blog/23</loc>');
  });

  it('中国語版が1本も無くても日本語のsitemapは今までどおり出る', async () => {
    const xml = await sitemapOf({ posts: [{ id: 23, created_at: '2026-08-01T00:00:00Z' }], zhPosts: [] });
    expect(xml).toContain('<loc>https://kawabado.com/ja/blog/23</loc>');
    expect(xml).not.toContain('/zh/blog/');
    // 一覧は日本語版だけ（記事ごとの中国語版とは別の判断）
    expect(xml).toContain('<loc>https://kawabado.com/ja/blog</loc>');
    expect(xml).not.toContain('<loc>https://kawabado.com/zh/blog</loc>');
  });

  it('content_zh 列がまだ無い環境（migration適用前）でもsitemapが壊れない', async () => {
    // 列が無いと PostgREST は 400 を返す。そのときは zh を0件にして日本語だけ出す
    globalThis.fetch = async (url) => {
      const u = String(url);
      if (u.includes('content_zh=not.is.null')) return { ok: false, status: 400, json: async () => ({}) };
      if (u.includes('/rest/v1/blog_posts')) return { ok: true, json: async () => [{ id: 23, created_at: '2026-08-01T00:00:00Z' }] };
      return { ok: true, json: async () => [] };
    };
    const xml = await W.generateSitemap(ENV);
    expect(xml).toContain('<loc>https://kawabado.com/ja/blog/23</loc>');
    expect(xml).not.toContain('/zh/blog/');
  });
});

describe('canonical / hreflang の穴を塞ぐ', () => {
  it('/{lang}/results/vol1..3 にcanonicalとhreflangが出る（正規表現が数字を拾えず素通りしていた）', async () => {
    for (const vol of ['vol1', 'vol2', 'vol3']) {
      const html = await renderPath('/zh/results/' + vol);
      expect(html, vol + ' が差し込み対象になっていない').not.toBe(null);
      expect(canonicalOf(html)).toBe('https://kawabado.com/zh/results/' + vol);
      expect(hreflangs(html).length).toBe(3);
      expect(count(html, '<h1>')).toBe(1);
    }
  });

  it('/{lang}/join にhreflangが出る（canonicalだけだった）', async () => {
    const html = await renderPath('/ja/join');
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/join');
    expect(hreflangs(html).length).toBe(3);
  });

  it('AIコースLPにhreflangが出る（実測で0個だった）', async () => {
    const html = await renderPath('/zh/ai-course');
    expect(canonicalOf(html)).toBe('https://kawabado.com/zh/ai-course');
    expect(hreflangs(html)).toEqual([
      ['ja', 'https://kawabado.com/ja/ai-course'],
      ['zh', 'https://kawabado.com/zh/ai-course'],
      ['x-default', 'https://kawabado.com/ja/ai-course'],
    ]);
  });

  it('AIコースLPには JSON-LD を入れない（Course schema はLP側の担当）', async () => {
    for (const p of ['/ja/ai-course', '/zh/ai-course', '/ja/ai-course/shoko']) {
      const html = await renderPath(p);
      expect(jsonLds(html), p + ' に素のHTML側のJSON-LDが入っている').toEqual([]);
    }
  });

  it('広告用variant LPはhreflangを出さない（canonicalを主ページへ寄せているため）', async () => {
    const html = await renderPath('/ja/ai-course/yuto');
    expect(canonicalOf(html)).toBe('https://kawabado.com/ja/ai-course');
    expect(hreflangs(html)).toEqual([]);
  });

  it('/{lang}/shuttle-roadmap にcanonicalとhreflangが出る（Helmetが1つも無かった）', async () => {
    // 日中どちらの本文も持つ公開ページなのに title は index.html のフォールバックのままで、
    // /ja/ と /zh/ が「同じタイトルの別URL」として2本出ていた
    const html = await renderPath('/zh/shuttle-roadmap');
    expect(html, 'shuttle-roadmap が差し込み対象になっていない').not.toBe(null);
    expect(canonicalOf(html)).toBe('https://kawabado.com/zh/shuttle-roadmap');
    expect(hreflangs(html).length).toBe(3);
    expect(html).toContain('<html lang="zh">');
  });

  it('法務3ページ（今回追加）にh1・canonical・hreflangが出る', async () => {
    for (const page of ['tokushoho', 'privacy', 'terms']) {
      const html = await renderPath('/ja/' + page);
      expect(html, page + ' が差し込み対象になっていない').not.toBe(null);
      expect(canonicalOf(html)).toBe('https://kawabado.com/ja/' + page);
      expect(hreflangs(html).length).toBe(3);
      expect(count(html, '<h1>')).toBe(1);
    }
  });
});

// 規約「自己参照でない canonical と hreflang を併用しない」を、
// **全静的ページの生成物**で確認する（1ページずつ書いたテストは必ず取りこぼす）。
describe('canonical と hreflang が矛盾しない（全静的ページ）', () => {
  it('hreflang を出すページの canonical は必ず自己参照', async () => {
    const bad = [];
    for (const page of Object.keys(W.STATIC_SEO)) {
      for (const lang of ['ja', 'zh']) {
        const path = '/' + lang + (page ? '/' + page : '/');
        const html = await renderPath(path);
        if (!html) { bad.push(path + ': 差し込み対象になっていない'); continue; }
        const hl = hreflangs(html);
        const canon = canonicalOf(html);
        if (hl.length === 0) {
          // hreflang を出さないページは canonical が /ja/ を指していてよい（ja-only）
          if (!canon) bad.push(path + ': canonical が無い');
          continue;
        }
        const selfCanonical = 'https://kawabado.com' + path;
        if (hl.length !== 3) bad.push(path + ': hreflang が ' + hl.length + '本');
        if (canon !== selfCanonical) {
          bad.push(path + ': hreflang を出しているのに canonical が自己参照でない（' + canon + '）');
        }
      }
    }
    expect(bad, bad.join(' / ')).toEqual([]);
  });

  it('ja側とzh側が互いを正しく指し合う', async () => {
    for (const page of ['kawaguchi', 'toda', 'venues', 'faq', 'international']) {
      const ja = hreflangs(await renderPath('/ja/' + page));
      const zh = hreflangs(await renderPath('/zh/' + page));
      expect(ja, page).toEqual(zh);  // 相互リンクなので両者は同一の3本になる
      expect(ja.map((h) => h[0]), page).toEqual(['ja', 'zh', 'x-default']);
    }
  });
});

describe('二重注入が起きない', () => {
  it('プリレンダ本文・掃除スクリプト・#root がそれぞれ1つ', async () => {
    const html = await renderPath('/ja/tournaments/42', { tournament: TOURNAMENT });
    expect(count(html, 'id="kb-prerender"')).toBe(1);
    expect(count(html, '<div id="root">')).toBe(1);
    expect(count(html, 'MutationObserver')).toBe(1);
    expect(count(html, '<link rel="canonical"')).toBe(1);
    expect(count(html, 'hreflang="x-default"')).toBe(1);
  });

  it('JSON-LDのscript数と中身の数が一致し、すべて有効なJSON', async () => {
    for (const [path, rows] of [['/ja/', {}], ['/ja/faq', {}], ['/ja/venues', {}],
      ['/ja/tournaments/42', { tournament: TOURNAMENT }]]) {
      const html = await renderPath(path, rows);
      const tags = count(html, 'application/ld+json');
      expect(jsonLds(html).length).toBe(tags);
      for (const o of jsonLds(html)) expect(o['@context']).toBe('https://schema.org');
    }
  });

  it('JSON-LDに生の < を出さない（</script> でHTMLが壊れる事故を防ぐ）', async () => {
    const html = await renderPath('/ja/blog/7', {
      post: { ...POST, title: '<script>bad</script>タイトル' },
    });
    const raw = /data-kb-prerender>([\s\S]*?)<\/script>/.exec(html)[1];
    expect(raw).not.toContain('<');
    expect(JSON.parse(raw).itemListElement[1].name).toContain('<script>bad</script>');
  });

  it('掃除スクリプトは head の JSON-LD も一緒に消す（React側と二重にならない）', async () => {
    const html = await renderPath('/ja/');
    expect(html).toContain('querySelectorAll("script[data-kb-prerender]")');
  });
});

describe('ソフト404: 既知ルートに一致しないURLはnoindexにする', () => {
  it('存在しないパスは既知でない', () => {
    expect(W.isKnownPath('/ja/this-does-not-exist-99999')).toBe(false);
    expect(W.isKnownPath('/zh/foo/bar/baz')).toBe(false);
    expect(W.isKnownPath('/totally-made-up')).toBe(false);
  });

  it('src/App.tsx にある全ルートは既知として扱われる（消し忘れ・付け忘れの検出）', () => {
    const app = readFileSync(join(ROOT, 'src/App.tsx'), 'utf8');
    const routes = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((p) => !p.includes('*'));
    expect(routes.length).toBeGreaterThan(40);
    const concrete = routes.map((p) => {
      const withSlash = p.startsWith('/') ? p : '/' + p;
      return withSlash
        .replace(/:lang/g, 'ja')
        .replace(/:id/g, '1')
        .replace(/:[A-Za-z]+/g, 'x');
    });
    const unknown = concrete.filter((p) => !W.isKnownPath(p));
    expect(unknown, 'App.tsx にあるのにWorkerが既知として扱っていない: ' + unknown.join(', ')).toEqual([]);
  });

  // ここは Worker の fetch をそのまま叩く（ヘッダーまで含めて本番と同じ経路を通す）
  const get = async (url, rows) => {
    stubFetch(rows || {});
    return W.default.fetch(new Request(url), ENV);
  };

  it('存在しないURLは200のまま noindex ヘッダーが付く', async () => {
    const res = await get('https://kawabado.com/ja/this-does-not-exist-99999');
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe('noindex');
  });

  it('実在するページには noindex を付けない', async () => {
    for (const p of ['/ja/', '/zh/', '/ja/faq', '/ja/venues', '/zh/tournaments/singles',
      '/ja/results/vol2', '/ja/tokushoho', '/ja/shuttle-roadmap', '/ja/game',
      '/ja/kawaguchi', '/zh/kawaguchi', '/ja/toda', '/zh/toda']) {
      const res = await get('https://kawabado.com' + p);
      expect(res.headers.get('X-Robots-Tag'), p + ' に noindex が付いている').toBe(null);
    }
  });

  it('DBに無い大会・活動・記事のURLも noindex になる（削除済みURLが残り続けるのを止める）', async () => {
    for (const p of ['/ja/tournaments/999999', '/ja/activity/does-not-exist', '/ja/blog/999999']) {
      const res = await get('https://kawabado.com' + p, {});
      expect(res.headers.get('X-Robots-Tag'), p).toBe('noindex');
    }
  });

  it('取得に失敗したときは noindex を付けない（DBの一時障害で消えないように）', async () => {
    globalThis.fetch = async () => { throw new Error('supabase down'); };
    const res = await W.default.fetch(new Request('https://kawabado.com/ja/tournaments/42'), ENV);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Robots-Tag')).toBe(null);
  });

  it('管理画面・staging は今までどおり noindex, nofollow', async () => {
    const priv = await get('https://kawabado.com/ja/login');
    expect(priv.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    const staging = await get('https://staging.badminton-platform.pages.dev/ja/');
    expect(staging.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
  });

  it('本番のトップは本文入りのHTMLが返る（Workerのfetch経由で確認）', async () => {
    const res = await get('https://kawabado.com/ja/');
    const body = await res.text();
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(body).toContain('id="kb-prerender"');
    expect(body).toContain('<h1>仕事終わりに、4試合以上。</h1>');
    // 実測の 1,692B から増えていること（本文が入った証拠）
    expect(body.length).toBeGreaterThan(3000);
  });
});

// 言語プレフィックスなしの旧URLの 301（統合 2026-08-28 で feat/tournament-gallery-trust から復帰）。
//
// public/_redirects に同じ表があるが、_worker.js がある Pages では拡張子なしのページURLを
// Worker が先に200で返すため発動しない。ここは **Workerのfetchをそのまま叩いて** 実際の
// ステータスとLocationを見る（「ソースに文字列がある」では生成物が壊れていても通ってしまう）。
describe('旧URL → 正規URL の 301', () => {
  const get = async (url, init) => {
    stubFetch({});
    return W.default.fetch(new Request(url, init), ENV);
  };

  it('App.tsx に素のルートが無いページは 301 する（LangWrapper でトップへ流れていた分）', async () => {
    const cases = {
      '/venues': '/ja/venues',
      '/join': '/ja/join',
      '/privacy': '/ja/privacy',
      '/tokushoho': '/ja/tokushoho',
      '/terms': '/ja/terms',
      '/international': '/ja/international',
      '/game': '/ja/game',
      '/tactics-board': '/ja/tactics-board',
      '/shuttle-roadmap': '/ja/shuttle-roadmap',
      '/results/vol1': '/ja/results/vol1',
    };
    for (const [from, to] of Object.entries(cases)) {
      const res = await get('https://kawabado.com' + from);
      expect(res.status, from).toBe(301);
      expect(res.headers.get('Location'), from).toBe('https://kawabado.com' + to);
    }
  });

  it('外部被リンクの素のURL（minton.jp → /blog/12）も 301 する', async () => {
    const cases = {
      '/blog/12': '/ja/blog/12',
      '/blog': '/ja/blog',
      '/faq': '/ja/faq',
      '/tournaments/42': '/ja/tournaments/42',
      '/activity/abc': '/ja/activity/abc',
      '/activity-cn': '/zh/activity',
      '/chaoxianzu/activity-kr': '/chaoxianzu/ko/activity',
    };
    for (const [from, to] of Object.entries(cases)) {
      const res = await get('https://kawabado.com' + from);
      expect(res.status, from).toBe(301);
      expect(res.headers.get('Location'), from).toBe('https://kawabado.com' + to);
    }
  });

  it('クエリは保持する（UTM付きの広告リンクを落とさない）', async () => {
    const res = await get('https://kawabado.com/faq?utm_source=x&utm_medium=cpc');
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe('https://kawabado.com/ja/faq?utm_source=x&utm_medium=cpc');
  });

  it('POST は 301 しない（処理リクエストを壊さない）', async () => {
    const res = await get('https://kawabado.com/faq', { method: 'POST' });
    expect(res.status).not.toBe(301);
  });

  it('遷移先の正規URLは 301 しない（リダイレクトループを作らない）', async () => {
    for (const p of ['/ja/faq', '/ja/venues', '/zh/activity', '/ja/blog/12', '/cancel']) {
      const res = await get('https://kawabado.com' + p);
      expect(res.status, p).not.toBe(301);
    }
  });

  it('ルート（/）は 301 しない（200＋/ja/ を指す canonical という HEAD の判断を残す）', async () => {
    const res = await get('https://kawabado.com/');
    expect(res.status).toBe(200);
  });
});

// 「Reactが描いたら消える」は理屈では正しくても、実物で確かめないと意味がない。
// jsdom に本物のHTMLを食わせてスクリプトを走らせ、消えるところまで見る。
describe('実際のDOMでの挙動（jsdomでスクリプトを走らせる）', () => {
  it('パース直後は本文が見えていて、Reactが#rootに描いた瞬間に消える', async () => {
    const { JSDOM } = await import('jsdom');
    const html = await renderPath('/ja/');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    const doc = dom.window.document;

    // JSは走ったが React はまだ描いていない → 本文は残っている（真っ白にしない）
    expect(doc.getElementById('kb-prerender')).not.toBe(null);
    expect(doc.querySelectorAll('script[data-kb-prerender]').length).toBe(2);
    expect(doc.querySelectorAll('h1').length).toBe(1);

    // React の初回コミットを模す
    const root = doc.getElementById('root');
    root.appendChild(doc.createElement('main'));
    await new Promise((r) => setTimeout(r, 0));

    // 本文もJSON-LDも消えている（React側の Helmet と二重にならない）
    expect(doc.getElementById('kb-prerender')).toBe(null);
    expect(doc.querySelectorAll('script[data-kb-prerender]').length).toBe(0);
    expect(doc.querySelectorAll('h1').length).toBe(0);
    dom.window.close();
  });

  it('Reactが動かなければ本文は残り続ける（タイムアウトで消さない）', async () => {
    const { JSDOM } = await import('jsdom');
    const html = await renderPath('/ja/faq');
    const dom = new JSDOM(html, { runScripts: 'dangerously' });
    await new Promise((r) => setTimeout(r, 30));
    expect(dom.window.document.getElementById('kb-prerender')).not.toBe(null);
    dom.window.close();
  });
});

describe('プリレンダ本文の網羅性', () => {
  it('静的ページ全部に ja/zh の本文がある', () => {
    const missing = Object.entries(W.STATIC_SEO)
      .filter(([, v]) => !v.body || !v.body.ja || !v.body.ja.h1 || !v.body.zh || !v.body.zh.h1)
      .map(([k]) => k || '(トップ)');
    expect(missing, '本文が無いページ: ' + missing.join(', ')).toEqual([]);
  });

  it('ja と zh の h1・lead が同一文言になっていない', () => {
    const same = Object.entries(W.STATIC_SEO)
      .filter(([, v]) => v.body && (v.body.ja.h1 === v.body.zh.h1 || v.body.ja.lead === v.body.zh.lead))
      .map(([k]) => k || '(トップ)');
    expect(same, '訳し忘れの疑い: ' + same.join(', ')).toEqual([]);
  });

  it('サイト内リンクの行き先はすべて実在するページ', () => {
    const unknown = W.NAV.map((n) => n.path).filter((p) => !(p in W.STATIC_SEO));
    expect(unknown, 'NAVにあるのにSTATIC_SEOに無い: ' + unknown.join(', ')).toEqual([]);
  });
});

describe('画面ソースとの突き合わせ（Workerは import できないので写している）', () => {
  const home = () => readFileSync(join(ROOT, 'src/pages/HomePage.tsx'), 'utf8');

  it('Organization の主要フィールドが HomePage.tsx と同じ', () => {
    const src = home();
    for (const v of [
      W.ORG_JSONLD['@id'], W.ORG_JSONLD.name, W.ORG_JSONLD.email, W.ORG_JSONLD.sport,
      W.ORG_JSONLD.logo.url, W.ORG_JSONLD.image,
    ]) {
      expect(src, 'HomePage.tsx に無い: ' + v).toContain(v);
    }
    expect(src).toContain('川口・蕨羽毛球交流会');
  });

  it('WebSite の @id が HomePage.tsx と同じ', () => {
    expect(home()).toContain(W.WEBSITE_JSONLD['@id']);
  });

  it('会場データが VenueGuidePage.tsx と同じ', () => {
    const src = readFileSync(join(ROOT, 'src/pages/VenueGuidePage.tsx'), 'utf8');
    for (const name of ['芝園公民館', '蕨市民体育館']) expect(src).toContain(name);
    for (const street of ['芝園町3-15', '北町1-27-15']) expect(src).toContain(street);
  });

  it('本文に書いた金額は、その画面のソースに同じ表記で存在する（盛った数字を検出）', () => {
    const failures = [];
    let checked = 0;
    for (const [path, entry] of Object.entries(W.STATIC_SEO)) {
      if (!entry.body) continue;
      const staticSeo = JSON.parse(readFileSync(join(ROOT, 'src/lib/seo/staticSeo.json'), 'utf8')).pages;
      const src = readFileSync(join(ROOT, staticSeo[path].source), 'utf8');
      for (const lang of ['ja', 'zh']) {
        const body = entry.body[lang];
        const text = [body.h1, body.lead || '']
          .concat(body.paragraphs || [])
          .concat((body.facts || []).map((f) => f.label + f.value))
          .concat((body.faq || []).map((q) => q.q + q.a))
          .join(' ');
        for (const money of text.match(/[0-9][0-9,]*(円|日元)/g) || []) {
          checked += 1;
          if (!src.includes(money)) failures.push((path || '(トップ)') + ' [' + lang + '] ' + money);
        }
      }
    }
    // このテストが「1件も見ていない」まま通るのを防ぐ
    expect(checked, '金額表記が1つも見つからない＝テストが空回りしている').toBeGreaterThan(15);
    expect(failures, '画面ソースに無い金額表記: ' + failures.join(', ')).toEqual([]);
  });
});
