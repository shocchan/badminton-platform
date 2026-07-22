// 広告計測タグ（GA4 / Metaピクセル）のローダー。
// .env の VITE_GA4_ID / VITE_META_PIXEL_ID が設定されている場合のみタグを注入する。
// 未設定なら全関数が no-op（開発・stagingで誤計測しない）。
// 導入手順: .env.production に ID を追記 → 本番デプロイ のみ。コード変更不要。

const GA4_ID = import.meta.env.VITE_GA4_ID as string | undefined;
const META_PIXEL_ID = import.meta.env.VITE_META_PIXEL_ID as string | undefined;

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

let initialized = false;

/** アプリ起動時に一度だけ呼ぶ。IDが未設定なら何もしない */
export const initAnalytics = () => {
  if (initialized) return;
  initialized = true;

  if (GA4_ID) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) { window.dataLayer!.push(args); };
    window.gtag('js', new Date());
    // SPA なので初期 page_view は手動送信（send_page_view: false）
    window.gtag('config', GA4_ID, { send_page_view: false });
  }

  if (META_PIXEL_ID) {
    // Meta 公式スニペット相当（https://connect.facebook.net/en_US/fbevents.js）
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

/** SPA のルート遷移ごとに呼ぶ（App 側の useLocation エフェクトから） */
export const trackPageView = (path: string) => {
  if (GA4_ID && window.gtag) {
    window.gtag('event', 'page_view', { page_path: path });
  }
  if (META_PIXEL_ID && window.fbq) {
    window.fbq('track', 'PageView');
  }
};

/** 大会申し込み完了（コンバージョン）。EntryForm の完了画面表示時に呼ぶ */
export const trackEntryCompleted = (tournamentId: number, fee: number) => {
  if (GA4_ID && window.gtag) {
    window.gtag('event', 'entry_completed', {
      tournament_id: tournamentId,
      value: fee,
      currency: 'JPY',
    });
  }
  if (META_PIXEL_ID && window.fbq) {
    window.fbq('track', 'Lead', { value: fee, currency: 'JPY' });
  }
};
