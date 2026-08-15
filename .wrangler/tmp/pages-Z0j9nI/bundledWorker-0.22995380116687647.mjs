var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// _worker.js
var INDEX_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png?v=3" />
    <link rel="icon" type="image/png" href="/favicon.png?v=3" />
    <link rel="apple-touch-icon" href="/favicon.png?v=3" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- \u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF\uFF08JS\u5B9F\u884C\u524D\u3001\u307E\u305F\u306FHelmet\u304C\u52B9\u304B\u306A\u3044\u5834\u5408\u7528\uFF09 -->
    <title>\u5DDD\u53E3\u30FB\u8568\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3\u4EA4\u6D41\u4F1A</title>
    <meta name="description" content="\u5DDD\u53E3\u5E02\u30FB\u8568\u5E02\u30A8\u30EA\u30A2\u306E\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3\u4EA4\u6D41\u4F1A" />

    <!-- OGP\uFF08SNS\u30AF\u30ED\u30FC\u30E9\u30FC\u5411\u3051\u30D5\u30A9\u30FC\u30EB\u30D0\u30C3\u30AF\uFF09 -->
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="\u5DDD\u53E3\u30FB\u8568\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3\u4EA4\u6D41\u4F1A" />
    <meta property="og:title" content="\u5DDD\u53E3\u30FB\u8568\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3\u4EA4\u6D41\u4F1A" />
    <meta property="og:description" content="\u5DDD\u53E3\u5E02\u30FB\u8568\u5E02\u30A8\u30EA\u30A2\u306E\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3\u4EA4\u6D41\u4F1A" />
    <meta property="og:image" content="https://kawabado.com/ogp.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="ja_JP" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="https://kawabado.com/ogp.jpg" />
    <script type="module" crossorigin src="/assets/index-vnKdpB_G.js"><\/script>
    <link rel="modulepreload" crossorigin href="/assets/jsx-runtime-DUXOgzKQ.js">
    <link rel="modulepreload" crossorigin href="/assets/preload-helper-Czpn1I53.js">
    <link rel="modulepreload" crossorigin href="/assets/chunk-4N6VE7H7-Dk22IJCG.js">
    <link rel="modulepreload" crossorigin href="/assets/createLucideIcon-CVL6fCyA.js">
    <link rel="stylesheet" crossorigin href="/assets/index-Bm6IdDUH.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;
