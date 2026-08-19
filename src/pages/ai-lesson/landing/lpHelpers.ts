// 販売LP 共有ヘルパー（非コンポーネント）
// ※ fast-refresh 規約のため、コンポーネントと同居させない。
import { trackEvent } from '../../../lib/analytics';

/** 画像URL（public/images/ai-course 配下） */
export const imgUrl = (name: string) => `/images/ai-course/${name}.webp`;

/**
 * LPイベント計測。lib/analytics 経由で送る（表示言語とUTMが自動付与される。
 * GA4未設定・計測対象外ブラウザでは黙って何もしない）。
 * **個人情報（名前・メール・WeChat ID）を params に入れないこと。**
 */
export function track(event: string, params?: Record<string, unknown>) {
  try {
    trackEvent(event, params || {});
  } catch { /* noop */ }
}

/**
 * ページ内セクションへのスムーズスクロール。
 * - URL・履歴は変えない（hashを使わない）。相談モーダルやログインURLと状態が混ざらないように
 * - 固定ヘッダー分は各セクションの scroll-mt-* が確保する
 * - reduced-motion 環境では即時ジャンプ
 */
export function scrollToSection(id: string) {
  try {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  } catch { /* noop */ }
}

/**
 * 受講者ログインのURL（LPと分離した専用ルート）。
 * ?v2=1（V2招待印）で来た人がログインへ進んでも招待印を失わせない。
 */
export function loginPath(lang: string): string {
  const v2 = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).has('v2');
  return `/${lang}/ai-course/login${v2 ? '?v2=1' : ''}`;
}
