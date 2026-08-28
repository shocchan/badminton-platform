// 広告計測タグ（GA4 / Metaピクセル）と成果イベント計測。
//
// ── 有効化の条件 ─────────────────────────────────────────
// ・VITE_GA4_ID / VITE_META_PIXEL_ID が設定されていること（未設定なら全no-op）
// ・本番ドメイン（kawabado.com）でのみ自動有効。
//   staging等でイベント送信テストをしたい場合のみ URL に ?tracktest=1 を付けて開く
// ── テスト送信の除外 ─────────────────────────────────────
// ・URL に ?notrack=1 を付けて開くと、そのブラウザは以後ずっと計測対象外
//   （?notrack=0 で解除）。CEO自身のテスト申込みに使う
// ・/admin 系ページを開いたブラウザは運営者とみなし自動で計測対象外にする
// ── UTM保持 ──────────────────────────────────────────────
// ・初回アクセスのURLに utm_* があれば sessionStorage に保存し、
//   成果イベント（generate_lead / begin_checkout / purchase）に添付する
// ・後方互換: 配布済みリンクの `?from=line` `?from=wechat` も utm_source/utm_medium に
//   読み替えて同じ場所に保存する（2026-08-24）。これが無いと LINE/WeChat 経由が
//   GA4 では Direct に埋もれて「0件」に見える
// ── ファネルイベント ─────────────────────────────────────
//   view_tournament    大会詳細を見た           （Meta: ViewContent）
//   begin_application  申込フォームが表示された （Meta: BeginApplication ※カスタム）
//   generate_lead      申込フォーム送信完了     （Meta: Lead）
//   begin_checkout     クレジット決済を開始     （Meta: InitiateCheckout）
//   purchase           クレジット決済が完了     （Meta: Purchase）
// ── その他 ───────────────────────────────────────────────
//   click_related_service  フッターの関連サービス（AI日本語コース / wildflow）クリック
//   referral_visit         `?ref=` 付きリンクで初めて来た
//
// ── 2026-08-28 統合メモ（add/add 衝突の解消） ────────────────
// release/assetization-2026-08 と security/rls-hardening-and-quality の両方が
// このファイルを独立に作っていた（共通の祖先なし）。突き合わせた結果、
// security 側のイベント・関数は**すべてこちら側に同名・同シグネチャで存在**していた
// （initAnalytics / trackPageView / trackViewTournament / trackBeginApplication /
//   trackGenerateLead / trackBeginCheckout / trackPurchase の7つ）。
// 差分は2点だけで、いずれもこちら側が上位互換のため、こちらを残した:
//   1. UTM保存: security側は `?utm_source=` があるときだけ保存。こちら側はそれに加えて
//      旧 `?from=line|wechat` もUTMへ読み替える（配布済みリンクを落とさない）
//   2. page_view の page_location: security側は window.location.href をそのまま送信。
//      こちら側は scrubUrlForAnalytics で session_id / token を落としてから送り、
//      さらに内部遷移の page_referrer を自前で埋める
// security側にしか無いイベント・エクスポートは無い（＝この統合で失われた計測はない）。

const GA4_ID = import.meta.env.VITE_GA4_ID as string | undefined;
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;
const PROD_HOSTNAME = 'kawabado.com';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    dataLayer?: any[];
    gtag?: (...args: any[]) => void;
    fbq?: (...args: any[]) => void;
    _fbq?: any;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const NOTRACK_KEY = 'kb_notrack';
const TRACKTEST_KEY = 'kb_tracktest';
const UTM_KEY = 'kb_utm';
/**
 * 紹介コード（2026-08-23）。`?ref=<code>` で来た人を、購入まで追えるようにする。
 * **localStorage に置く**（UTMと違いセッションを跨ぐ）: 紹介リンクで見て、
 * 数日あとに買う人を落とさないため。値は英数と一部記号だけに絞る（そのままDBへ入る）。
 */
const REF_KEY = 'kb_ref';
const REF_PATTERN = /^[A-Za-z0-9_-]{3,32}$/;

/**
 * 旧式の `?from=` を標準UTMへ読み替える表（2026-08-24）。
 *
 * これまで LINE / WeChat のシェアリンクは `?from=line` `?from=wechat` を付けていたが、
 * GA4 は独自パラメータを流入元として扱わないため、そこから来た人は全員 Direct になっていた。
 * 新しく作るリンクは utm_* を付けるが、**すでに配られてしまったリンクは書き換えられない**ので、
 * ここで同じ意味のUTMに直してから保存する。
 * `utm_campaign` を分けているのは、旧リンクがどれだけ生き残っているかを後から数えられるようにするため。
 */
