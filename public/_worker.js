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

    // index.htmlを直接配信
    try {
      const indexRequest = new Request(new URL('/index.html', url.origin).toString(), {
        method: 'GET',
        headers: { 'Accept': 'text/html' },
      });
      const resp = await env.ASSETS.fetch(indexRequest);
      if (resp.ok) {
        return new Response(resp.body, {
          status: 200,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            ...Object.fromEntries(resp.headers.entries()),
          },
        });
      }
      // index.html fetchが失敗した場合のデバッグ情報
      return new Response(`index.html status: ${resp.status}`, { status: 500 });
    } catch (err) {
      return new Response(`Worker error: ${err.message}`, { status: 500 });
    }
  },
};
