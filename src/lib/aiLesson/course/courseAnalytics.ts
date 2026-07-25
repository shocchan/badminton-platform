// 学習アプリの計測（GA4/gtag が存在するときだけ発火・無ければ何もしない）。
// 命名は既存LP（view_ai_course_lp / begin_ai_course_consultation）に合わせて
// {verb}_ai_course_{noun} で統一。個人情報（名前・メール・発話内容）は送らない。

const onceSent = new Set<string>();

export function trackCourse(event: string, params?: Record<string, string | number | boolean>) {
  try {
    const w = window as unknown as { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
    if (typeof w.gtag === 'function') w.gtag('event', event, params || {});
    else if (Array.isArray(w.dataLayer)) w.dataLayer.push({ event, ...(params || {}) });
  } catch { /* noop */ }
}

/** 1セッション（ページ寿命）につき1回だけ送る（StrictMode二重実行にも安全） */
export function trackCourseOnce(event: string, params?: Record<string, string | number | boolean>) {
  if (onceSent.has(event)) return;
  onceSent.add(event);
  trackCourse(event, params);
}