const FROM_TO_UTM: Record<string, Record<string, string>> = {
  line: { utm_source: 'line', utm_medium: 'share', utm_campaign: 'legacy_from' },
  wechat: { utm_source: 'wechat', utm_medium: 'share', utm_campaign: 'legacy_from' },
};

/** `?from=` の値 → UTM。未知の値・`web`（＝流入元なし）は null */
export const utmFromLegacyFromParam = (from: string | null | undefined): Record<string, string> | null => {
  if (!from) return null;
  return FROM_TO_UTM[from.toLowerCase()] ? { ...FROM_TO_UTM[from.toLowerCase()] } : null;
};

/** 新しく作るシェアリンクに付けるUTM（2026-08-24。旧 `?from=` の置き換え） */
export const shareUtmQuery = (channel: 'line' | 'wechat'): string =>
  `utm_source=${channel}&utm_medium=share&utm_campaign=tournament_share`;

// ── フラグ処理（?notrack= / ?tracktest= / utm保存） ──
const processUrlFlags = () => {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('notrack') === '1') localStorage.setItem(NOTRACK_KEY, '1');
    if (q.get('notrack') === '0') localStorage.removeItem(NOTRACK_KEY);
    if (q.get('tracktest') === '1') sessionStorage.setItem(TRACKTEST_KEY, '1');
    // UTMは初回アクセス分をセッション中保持（SPA遷移でURLから消えるため）
    if (!sessionStorage.getItem(UTM_KEY)) {
      const utm: Record<string, string> = {};
      if (q.get('utm_source')) {
        for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
          const v = q.get(k);
          if (v) utm[k] = v;
        }
      } else {
        // utm_* が無いときだけ旧 `?from=` を見る（両方あればUTMを優先する）
        Object.assign(utm, utmFromLegacyFromParam(q.get('from')) ?? {});
      }
      if (utm.utm_source) sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    }
    // 紹介コード。**最初に見たものを優先**（あとから別のリンクで上書きしない）
    const ref = q.get('ref');
    if (ref && REF_PATTERN.test(ref) && !localStorage.getItem(REF_KEY)) {
      localStorage.setItem(REF_KEY, ref);
      trackEvent('referral_visit', { ref_code: ref });
    }
  } catch { /* ストレージ不可環境では何もしない */ }
};

/**
 * このブラウザが計測から外れているか（?notrack=1 の恒久除外）。
 * GA/Meta 以外の自前カウンタ（LP表示数）も同じ意思決定に従わせるため公開する。
 */
export const isTrackingOptedOut = (): boolean => {
  try { return localStorage.getItem(NOTRACK_KEY) === '1'; } catch { return false; }
};

/** 本番ドメインで開かれているか。staging や localhost の閲覧を本番の数字に混ぜない */
export const isProdHost = (): boolean => {
  try {
    const h = window.location.hostname;
    return h === PROD_HOSTNAME || h.endsWith(`.${PROD_HOSTNAME}`);
  } catch { return false; }
};

const isEnabled = () => {
  if (!GA4_ID && !META_PIXEL_ID) return false;
  try {
    if (localStorage.getItem(NOTRACK_KEY) === '1') return false;
    if (window.location.hostname === PROD_HOSTNAME) return true;
    return sessionStorage.getItem(TRACKTEST_KEY) === '1';
  } catch {
    return window.location.hostname === PROD_HOSTNAME;
  }
};

const getUtm = (): Record<string, string> => {
  try { return JSON.parse(sessionStorage.getItem(UTM_KEY) ?? '{}'); } catch { return {}; }
};

/** 保存済みの紹介コード（無ければ null）。購入・申込のときに一緒に送る */
export const getReferralCode = (): string | null => {
  try {
    const v = localStorage.getItem(REF_KEY);
    return v && REF_PATTERN.test(v) ? v : null;
  } catch { return null; }
};

/**
 * DBに保存する流入元の3値（2026-08-24）。
 * `activity_entries.source`（通常活動）と `subscribers.source`（特典登録）が
 * すでにこの3値なので、大会申込（`entries.source`）も**同じ粒度・同じ値**に揃える。
 * 細かい内訳（campaign等）はGA4側のUTMで見る。DBは「どのチャネルから来たか」だけ持つ。
 */
export type TrafficSource = 'line' | 'wechat' | 'web';

/** utm_source / from の生値 → 3値。判定できないものは null（呼び出し側で 'web' に落とす） */
export const normalizeTrafficSource = (raw: string | null | undefined): TrafficSource | null => {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'line') return 'line';
  if (v === 'wechat' || v === 'weixin') return 'wechat';
  if (v === 'web') return 'web';
  return null;
};

