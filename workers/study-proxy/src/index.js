// study.kawabado.com への全リクエストを本番 Pages へ素通しする。
// パス・クエリ・メソッド・ボディは保持。リダイレクトのLocationだけ自ドメインへ書き戻す。
// 2026-08-15 本番リリースに伴い staging → 本番（badminton-platform.pages.dev）へ切替。
// 以後の流れ: staging.badminton-platform.pages.dev で検証 → 本番deploy → 生徒に反映
const UPSTREAM = 'badminton-platform.pages.dev';

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
