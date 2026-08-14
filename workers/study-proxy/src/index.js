// study.kawabado.com への全リクエストを staging Pages へ素通しする。
// パス・クエリ・メソッド・ボディは保持。リダイレクトのLocationだけ自ドメインへ書き戻す。
const UPSTREAM = 'staging.badminton-platform.pages.dev';

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const selfHost = url.hostname;
    url.hostname = UPSTREAM;
    const upstream = await fetch(new Request(url, request));
    const loc = upstream.headers.get('Location');
    if (loc && loc.includes(UPSTREAM)) {
      const headers = new Headers(upstream.headers);
      headers.set('Location', loc.replaceAll(UPSTREAM, selfHost));
      return new Response(upstream.body, { status: upstream.status, headers });
    }
    return upstream;
  },
};
