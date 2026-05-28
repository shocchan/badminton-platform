// CF Pages Worker - SPAルーティング対応
// CF Pages v3のClean URLs問題を回避するためにWorkerでリクエストを処理

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 拡張子があるファイル（JS, CSS, 画像など）はそのまま静的ファイルとして配信
    const hasExtension = /\.[a-zA-Z0-9]+$/.test(pathname);
    if (hasExtension && !pathname.endsWith('.html')) {
      try {
        const assetResponse = await env.ASSETS.fetch(request);
        if (assetResponse.status < 400) {
          return assetResponse;
        }
      } catch (_) {}
    }

    // それ以外（HTMLルート、SPA内パス）はすべて index.html を返す
    const indexRequest = new Request(new URL('/index.html', url.origin).toString(), {
      method: 'GET',
      headers: { 'Accept': 'text/html' },
    });
    return env.ASSETS.fetch(indexRequest);
  },
};
