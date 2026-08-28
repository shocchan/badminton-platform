// 販売LP 共有ヘルパー（非コンポーネント）
// ※ fast-refresh 規約のため、コンポーネントと同居させない。
import { trackEvent } from '../../../lib/analytics';
import { recordFunnel, analyticsTouchParams, type FunnelKind } from '../../../lib/aiLesson/course/attribution';

/**
 * GA4のイベント名 → 自前ファネルの kind（2026-08-26 Phase S1）。
 *
 * 仕様が求める13イベントのほとんどは、既にGA4側に同じ意味の名前がある。
 * **新しい名前を並べて二重計上にしない**ため、既存名を正としてここで対応づける。
 * 対応表に無いGA4イベントは、GA4にだけ送られる（ファネルには積まれない）。
 *
 *   view_ai_course_lp            → lp_view
 *   click_ai_course_to_pricing   → cta_click（価格へ送る系のCTAはすべてこれ）
 *   click_ai_course_fit_to_pricing → cta_click
 *   click_ai_course_consultation → cta_click
 *   begin_checkout               → plan により trial_/monthly_checkout_start（下で分岐）
 *   begin_ai_course_application  → six_month_checkout_start
 *   purchase                     → purchase
 */
const FUNNEL_BY_EVENT: Record<string, FunnelKind> = {
  view_ai_course_lp: 'lp_view',
  click_ai_course_to_pricing: 'cta_click',
  click_ai_course_fit_to_pricing: 'cta_click',
  click_ai_course_consultation: 'cta_click',
  click_ai_course_see_system: 'cta_click',
  begin_ai_course_application: 'six_month_checkout_start',
  purchase: 'purchase',
};

/** begin_checkout は商品で分かれる。6か月はcheckoutを通らないのでここには来ない */
const checkoutKindFor = (plan: unknown): FunnelKind | null => {
  if (plan === 'ai-trial-pass') return 'trial_checkout_start';
  if (plan === 'ai-month') return 'monthly_checkout_start';
  if (plan === 'coach-6m') return 'six_month_checkout_start';
  return null;
};

/** 画像URL（public/images/ai-course 配下） */
export const imgUrl = (name: string) => `/images/ai-course/${name}.webp`;

/**
 * LPイベント計測。lib/analytics 経由で送る（表示言語とUTMが自動付与される。
 * GA4未設定・計測対象外ブラウザでは黙って何もしない）。
 * **個人情報（名前・メール・WeChat ID）を params に入れないこと。**
 */
export function track(event: string, params?: Record<string, unknown>) {
  try {
    // GA4には流入元も添える（source/medium/campaignまで。anon_idや個人情報は送らない）
    trackEvent(event, { ...(params || {}), ...analyticsTouchParams() });
  } catch { /* noop */ }
  try {
    const kind = event === 'begin_checkout'
      ? checkoutKindFor(params?.plan)
      : FUNNEL_BY_EVENT[event] ?? null;
    if (!kind) return;
    recordFunnel(kind, {
      planId: typeof params?.plan === 'string' ? params.plan : null,
      locale: typeof params?.lang === 'string' ? params.lang : null,
      loggedIn: false,   // LPは未ログイン前提の画面
    });
  } catch { /* 計測の失敗で画面を壊さない */ }
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
