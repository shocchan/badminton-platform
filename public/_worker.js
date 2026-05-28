// CF Pages Worker - index.htmlをWorkerに直接埋め込んでClean URLsの問題を完全回避

const INDEX_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>川口・蕨バド交流杯 | バドミントン大会</title>
    <meta name="description" content="仕事終わりに、4試合以上。平日夜開催・川口蕨エリアのバドミントン大会。超初級〜オープンまで全レベル歓迎！" />

    <!-- OGP -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://kawabado.com/" />
    <meta property="og:title" content="仕事終わりに、4試合以上。| 川口・蕨バド交流杯" />
    <meta property="og:description" content="平日夜開催・4試合以上保証のバドミントン大会。川口・蕨エリア、超初級〜オープンまで全レベル歓迎！" />
    <meta property="og:image" content="https://kawabado.com/ogp.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="ja_JP" />
    <meta property="og:site_name" content="川口・蕨バド交流杯" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="仕事終わりに、4試合以上。| 川口・蕨バド交流杯" />
    <meta name="twitter:description" content="平日夜開催・4試合以上保証のバドミントン大会。川口・蕨エリア、超初級〜オープンまで全レベル歓迎！" />
    <meta name="twitter:image" content="https://kawabado.com/ogp.png" />
    <script type="module" crossorigin src="/assets/index-B9G0rgSr.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-CoAYpyrw.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 拡張子があるファイル（JS, CSS, 画像など）はenv.ASSETSで直接配信
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
    if (hasExtension && !pathname.endsWith('.html')) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status < 400) return assetResponse;
      } catch (_) {}
    }

    // HTMLルート・SPA内パスはWorkerに埋め込まれたindex.htmlを直接返す
    return new Response(INDEX_HTML, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  },
};
