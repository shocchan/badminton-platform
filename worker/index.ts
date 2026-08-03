// Cloudflare Pages advanced mode の Worker 本体。
//
// もともと scripts/generate-worker.mjs がテンプレート文字列で組み立てていたものを、
// **実ファイル**へ移した。理由は教材配信エンドポイントを足すため。
// 文字列の中にロジックを書くと型もテストも効かず、教材のような機密を扱えない。
//
// index.html だけは build 後にしか決まらないので、生成モジュールから読み込む。
// ビルド: scripts/generate-worker.mjs が esbuild で dist/_worker.js へ束ねる。

import { INDEX_HTML } from './generated/indexHtml';
import {
  handleSessionIssue, handleActivityStart, handleActivityGrade, handleMockGrade,
  handleGrammarDoc, handleStageContent, handleAudio, handleDevSeed, type RuntimeEnv,
} from './aiCourseRuntime';
import { routeAuth, type AuthEnv } from './aiCourseAuth';

interface Env extends RuntimeEnv, AuthEnv {
  ASSETS: Fetcher;
  VITE_SUPABASE_URL?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  ADMIN_GATE_USER?: string;
  ADMIN_GATE_PASS?: string;
}

// ── sitemap.xml 動的生成 ──

async function generateSitemap(env: Env): Promise<string> {
  const staticUrls = [
    { path: '',              priority: '1.0', freq: 'weekly' },
    { path: 'activity',      priority: '0.9', freq: 'weekly' },
    { path: 'level-guide',   priority: '0.8', freq: 'monthly' },
    { path: 'faq',           priority: '0.8', freq: 'monthly' },
    { path: 'venues',        priority: '0.7', freq: 'monthly' },
    { path: 'contact',       priority: '0.6', freq: 'monthly' },
    { path: 'blog',          priority: '0.7', freq: 'weekly' },
    { path: 'join',          priority: '0.6', freq: 'monthly' },
    { path: 'results/vol1',  priority: '0.6', freq: 'yearly' },
    { path: 'results/vol2',  priority: '0.6', freq: 'yearly' },
    { path: 'results/vol3',  priority: '0.6', freq: 'yearly' },
    { path: 'cancel-policy', priority: '0.5', freq: 'monthly' },
  ];

  const langs = ['ja', 'zh'];
  let urls = '';

  let tournaments: { id: string; updated_at?: string }[] = [];
  let activities: { id: string; date?: string }[] = [];
  try {
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
    const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
    if (supabaseUrl && supabaseKey) {
      const headers = { apikey: supabaseKey, Authorization: 'Bearer ' + supabaseKey };
      const res = await fetch(
        supabaseUrl + '/rest/v1/tournaments?select=id,updated_at&visibility=eq.published',
        { headers },
      );
      if (res.ok) tournaments = await res.json();

      const today = new Date().toISOString().slice(0, 10);
      const actRes = await fetch(
        supabaseUrl + '/rest/v1/activities?select=id,date&status=neq.cancelled&archived_at=is.null&date=gte.' + today,
        { headers },
      );
      if (actRes.ok) activities = await actRes.json();
    }
  } catch { /* 失敗しても静的URLは返す */ }

  for (const lang of langs) {
    for (const u of staticUrls) {
      const loc = u.path === ''
        ? 'https://kawabado.com/' + lang + '/'
        : 'https://kawabado.com/' + lang + '/' + u.path;
      urls += '\n  <url>\n    <loc>' + loc + '</loc>\n    <changefreq>' + u.freq + '</changefreq>\n    <priority>' + u.priority + '</priority>\n  </url>';
    }
    for (const t of tournaments) {
      const lastmod = t.updated_at ? t.updated_at.slice(0, 10) : '';
      urls += '\n  <url>\n    <loc>https://kawabado.com/' + lang + '/tournaments/' + t.id + '</loc>' + (lastmod ? '\n    <lastmod>' + lastmod + '</lastmod>' : '') + '\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>';
    }
    for (const a of activities) {
      urls += '\n  <url>\n    <loc>https://kawabado.com/' + lang + '/activity/' + a.id + '</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>';
    }
  }

  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '\n</urlset>';
}