/**
 * 申込レコードに載せる流入元。
 * 優先順は「今のURLの ?from=」→「今のURLの ?utm_source=」→「セッション保持中のUTM」→ 'web'。
 *
 * 3番目が要る理由: SPAなので、シェアリンクで着地したあと大会一覧→詳細と動くと
 * URLからパラメータが消える。ActivityPage は着地URLしか見ていないため、
 * 一覧を経由した申込が 'web' に化ける。ここではセッションに退避した値まで見る。
 */
export const getTrafficSource = (search?: string): TrafficSource => {
  try {
    const q = new URLSearchParams(search ?? window.location.search);
    return normalizeTrafficSource(q.get('from'))
      ?? normalizeTrafficSource(q.get('utm_source'))
      ?? normalizeTrafficSource(getUtm().utm_source)
      ?? 'web';
  } catch {
    return 'web';
  }
};

/**
 * 「同じ成果イベントを2回送らない」ための札（2026-08-24）。
 *
 * 成果イベントは再レンダリング・戻る操作・決済の再試行で簡単に二重発火する。
 * 二重に飛ぶと CV が水増しされ、広告の費用対効果を誤って判断することになる。
 * React では `useRef(createOnceGate())` で申込1回分のスコープに閉じて使う。
 *
 * @returns key ごとに「初回だけ true」を返す関数
 */
export const createOnceGate = () => {
  const fired = new Set<string>();
  return (key: string): boolean => {
    if (fired.has(key)) return false;
    fired.add(key);
    return true;
  };
};

// 現在表示中の言語（/ja/ か /zh/ か）。全イベントに添付する
const currentLang = () => (window.location.pathname.startsWith('/zh') ? 'zh' : 'ja');

let initialized = false;

/** アプリ起動時に一度だけ呼ぶ */
export const initAnalytics = () => {
  if (initialized) return;
  initialized = true;
  processUrlFlags();
  if (!isEnabled()) return;

  if (GA4_ID) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    // 公式スニペット準拠: gtag.js は arguments オブジェクトのみをコマンドとして処理する。
    // rest引数の実配列(push([...]))を渡すと config/js が無視されコンテナが初期化されず、
    // collect が一切送信されない（2026-07-22 実機で特定した不具合の修正）。
    // eslint-disable-next-line prefer-rest-params -- gtag.jsはargumentsオブジェクトのみ処理する（配列不可）
    window.gtag = function gtag() { window.dataLayer!.push(arguments); };
    window.gtag('js', new Date());
    // SPAなので page_view は手動送信（route遷移ごとに trackPageView）。
    // tracktest中は config にも debug_mode を付け DebugView に確実に表示させる
    const debugMode = (() => { try { return sessionStorage.getItem(TRACKTEST_KEY) === '1'; } catch { return false; } })();
    window.gtag('config', GA4_ID, { send_page_view: false, ...(debugMode ? { debug_mode: true } : {}) });
  }

  if (META_PIXEL_ID) {
    /* eslint-disable @typescript-eslint/no-explicit-any, prefer-rest-params, prefer-spread */
    // Meta公式スニペット完全準拠。gtagと同様 fbevents.js は arguments を処理するため
    // rest引数の配列にしない（callMethod.apply / queue.push(arguments)）。
    const fbq: any = function () {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, arguments);
      else fbq.queue.push(arguments);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any, prefer-rest-params, prefer-spread */
    if (!window._fbq) window._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    fbq('init', META_PIXEL_ID);
    // 初回PageViewはSPAの trackPageView（初回マウント時に発火）に任せ、二重計上を防ぐ
  }
};

// GA4/Meta 送信の共通経路。開発ビルドでは console.debug で発火内容を確認できる
const send = (
  ga4Event: string | null,
  ga4Params: Record<string, unknown>,
  metaEvent: string | null,
  metaParams: Record<string, unknown> = {},
  metaCustom = false,
) => {
  if (import.meta.env.DEV) {
    console.debug('[analytics]', ga4Event ?? metaEvent, { ...ga4Params, enabled: isEnabled() });
  }
  if (!isEnabled()) return;
  // tracktest中は GA4 DebugView に即時表示（debug_mode）＋
  // 内部トラフィック印（GA4管理画面でフィルタ設定すればレポートから除外可能）
  let params = ga4Params;
  try {
    if (sessionStorage.getItem(TRACKTEST_KEY) === '1') {
      params = { ...ga4Params, debug_mode: true, traffic_type: 'internal' };
    }
  } catch { /* noop */ }
  if (ga4Event && GA4_ID && window.gtag) window.gtag('event', ga4Event, params);
  if (metaEvent && META_PIXEL_ID && window.fbq) {
    window.fbq(metaCustom ? 'trackCustom' : 'track', metaEvent, metaParams);
  }
};

/**
 * 汎用イベント（AIコースLP・学習アプリの計測用）。
 * 表示言語（page_lang）と保持中のUTMを自動で付与してGA4へ送る。
 * **個人情報（名前・メール・WeChat ID・会話内容）をparamsに入れないこと。**
 */
