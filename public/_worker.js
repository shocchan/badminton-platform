export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 拡張子があるファイル（JS, CSS, 画像など）はそのまま静的ファイルとして配信
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
    if (hasExtension && !pathname.endsWith('.html')) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status < 400) return assetResponse;
      } catch (_) {}
    }

    // パターン1: / (ルート) で index.html を取得
    try {
      const rootReq = new Request(url.origin + '/');
      const resp = await env.ASSETS.fetch(rootReq);
      if (resp.ok) {
        return new Response(resp.body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      // パターン2: index.html 直接
      const htmlReq = new Request(url.origin + '/index.html');
      const resp2 = await env.ASSETS.fetch(htmlReq);
      if (resp2.ok) {
        return new Response(resp2.body, {
          status: 200,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      }
      return new Response(`Both failed: root=${resp.status} html=${resp2.status}`, { status: 500 });
    } catch (err) {
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  },
};