// ── ページ別OGP（クローラーはJSを実行しないため Worker 側で差し込む） ──

interface OgpRoute { kind: 'tournament' | 'blog'; lang: string; id: string }

function matchOgpRoute(pathname: string): OgpRoute | null {
  let m = pathname.match(/^\/(ja|zh)\/tournaments\/(\d+)\/?$/);
  if (m) return { kind: 'tournament', lang: m[1], id: m[2] };
  m = pathname.match(/^\/tournaments\/(\d+)\/?$/);
  if (m) return { kind: 'tournament', lang: 'ja', id: m[1] };
  m = pathname.match(/^\/(ja|zh)\/blog\/(\d+)\/?$/);
  if (m) return { kind: 'blog', lang: m[1], id: m[2] };
  m = pathname.match(/^\/blog\/(\d+)\/?$/);
  if (m) return { kind: 'blog', lang: 'ja', id: m[1] };
  return null;
}

async function fetchFirst(env: Env, path: string): Promise<Record<string, string> | null> {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';
  if (!supabaseUrl || !key) return null;
  const res = await fetch(supabaseUrl + path, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function escAttr(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface OgpMeta { title: string; description: string; image?: string | null; url: string }

function injectOgp(meta: OgpMeta): string {
  let html = INDEX_HTML
    .replace(/<title>[^<]*<\/title>/, '<title>' + escAttr(meta.title) + '</title>')
    .replace(/(<meta name="description" content=")[^"]*(")/, '$1' + escAttr(meta.description) + '$2')
    .replace(/(<meta property="og:title" content=")[^"]*(")/, '$1' + escAttr(meta.title) + '$2')
    .replace(/(<meta property="og:description" content=")[^"]*(")/, '$1' + escAttr(meta.description) + '$2');
  if (meta.image) {
    html = html
      .replace(/(<meta property="og:image" content=")[^"]*(")/, '$1' + escAttr(meta.image) + '$2')
      .replace(/(<meta name="twitter:image" content=")[^"]*(")/, '$1' + escAttr(meta.image) + '$2');
  }
  return html.replace('</head>', '<meta property="og:url" content="' + escAttr(meta.url) + '" />\n  </head>');
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const WEEKDAYS_ZH = ['日', '一', '二', '三', '四', '五', '六'];

async function buildOgpMeta(route: OgpRoute, env: Env, pageUrl: string): Promise<OgpMeta | null> {
  if (route.kind === 'tournament') {
    const t = await fetchFirst(env,
      '/rest/v1/tournaments?id=eq.' + route.id +
      '&visibility=neq.draft&select=title,event_date,start_time,end_time,location,entry_fee,level,event_type');
    if (!t || !t.event_date) return null;
    const [y, mo, d] = t.event_date.split('-');
    const wdIdx = new Date(t.event_date).getUTCDay();
    const time = (t.start_time || '').slice(0, 5) + '〜' + (t.end_time || '').slice(0, 5);
    const fee = Number(t.entry_fee || 0).toLocaleString('ja-JP');
    if (route.lang === 'zh') {
      return {
        title: t.title + '｜' + Number(mo) + '/' + Number(d) + '(周' + WEEKDAYS_ZH[wdIdx] + ')举办',
        description: '📅' + y + '年' + Number(mo) + '月' + Number(d) + '日(周' + WEEKDAYS_ZH[wdIdx] + ') ' + time +
          '｜📍' + t.location + '｜💰报名费¥' + fee + '｜' + t.level + '·' + t.event_type + '。正在报名中！',
        url: pageUrl,
      };
    }
    return {
      title: t.title + '｜' + Number(mo) + '/' + Number(d) + '(' + WEEKDAYS_JA[wdIdx] + ')開催',
      description: '📅' + y + '年' + Number(mo) + '月' + Number(d) + '日(' + WEEKDAYS_JA[wdIdx] + ') ' + time +
        '｜📍' + t.location + '｜💰参加費¥' + fee + '｜' + t.level + '・' + t.event_type + '。申込受付中！',
      url: pageUrl,
    };
  }
  if (route.kind === 'blog') {
    const p = await fetchFirst(env, '/rest/v1/blog_posts?id=eq.' + route.id + '&select=title,excerpt,image_url');
    if (!p) return null;
    return {
      title: p.title + '｜川口・蕨バドミントン交流会',
      description: p.excerpt || '川口・蕨エリアのバドミントン交流会の活動ブログ',
      image: p.image_url && /^https?:/.test(p.image_url) ? p.image_url : null,
      url: pageUrl,
    };
  }
  return null;
}

// 本番ホスト（これ以外＝staging・Previewデプロイ・localhostは検索エンジンから除外する）
const PRODUCTION_HOSTS = ['kawabado.com', 'www.kawabado.com'];

async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // AIコース教材の限定配信。**assets より先に置く**。
  // 後ろに置くと拡張子判定に吸われてしまう
  if (pathname.startsWith('/api/ai-course/')) {
    // ログイン系（ID＋6文字パスワード）。ID→メールの解決はこの中だけで行う
    const authHandler = routeAuth(pathname);
    if (authHandler) return authHandler(request, env);

    switch (pathname) {
      case '/api/ai-course/session/issue': return handleSessionIssue(request, env);
      case '/api/ai-course/activity/start': return handleActivityStart(request, env);
      case '/api/ai-course/activity/grade': return handleActivityGrade(request, env);
      case '/api/ai-course/activity/mock-grade': return handleMockGrade(request, env);
      case '/api/ai-course/grammar-doc': return handleGrammarDoc(request, env);
      case '/api/ai-course/stage-content': return handleStageContent(request, env);
      case '/api/ai-course/audio': return handleAudio(request, env);
      case '/api/ai-course/dev-seed': return handleDevSeed(request, env);
      default: return new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
  }

  // 管理画面ルートへのBasic認証ゲート
  if (/^\/(ja\/|zh\/)?admin(\/|$)/.test(pathname) && env.ADMIN_GATE_USER && env.ADMIN_GATE_PASS) {
    const auth = request.headers.get('Authorization') || '';
    const expected = 'Basic ' + btoa(env.ADMIN_GATE_USER + ':' + env.ADMIN_GATE_PASS);
    if (auth !== expected) {
      return new Response('Authentication required', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="kawabado admin"', 'Cache-Control': 'no-store' },
      });
    }
  }

  if (pathname === '/sitemap.xml') {
    try {
      const xml = await generateSitemap(env);
      return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    } catch (err) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n<!-- error: ' + (err as Error).message + ' -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        { status: 200, headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
      );
    }
  }

  if (pathname === '/__debug') {
    const results: Record<string, unknown> = {};
    for (const p of ['/favicon.svg']) {
      try {
        const r = await env.ASSETS.fetch(new Request(url.origin + p));
        results[p] = { status: r.status };
      } catch (e) {
        results[p] = { error: (e as Error).message };
      }
    }
    return new Response(JSON.stringify(results, null, 2), { headers: { 'Content-Type': 'application/json' } });
  }

  // 拡張子があるファイルは env.ASSETS で直接配信
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
  if (hasExtension && !pathname.endsWith('.html')) {
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      // _redirects のSPAフォールバックで index.html が 200 で返ることがある。
      // それをアセットとして返すと _headers の immutable で1年キャッシュされる事故になる
      const ct = assetResponse.headers.get('Content-Type') || '';
      if (assetResponse.status < 400 && !ct.includes('text/html')) return assetResponse;
    } catch { /* noop */ }
    return new Response('Not Found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  const ogpRoute = matchOgpRoute(pathname);
  if (ogpRoute) {
    try {
      const meta = await buildOgpMeta(ogpRoute, env, 'https://kawabado.com' + pathname);
      if (meta) {
        return new Response(injectOgp(meta), {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, must-revalidate' },
        });
      }
    } catch { /* 失敗時は共通HTMLにフォールバック */ }
  }

  return new Response(INDEX_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache, must-revalidate' },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handleRequest(request, env);

    // staging・Preview環境は検索エンジンにインデックスさせない
    const host = new URL(request.url).hostname;
    if (!PRODUCTION_HOSTS.includes(host)) {
      const noindexed = new Response(response.body, response);
      noindexed.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return noindexed;
    }
    return response;
  },
};