export const trackEvent = (event: string, params: Record<string, unknown> = {}) => {
  send(event, { ...params, page_lang: currentLang(), ...getUtm() }, null);
};

/** SPAのルート遷移ごとに呼ぶ。page_location にはUTM込みの完全URLを渡す */
/**
 * 計測へ送るURLから、持ち主を特定できる鍵を落とす（2026-08-23 監査）。
 * 購入完了ページの `session_id`（Stripe Checkout Session ID）は、そのまま購入状況APIに渡すと
 * ログインIDとマスク済みメールが返る「鍵」なので GA4 へ送らない。
 */
export const scrubUrlForAnalytics = (href: string): string => {
  try {
    const u = new URL(href);
    for (const k of ['session_id', 'token', 'access_token', 'code']) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return href;
  }
};

/**
 * 直前に見ていたページ（スクラブ済みURL）。
 * SPAでは gtag が持つ referrer が「サイトに入ってきたときの外部URL」で固定され、
 * 内部遷移のたびに「どこから来てこのページを開いたか」が失われる。
 * そこを自前で埋めるための保持（2026-08-24）。
 */
let lastPageLocation: string | null = null;

export const trackPageView = (pathname: string) => {
  // 運営者の自動除外: 管理画面を開いたブラウザは以後計測しない
  if (pathname.includes('/admin')) {
    try { localStorage.setItem(NOTRACK_KEY, '1'); } catch { /* noop */ }
    return;
  }
  // 初回だけは外部からの参照元（document.referrer）。以降は直前の内部ページ。
  // どちらも scrubUrlForAnalytics を通し、session_id 等の「鍵」を落としてから送る
  const referrer = lastPageLocation ?? (() => {
    try { return document.referrer ? scrubUrlForAnalytics(document.referrer) : null; } catch { return null; }
  })();
  const location = scrubUrlForAnalytics(window.location.href);
  send(
    'page_view',
    {
      page_location: location,
      page_path: pathname,
      page_lang: currentLang(),
      ...(referrer ? { page_referrer: referrer } : {}),
    },
    'PageView',
  );
  lastPageLocation = location;
};

/**
 * フッターの「関連サービス」クリック（2026-08-24）。
 * どのページから・どの言語で見ている人が・どのサービスへ出て行ったかを残す。
 * 送るのはパス（クエリなし）だけ。個人を特定できる値は載せない。
 */
export const trackRelatedServiceClick = (service: 'ai_course' | 'wildflow', fromPath: string) => {
  trackEvent('click_related_service', { service, from_path: fromPath });
};

/** 大会詳細ページを表示した */
export const trackViewTournament = (tournamentId: number, fee: number) => {
  send(
    'view_tournament',
    { tournament_id: tournamentId, value: fee, currency: 'JPY', page_lang: currentLang() },
    'ViewContent',
    { content_ids: [String(tournamentId)], content_type: 'tournament', value: fee, currency: 'JPY' },
  );
};

/** 申込フォームが表示された（ルール確認を通過してフォームを開いた） */
export const trackBeginApplication = (tournamentId: number) => {
  send(
    'begin_application',
    { tournament_id: tournamentId, page_lang: currentLang() },
    'BeginApplication',
    { content_ids: [String(tournamentId)] },
    true,
  );
};

/** 申込フォーム送信完了（entriesレコード作成成功。確定/キャンセル待ち両方） */
export const trackGenerateLead = (tournamentId: number, fee: number, status: 'confirmed' | 'waitlist') => {
  send(
    'generate_lead',
    { tournament_id: tournamentId, value: fee, currency: 'JPY', entry_status: status, page_lang: currentLang(), ...getUtm() },
    'Lead',
    { content_ids: [String(tournamentId)], value: fee, currency: 'JPY' },
  );
};

/** クレジット決済を開始した（PaymentIntent作成成功） */
export const trackBeginCheckout = (tournamentId: number, amount: number) => {
  send(
    'begin_checkout',
    { tournament_id: tournamentId, value: amount, currency: 'JPY', page_lang: currentLang(), ...getUtm() },
    'InitiateCheckout',
    { content_ids: [String(tournamentId)], value: amount, currency: 'JPY' },
  );
};

/** クレジット決済が完了した */
export const trackPurchase = (tournamentId: number, amount: number) => {
  send(
    'purchase',
    {
      transaction_id: `entry-${tournamentId}-${Date.now()}`,
      tournament_id: tournamentId,
      value: amount,
      currency: 'JPY',
      page_lang: currentLang(),
      ...getUtm(),
    },
    'Purchase',
    { content_ids: [String(tournamentId)], value: amount, currency: 'JPY' },
  );
};
