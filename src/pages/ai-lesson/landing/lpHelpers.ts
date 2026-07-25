// 販売LP 共有ヘルパー（非コンポーネント）
// ※ fast-refresh 規約のため、コンポーネントと同居させない。

/** 画像URL（public/images/ai-course 配下） */
export const imgUrl = (name: string) => `/images/ai-course/${name}.webp`;

/** GA4/Meta 計測（存在時のみ発火。無ければ黙って何もしない） */
export function track(event: string, params?: Record<string, unknown>) {
  try {
    const w = window as unknown as { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
    if (typeof w.gtag === 'function') w.gtag('event', event, params || {});
    else if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event, ...(params || {}) });
  } catch { /* noop */ }
}
