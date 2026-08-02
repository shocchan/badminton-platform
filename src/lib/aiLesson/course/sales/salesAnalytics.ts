// 販売ファネルの計測（§18）。
//
// 送ってよいイベント名と、送ってよいパラメータを**この1か所で決める**。
// 各画面が好きな名前で好きな値を送れる状態にすると、
// いずれ発話本文やメールが混ざる。混ざってから気づいても取り返せない。
//
// だから:
//   - イベント名は列挙型。ここに無い名前は送れない
//   - パラメータは許可リスト方式。**知らないキーは落とす**
//   - 値は数値・真偽・短い列挙のみ。自由記述を通さない

import { trackCourse } from '../courseAnalytics';

/** 販売ファネル（§18） */
export const SALES_FUNNEL_EVENTS = [
  'pricing_page_viewed',
  'plan_card_viewed',
  'plan_selected',
  'checkout_started',
  'checkout_completed',
  'checkout_failed',
  'entitlement_granted',
  'onboarding_started',
  'onboarding_completed',
] as const;

/** 60分パス（§18） */
export const HOUR_PASS_EVENTS = [
  'hour_pass_started',
  'first_10_minutes_completed',
  'hour_pass_paused',
  'hour_pass_resumed',
  'hour_pass_completed',
  'hour_pass_repurchase_selected',
  'hour_to_month_offer_viewed',
  'hour_to_month_selected',
] as const;

/** 1か月プラン（§18） */
export const MONTH_PLAN_EVENTS = [
  'month_plan_started',
  'day_2_returned',
  'day_7_active',
  'month_plan_completed',
  'month_to_coaching_offer_viewed',
  'coaching_consultation_selected',
] as const;

/** 自己解決（§18） */
export const SELF_SERVICE_EVENTS = [
  'help_viewed',
  'entitlement_resync_succeeded',
  'entitlement_resync_failed',
  'otp_resend_succeeded',
  'support_contacted',
] as const;

export const SALES_EVENTS = [
  ...SALES_FUNNEL_EVENTS,
  ...HOUR_PASS_EVENTS,
  ...MONTH_PLAN_EVENTS,
  ...SELF_SERVICE_EVENTS,
] as const;

export type SalesEvent = typeof SALES_EVENTS[number];

/**
 * 送ってよいパラメータ。
 * ここに無いキーは黙って落とす（例外にすると、計測のために画面が落ちる）。
 */
export const ALLOWED_PARAM_KEYS = [
  'plan_id', 'target_plan_id', 'rule_id', 'lang', 'mode',
  'plan_count', 'minutes', 'day', 'reason', 'outcome', 'repeat', 'from', 'step',
] as const;

export type AllowedParamKey = typeof ALLOWED_PARAM_KEYS[number];

export type SalesParamValue = string | number | boolean;

/**
 * 絶対に送らないもの（§18 送信禁止）。
 * 値の中身も検査する。キー名だけの検査だと `reason: "田中さんが…"` を通してしまう。
 */
export const FORBIDDEN_PARAM_KEYS = [
  'name', 'email', 'mail', 'address', 'phone', 'utterance', 'transcript',
  'message', 'text', 'audio', 'note', 'answer', 'history', 'content',
] as const;

/** 値がメール・長文・日本語の自由記述らしくないか */
export const isSafeValue = (v: SalesParamValue): boolean => {
  if (typeof v === 'number' || typeof v === 'boolean') return Number.isFinite(Number(v));
  const s = String(v);
  if (s.includes('@')) return false;              // メール
  if (s.length > 40) return false;                // 自由記述・発話本文
  if (/[。、！？]/.test(s)) return false;          // 文になっている
  return true;
};

/** 許可キーかつ安全な値だけを残す */
export const sanitizeParams = (
  params: Record<string, SalesParamValue> = {},
): Record<string, SalesParamValue> => {
  const out: Record<string, SalesParamValue> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!(ALLOWED_PARAM_KEYS as readonly string[]).includes(k)) continue;
    if ((FORBIDDEN_PARAM_KEYS as readonly string[]).some((f) => k.toLowerCase().includes(f))) continue;
    if (!isSafeValue(v)) continue;
    out[k] = v;
  }
  return out;
};

/**
 * 販売系イベントの送信口。**画面からは必ずこれを使う。**
 * 未知のイベント名は送らない（打ち間違いが黙って別イベントを作らない）。
 */
export const trackSales = (event: SalesEvent, params: Record<string, SalesParamValue> = {}): void => {
  if (!(SALES_EVENTS as readonly string[]).includes(event)) return;
  trackCourse(event, sanitizeParams(params));
};

// ─────────────────────────────────────────────────────────
// ファネルの読み方
// ─────────────────────────────────────────────────────────

export interface FunnelCounts {
  pricingPageViewed: number;
  planSelected: number;
  checkoutStarted: number;
  checkoutCompleted: number;
  entitlementGranted: number;
  onboardingCompleted: number;
}

export interface FunnelRates {
  /** 料金ページ → プラン選択 */
  viewToSelect: number;
  /** プラン選択 → 決済開始 */
  selectToCheckout: number;
  /** 決済開始 → 決済完了 */
  checkoutSuccess: number;
  /** 決済完了 → 利用権付与（**ここが1.0でないなら自動化が壊れている**） */
  grantAutomation: number;
  /** 利用権付与 → 学習開始 */
  activation: number;
}

const rate = (num: number, den: number): number => (den <= 0 ? 0 : num / den);

export const funnelRates = (c: FunnelCounts): FunnelRates => ({
  viewToSelect: rate(c.planSelected, c.pricingPageViewed),
  selectToCheckout: rate(c.checkoutStarted, c.planSelected),
  checkoutSuccess: rate(c.checkoutCompleted, c.checkoutStarted),
  grantAutomation: rate(c.entitlementGranted, c.checkoutCompleted),
  activation: rate(c.onboardingCompleted, c.entitlementGranted),
});

/**
 * 自動化が壊れていないか。
 * 決済が通ったのに利用権が付いていない件があれば、
 * それは「人が手で付けている」か「付いていない」のどちらかで、
 * どちらも雨ざらし市場モデルでは致命的（§4-3）。
 */
export const isGrantAutomationHealthy = (c: FunnelCounts): boolean =>
  c.checkoutCompleted === 0 || c.entitlementGranted >= c.checkoutCompleted;
