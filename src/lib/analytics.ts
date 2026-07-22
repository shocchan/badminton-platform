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
// ── ファネルイベント ─────────────────────────────────────
//   view_tournament    大会詳細を見た           （Meta: ViewContent）
//   begin_application  申込フォームが表示された （Meta: BeginApplication ※カスタム）
//   generate_lead      申込フォーム送信完了     （Meta: Lead）
//   begin_checkout     クレジット決済を開始     （Meta: InitiateCheckout）
//   purchase           クレジット決済が完了     （Meta: Purchase）

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

// ── フラグ処理（?notrack= / ?tracktest= / utm保存） ──
const processUrlFlags = () => {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get('notrack') === '1') localStorage.setItem(NOTRACK_KEY, '1');
    if (q.get('notrack') === '0') localStorage.removeItem(NOTRACK_KEY);
    if (q.get('tracktest') === '1') sessionStorage.setItem(TRACKTEST_KEY, '1');
    // UTMは初回アクセス分をセッション中保持（SPA遷移でURLから消えるため）
    if (q.get('utm_source') && !sessionStorage.getItem(UTM_KEY)) {
      const utm: Record<string, string> = {};
      for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
        const v = q.get(k);
        if (v) utm[k] = v;
      }
      sessionStorage.setItem(UTM_KEY, JSON.stringify(utm));
    }
  } catch { /* ストレージ不可環境では何もしない */ }
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
    window.gtag = function gtag(...args: unknown[]) { window.dataLayer!.push(args); };
    window.gtag('js', new Date());
    // SPAなので page_view は手動送信（route遷移ごとに trackPageView）
    window.gtag('config', GA4_ID, { send_page_view: false });
  }

  if (META_PIXEL_ID) {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const fbq: any = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    };
    /* eslint-enable @typescript-eslint/no-explicit-any */
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
  if (ga4Event && GA4_ID && window.gtag) window.gtag('event', ga4Event, ga4Params);
  if (metaEvent && META_PIXEL_ID && window.fbq) {
    window.fbq(metaCustom ? 'trackCustom' : 'track', metaEvent, metaParams);
  }
};

/** SPAのルート遷移ごとに呼ぶ。page_location にはUTM込みの完全URLを渡す */
export const trackPageView = (pathname: string) => {
  // 運営者の自動除外: 管理画面を開いたブラウザは以後計測しない
  if (pathname.includes('/admin')) {
    try { localStorage.setItem(NOTRACK_KEY, '1'); } catch { /* noop */ }
    return;
  }
  send(
    'page_view',
    { page_location: window.location.href, page_path: pathname, language: currentLang() },
    'PageView',
  );
};

/** 大会詳細ページを表示した */
export const trackViewTournament = (tournamentId: number, fee: number) => {
  send(
    'view_tournament',
    { tournament_id: tournamentId, value: fee, currency: 'JPY', language: currentLang() },
    'ViewContent',
    { content_ids: [String(tournamentId)], content_type: 'tournament', value: fee, currency: 'JPY' },
  );
};

/** 申込フォームが表示された（ルール確認を通過してフォームを開いた） */
export const trackBeginApplication = (tournamentId: number) => {
  send(
    'begin_application',
    { tournament_id: tournamentId, language: currentLang() },
    'BeginApplication',
    { content_ids: [String(tournamentId)] },
    true,
  );
};

/** 申込フォーム送信完了（entriesレコード作成成功。確定/キャンセル待ち両方） */
export const trackGenerateLead = (tournamentId: number, fee: number, status: 'confirmed' | 'waitlist') => {
  send(
    'generate_lead',
    { tournament_id: tournamentId, value: fee, currency: 'JPY', entry_status: status, language: currentLang(), ...getUtm() },
    'Lead',
    { content_ids: [String(tournamentId)], value: fee, currency: 'JPY' },
  );
};

/** クレジット決済を開始した（PaymentIntent作成成功） */
export const trackBeginCheckout = (tournamentId: number, amount: number) => {
  send(
    'begin_checkout',
    { tournament_id: tournamentId, value: amount, currency: 'JPY', language: currentLang(), ...getUtm() },
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
      language: currentLang(),
      ...getUtm(),
    },
    'Purchase',
    { content_ids: [String(tournamentId)], value: amount, currency: 'JPY' },
  );
};
