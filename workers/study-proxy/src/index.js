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
    // このドメインは**生徒の学習アプリ用**で、検索結果に出す必要がない（2026-08-22）。
    // upstream は kawabado.com と同じ内容を丸ごと返すので、放っておくとサイト全体が
    // 2つのドメインに重複して存在することになる。実測でも X-Robots-Tag は
    // ここまで届いていなかった（pages.dev へ直接当てると付くのに、この経路では消えていた）ので、
    // 上流に頼らずここで必ず付ける。
    const headers = new Headers(upstream.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    const loc = upstream.headers.get('Location');
    if (loc && loc.includes(UPSTREAM)) {
      headers.set('Location', loc.replaceAll(UPSTREAM, selfHost));
    }
    // 204/304 などは本文を持てない。ここで body を渡すと Workers が例外を投げ、
    // **条件付きリクエスト（再訪問時のキャッシュ確認）が全部落ちる**。
    // 以前は redirect のときだけ Response を作り直していたので踏まなかった経路
    const NULL_BODY = [101, 204, 205, 304];
    const body = NULL_BODY.includes(upstream.status) ? null : upstream.body;
    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  },
};