async function generateSitemap(env) {
  const staticUrls = [
    { path: "", priority: "1.0", freq: "weekly" },
    { path: "activity", priority: "0.9", freq: "weekly" },
    { path: "level-guide", priority: "0.8", freq: "monthly" },
    { path: "faq", priority: "0.8", freq: "monthly" },
    { path: "venues", priority: "0.7", freq: "monthly" },
    { path: "contact", priority: "0.6", freq: "monthly" },
    { path: "blog", priority: "0.7", freq: "weekly" },
    { path: "join", priority: "0.6", freq: "monthly" },
    { path: "results/vol1", priority: "0.6", freq: "yearly" },
    { path: "results/vol2", priority: "0.6", freq: "yearly" },
    { path: "results/vol3", priority: "0.6", freq: "yearly" },
    { path: "cancel-policy", priority: "0.5", freq: "monthly" }
  ];
  const langs = ["ja", "zh"];
  let urls = "";
  let tournaments = [];
  let activities = [];
  try {
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
    const supabaseKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
    if (supabaseUrl && supabaseKey) {
      const headers = {
        apikey: supabaseKey,
        Authorization: "Bearer " + supabaseKey
      };
      const res = await fetch(
        supabaseUrl + "/rest/v1/tournaments?select=id,updated_at&visibility=eq.published",
        { headers }
      );
      if (res.ok) tournaments = await res.json();
      const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const actRes = await fetch(
        supabaseUrl + "/rest/v1/activities?select=id,date&status=neq.cancelled&archived_at=is.null&date=gte." + today,
        { headers }
      );
      if (actRes.ok) activities = await actRes.json();
    }
  } catch (_) {
  }
  for (const lang of langs) {
    for (const u of staticUrls) {
      const loc = u.path === "" ? "https://kawabado.com/" + lang + "/" : "https://kawabado.com/" + lang + "/" + u.path;
      urls += "\n  <url>\n    <loc>" + loc + "</loc>\n    <changefreq>" + u.freq + "</changefreq>\n    <priority>" + u.priority + "</priority>\n  </url>";
    }
    for (const t of tournaments) {
      const lastmod = t.updated_at ? t.updated_at.slice(0, 10) : "";
      urls += "\n  <url>\n    <loc>https://kawabado.com/" + lang + "/tournaments/" + t.id + "</loc>" + (lastmod ? "\n    <lastmod>" + lastmod + "</lastmod>" : "") + "\n    <changefreq>daily</changefreq>\n    <priority>0.9</priority>\n  </url>";
    }
    for (const a of activities) {
      urls += "\n  <url>\n    <loc>https://kawabado.com/" + lang + "/activity/" + a.id + "</loc>\n    <changefreq>daily</changefreq>\n    <priority>0.8</priority>\n  </url>";
    }
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + "\n</urlset>";
}
__name(generateSitemap, "generateSitemap");
function matchOgpRoute(pathname) {
  let m = pathname.match(/^\/(ja|zh)\/tournaments\/(\d+)\/?$/);
  if (m) return { kind: "tournament", lang: m[1], id: m[2] };
  m = pathname.match(/^\/tournaments\/(\d+)\/?$/);
  if (m) return { kind: "tournament", lang: "ja", id: m[1] };
  m = pathname.match(/^\/(ja|zh)\/blog\/(\d+)\/?$/);
  if (m) return { kind: "blog", lang: m[1], id: m[2] };
  m = pathname.match(/^\/blog\/(\d+)\/?$/);
  if (m) return { kind: "blog", lang: "ja", id: m[1] };
  return null;
}
__name(matchOgpRoute, "matchOgpRoute");
async function fetchFirst(env, path) {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || "";
  const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !key) return null;
  const res = await fetch(supabaseUrl + path, {
    headers: { apikey: key, Authorization: "Bearer " + key }
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}
__name(fetchFirst, "fetchFirst");
function escAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(escAttr, "escAttr");
function injectOgp(meta) {
  let html = INDEX_HTML.replace(/<title>[^<]*<\/title>/, "<title>" + escAttr(meta.title) + "</title>").replace(/(<meta name="description" content=")[^"]*(")/, "$1" + escAttr(meta.description) + "$2").replace(/(<meta property="og:title" content=")[^"]*(")/, "$1" + escAttr(meta.title) + "$2").replace(/(<meta property="og:description" content=")[^"]*(")/, "$1" + escAttr(meta.description) + "$2");
  if (meta.image) {
    html = html.replace(/(<meta property="og:image" content=")[^"]*(")/, "$1" + escAttr(meta.image) + "$2").replace(/(<meta name="twitter:image" content=")[^"]*(")/, "$1" + escAttr(meta.image) + "$2");
  }
  return html.replace("</head>", '<meta property="og:url" content="' + escAttr(meta.url) + '" />\n  </head>');
}
__name(injectOgp, "injectOgp");
var WEEKDAYS_JA = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
var WEEKDAYS_ZH = ["\u65E5", "\u4E00", "\u4E8C", "\u4E09", "\u56DB", "\u4E94", "\u516D"];
async function buildOgpMeta(route, env, pageUrl) {
  if (route.kind === "tournament") {
    const t = await fetchFirst(
      env,
      "/rest/v1/tournaments?id=eq." + route.id + "&visibility=neq.draft&select=title,event_date,start_time,end_time,location,entry_fee,level,event_type"
    );
    if (!t || !t.event_date) return null;
    const [y, mo, d] = t.event_date.split("-");
    const wdIdx = new Date(t.event_date).getUTCDay();
    const time = (t.start_time || "").slice(0, 5) + "\u301C" + (t.end_time || "").slice(0, 5);
    const fee = Number(t.entry_fee || 0).toLocaleString("ja-JP");
    if (route.lang === "zh") {
      return {
        title: t.title + "\uFF5C" + Number(mo) + "/" + Number(d) + "(\u5468" + WEEKDAYS_ZH[wdIdx] + ")\u4E3E\u529E",
        description: "\u{1F4C5}" + y + "\u5E74" + Number(mo) + "\u6708" + Number(d) + "\u65E5(\u5468" + WEEKDAYS_ZH[wdIdx] + ") " + time + "\uFF5C\u{1F4CD}" + t.location + "\uFF5C\u{1F4B0}\u62A5\u540D\u8D39\xA5" + fee + "\uFF5C" + t.level + "\xB7" + t.event_type + "\u3002\u6B63\u5728\u62A5\u540D\u4E2D\uFF01",
        url: pageUrl
      };
    }
    return {
      title: t.title + "\uFF5C" + Number(mo) + "/" + Number(d) + "(" + WEEKDAYS_JA[wdIdx] + ")\u958B\u50AC",
      description: "\u{1F4C5}" + y + "\u5E74" + Number(mo) + "\u6708" + Number(d) + "\u65E5(" + WEEKDAYS_JA[wdIdx] + ") " + time + "\uFF5C\u{1F4CD}" + t.location + "\uFF5C\u{1F4B0}\u53C2\u52A0\u8CBB\xA5" + fee + "\uFF5C" + t.level + "\u30FB" + t.event_type + "\u3002\u7533\u8FBC\u53D7\u4ED8\u4E2D\uFF01",
      url: pageUrl
    };
  }
  if (route.kind === "blog") {
    const p = await fetchFirst(
      env,
      "/rest/v1/blog_posts?id=eq." + route.id + "&select=title,excerpt,image_url"
    );
    if (!p) return null;
    return {
      title: p.title + "\uFF5C\u5DDD\u53E3\u30FB\u8568\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3\u4EA4\u6D41\u4F1A",
      description: p.excerpt || "\u5DDD\u53E3\u30FB\u8568\u30A8\u30EA\u30A2\u306E\u30D0\u30C9\u30DF\u30F3\u30C8\u30F3\u4EA4\u6D41\u4F1A\u306E\u6D3B\u52D5\u30D6\u30ED\u30B0",
      image: p.image_url && /^https?:/.test(p.image_url) ? p.image_url : null,
      url: pageUrl
    };
  }
  return null;
}
__name(buildOgpMeta, "buildOgpMeta");
var PRODUCTION_HOSTS = ["kawabado.com", "www.kawabado.com"];
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const pathname = url.pathname;
  if (/^\/(ja\/|zh\/)?admin(\/|$)/.test(pathname) && env.ADMIN_GATE_USER && env.ADMIN_GATE_PASS) {
    const auth = request.headers.get("Authorization") || "";
    const expected = "Basic " + btoa(env.ADMIN_GATE_USER + ":" + env.ADMIN_GATE_PASS);
    if (auth !== expected) {
      return new Response("Authentication required", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="kawabado admin"', "Cache-Control": "no-store" }
      });
    }
  }
  if (pathname === "/sitemap.xml") {
    try {
      const xml = await generateSitemap(env);
      return new Response(xml, {
        headers: { "Content-Type": "application/xml; charset=utf-8" }
      });
    } catch (err) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?>\n<!-- error: ' + err.message + ' -->\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>',
        { status: 200, headers: { "Content-Type": "application/xml; charset=utf-8" } }
      );
    }
  }
  if (pathname === "/__debug") {
    const results = {};
    for (const p of ["/favicon.svg", "/assets/index-CoAYpyrw.css"]) {
      try {
        const r = await env.ASSETS.fetch(new Request(url.origin + p));
        results[p] = { status: r.status };
      } catch (e) {
        results[p] = { error: e.message };
      }
    }
    return new Response(JSON.stringify(results, null, 2), {
      headers: { "Content-Type": "application/json" }
    });
  }
  if (pathname.startsWith("/guide/")) {
    try {
      const guideRes = await env.ASSETS.fetch(request);
      if (guideRes.status < 400) return guideRes;
    } catch (_) {
    }
    return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
  if (hasExtension && !pathname.endsWith(".html")) {
    try {
      const assetResponse = await env.ASSETS.fetch(request);
      const ct = assetResponse.headers.get("Content-Type") || "";
      if (assetResponse.status < 400 && !ct.includes("text/html")) return assetResponse;
    } catch (_) {
    }
    return new Response("Not Found", {
      status: 404,
      headers: { "Cache-Control": "no-store" }
    });
  }
  const ogpRoute = matchOgpRoute(pathname);
  if (ogpRoute) {
    try {
      const meta = await buildOgpMeta(ogpRoute, env, "https://kawabado.com" + pathname);
      if (meta) {
        return new Response(injectOgp(meta), {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache, must-revalidate"
          }
        });
      }
    } catch (_) {
    }
  }
  return new Response(INDEX_HTML, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate"
    }
  });
}
__name(handleRequest, "handleRequest");
var worker_default = {
  async fetch(request, env) {
    const response = await handleRequest(request, env);
    const host = new URL(request.url).hostname;
    if (!PRODUCTION_HOSTS.includes(host)) {
      const noindexed = new Response(response.body, response);
      noindexed.headers.set("X-Robots-Tag", "noindex, nofollow");
      return noindexed;
    }
    return response;
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=bundledWorker-0.22995380116687647.mjs.map
