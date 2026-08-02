// @vitest-environment jsdom
// 計測と採算の受入テスト（§16 §18 §20）。
// gtag の送信を確かめるため jsdom で動かす。

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  SALES_EVENTS, SALES_FUNNEL_EVENTS, HOUR_PASS_EVENTS, MONTH_PLAN_EVENTS, SELF_SERVICE_EVENTS,
  sanitizeParams, isSafeValue, trackSales, funnelRates, isGrantAutomationHealthy,
} from './salesAnalytics';
import {
  computePlanEconomics, worstCaseUnitEconomics, emptyAggregate, conversionRates,
  warningMessage, DEFAULT_COST_RATES, DEFAULT_THRESHOLDS,
} from './unitEconomics';
import { salesPlanById } from './planConfig';

afterEach(() => { delete (window as unknown as { gtag?: unknown }).gtag; });

// ─────────────────────────────────────────────────────────
// §18 計測
// ─────────────────────────────────────────────────────────

describe('§18 イベント名がすべて定義されている', () => {
  it('販売ファネル9件', () => {
    expect([...SALES_FUNNEL_EVENTS]).toEqual([
      'pricing_page_viewed', 'plan_card_viewed', 'plan_selected',
      'checkout_started', 'checkout_completed', 'checkout_failed',
      'entitlement_granted', 'onboarding_started', 'onboarding_completed',
    ]);
  });

  it('60分パス8件', () => {
    for (const e of ['hour_pass_started', 'first_10_minutes_completed', 'hour_pass_paused',
                     'hour_pass_resumed', 'hour_pass_completed', 'hour_pass_repurchase_selected',
                     'hour_to_month_offer_viewed', 'hour_to_month_selected']) {
      expect([...HOUR_PASS_EVENTS]).toContain(e);
    }
  });

  it('1か月プラン6件', () => {
    for (const e of ['month_plan_started', 'day_2_returned', 'day_7_active', 'month_plan_completed',
                     'month_to_coaching_offer_viewed', 'coaching_consultation_selected']) {
      expect([...MONTH_PLAN_EVENTS]).toContain(e);
    }
  });

  it('自己解決4件（失敗の記録も持つ）', () => {
    for (const e of ['help_viewed', 'entitlement_resync_succeeded', 'otp_resend_succeeded', 'support_contacted']) {
      expect([...SELF_SERVICE_EVENTS]).toContain(e);
    }
  });

  it('イベント名が重複しない', () => {
    expect(new Set(SALES_EVENTS).size).toBe(SALES_EVENTS.length);
  });
});

describe('§18 送信禁止のものを送らない', () => {
  it('氏名・メール・会話本文・自由記述を落とす', () => {
    const cleaned = sanitizeParams({
      plan_id: 'ai-hour-pass',
      name: '田中',
      email: 'a@example.com',
      utterance: 'きのう友だちと話しました',
      transcript: 'こんにちは',
      message: '長い問い合わせ本文',
    } as never);
    expect(Object.keys(cleaned)).toEqual(['plan_id']);
  });

  it('許可キーでも、値がメール・文章なら落とす', () => {
    expect(sanitizeParams({ reason: 'user@example.com' })).toEqual({});
    expect(sanitizeParams({ reason: 'カードが使えませんでした。' })).toEqual({});
    expect(sanitizeParams({ reason: 'card_declined' })).toEqual({ reason: 'card_declined' });
  });

  it('値の安全判定', () => {
    expect(isSafeValue('ai-month')).toBe(true);
    expect(isSafeValue(42)).toBe(true);
    expect(isSafeValue(true)).toBe(true);
    expect(isSafeValue('a@b.com')).toBe(false);
    expect(isSafeValue('あ'.repeat(41))).toBe(false);
    expect(isSafeValue('今日は勉強しました。')).toBe(false);
  });

  it('未知のイベント名は送らない（打ち間違いが別イベントを作らない）', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    trackSales('checkout_completed' as never, { plan_id: 'ai-month' });
    trackSales('checkout_complete' as never, { plan_id: 'ai-month' });   // 打ち間違い
    expect(gtag.mock.calls.map((c) => c[1])).toEqual(['checkout_completed']);
  });

  it('送信時にもパラメータが濾される', () => {
    const gtag = vi.fn();
    (window as unknown as { gtag: unknown }).gtag = gtag;
    trackSales('plan_selected', { plan_id: 'ai-month', email: 'x@y.z' } as never);
    expect(gtag.mock.calls[0][2]).toEqual({ plan_id: 'ai-month' });
  });
});

describe('ファネルの読み方', () => {
  const counts = {
    pricingPageViewed: 1000, planSelected: 120, checkoutStarted: 80,
    checkoutCompleted: 60, entitlementGranted: 60, onboardingCompleted: 48,
  };

  it('各段の率が出る', () => {
    const r = funnelRates(counts);
    expect(r.viewToSelect).toBeCloseTo(0.12);
    expect(r.checkoutSuccess).toBeCloseTo(0.75);
    expect(r.grantAutomation).toBe(1);
    expect(r.activation).toBeCloseTo(0.8);
  });

  it('分母0でも壊れない', () => {
    const r = funnelRates({ pricingPageViewed: 0, planSelected: 0, checkoutStarted: 0, checkoutCompleted: 0, entitlementGranted: 0, onboardingCompleted: 0 });
    expect(Object.values(r).every((v) => v === 0)).toBe(true);
  });

  it('決済したのに利用権が付いていない状態を検出する（自動化の崩れ）', () => {
    expect(isGrantAutomationHealthy(counts)).toBe(true);
    expect(isGrantAutomationHealthy({ ...counts, entitlementGranted: 59 })).toBe(false);
    // まだ1件も売れていないときは「壊れている」と言わない
    expect(isGrantAutomationHealthy({ ...counts, checkoutCompleted: 0, entitlementGranted: 0 })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────
// §16 採算
// ─────────────────────────────────────────────────────────

describe('§16 600円でも利益が残るか（最悪ケース）', () => {
  it('60分パスは、上限まで使い切られても黒字', () => {
    const e = worstCaseUnitEconomics('ai-hour-pass');
    expect(e.netRevenueJpy).toBe(salesPlanById('ai-hour-pass')!.priceAmount);
    expect(e.grossProfitJpy).toBeGreaterThan(0);
    expect(e.grossMargin).toBeGreaterThan(DEFAULT_THRESHOLDS.grossMarginWarn);
    expect(e.warnings).toEqual([]);
  });

  it('1か月プランも、上限まで使い切られても黒字', () => {
    const e = worstCaseUnitEconomics('ai-month');
    expect(e.grossProfitJpy).toBeGreaterThan(0);
    expect(e.grossMargin).toBeGreaterThan(DEFAULT_THRESHOLDS.grossMarginWarn);
  });

  it('原価の内訳が分かる（何が粗利を食っているか追える）', () => {
    const e = worstCaseUnitEconomics('ai-hour-pass');
    expect(e.paymentFeeJpy).toBeGreaterThan(0);
    expect(e.voiceCostJpy).toBeGreaterThan(0);
    expect(e.infraCostJpy).toBeGreaterThan(0);
    expect(e.totalCostJpy).toBe(e.paymentFeeJpy + e.apiCostJpy + e.infraCostJpy + e.manualSupportCostJpy);
  });

  it('音声上限を外すと赤字になる＝上限が採算の要であることを示す', () => {
    const plan = salesPlanById('ai-hour-pass')!;
    const noCap = computePlanEconomics({
      ...emptyAggregate('ai-hour-pass'),
      purchases: 1,
      revenueJpy: plan.priceAmount,
      voiceMinutesUsed: 60,       // 60分ぜんぶ音声会話に使われたら
      aiReportsGenerated: 3,
    });
    expect(noCap.grossProfitJpy).toBeLessThan(0);
    expect(noCap.warnings).toContain('api_cost_too_high');
  });
});

describe('§16 手動対応が採算悪化として見える', () => {
  const plan = salesPlanById('ai-hour-pass')!;
  const base = {
    ...emptyAggregate('ai-hour-pass'),
    purchases: 10,
    repurchases: 3,
    revenueJpy: plan.priceAmount * 10,
    voiceMinutesUsed: 60,
    aiReportsGenerated: 20,
  };

  it('人が動いていなければ健全', () => {
    const e = computePlanEconomics(base);
    expect(e.grossProfitJpy).toBeGreaterThan(0);
    expect(e.warnings).toEqual([]);
  });

  it('1件のメール往復（10分）で、10件ぶんの粗利が大きく削られる', () => {
    const withSupport = computePlanEconomics({
      ...base, manualSupportCases: 1, manualSupportMinutes: 10,
    });
    const without = computePlanEconomics(base);
    expect(withSupport.manualSupportCostJpy).toBe(500);
    expect(withSupport.grossProfitJpy).toBe(without.grossProfitJpy - 500);
    // 「売れている」ではなく採算悪化として警告に出る
    expect(withSupport.warnings).toContain('too_much_manual_support');
  });

  it('人の対応は件数と時間の両方が残る', () => {
    const e = computePlanEconomics({ ...base, manualSupportCases: 2, manualSupportMinutes: 25 });
    expect(e.manualSupportCases).toBe(2);
    expect(e.manualSupportMinutes).toBe(25);
  });
});

describe('§16 しきい値は設定であって、コードに埋めた利益率ではない', () => {
  it('しきい値を変えると判定が変わる', () => {
    const plan = salesPlanById('ai-hour-pass')!;
    const agg = { ...emptyAggregate('ai-hour-pass'), purchases: 1, revenueJpy: plan.priceAmount,
                  voiceMinutesUsed: 10, aiReportsGenerated: 3, repurchases: 1 };
    const lenient = computePlanEconomics(agg, DEFAULT_COST_RATES, { ...DEFAULT_THRESHOLDS, grossMarginWarn: 0.1 });
    const strict = computePlanEconomics(agg, DEFAULT_COST_RATES, { ...DEFAULT_THRESHOLDS, grossMarginWarn: 0.95 });
    expect(lenient.warnings).not.toContain('gross_margin_too_low');
    expect(strict.warnings).toContain('gross_margin_too_low');
  });

  it('為替を変えると原価が動く（想定値であることが分かる形）', () => {
    const a = worstCaseUnitEconomics('ai-hour-pass', DEFAULT_COST_RATES);
    const b = worstCaseUnitEconomics('ai-hour-pass', { ...DEFAULT_COST_RATES, jpyPerUsd: 200 });
    expect(b.apiCostJpy).toBeGreaterThan(a.apiCostJpy);
  });
});

describe('§16 その他の指標', () => {
  it('決済失敗率・再購入率が出る', () => {
    const plan = salesPlanById('ai-hour-pass')!;
    const e = computePlanEconomics({
      ...emptyAggregate('ai-hour-pass'),
      purchases: 24, failedPayments: 6, repurchases: 12,
      revenueJpy: plan.priceAmount * 24, voiceMinutesUsed: 120, aiReportsGenerated: 48,
    });
    expect(e.paymentFailureRate).toBeCloseTo(0.2);
    expect(e.repurchaseRate).toBeCloseTo(0.5);
    expect(e.warnings).toContain('payment_failure_rate_high');
  });

  it('母数が足りないうちは率の警告を出さない（判定できないだけ、を警告にしない）', () => {
    const plan = salesPlanById('ai-hour-pass')!;
    const tiny = computePlanEconomics({
      ...emptyAggregate('ai-hour-pass'),
      purchases: 2, failedPayments: 2, repurchases: 0,
      revenueJpy: plan.priceAmount * 2, voiceMinutesUsed: 10, aiReportsGenerated: 4,
    });
    expect(tiny.warnings).not.toContain('repurchase_rate_low');
    expect(tiny.warnings).not.toContain('payment_failure_rate_high');
  });

  it('返金は売上から引かれる', () => {
    const plan = salesPlanById('ai-hour-pass')!;
    const e = computePlanEconomics({
      ...emptyAggregate('ai-hour-pass'),
      purchases: 2, revenueJpy: plan.priceAmount * 2, refunds: 1, refundedJpy: plan.priceAmount,
    });
    expect(e.netRevenueJpy).toBe(plan.priceAmount);
  });

  it('売上0のときに「粗利率0%」を警告にしない（判定できないだけ）', () => {
    expect(computePlanEconomics(emptyAggregate('ai-hour-pass')).warnings).toEqual([]);
  });

  it('転換率は、分母が無ければ「まだ判定できない」を返す', () => {
    expect(conversionRates({ hourPassPurchases: 0, hourToMonthConversions: 0, monthPurchases: 0, coachingConsultations: 0 }))
      .toEqual({ hourToMonth: null, monthToCoachingConsultation: null });
    const r = conversionRates({ hourPassPurchases: 20, hourToMonthConversions: 3, monthPurchases: 10, coachingConsultations: 2 });
    expect(r.hourToMonth).toBeCloseTo(0.15);
    expect(r.monthToCoachingConsultation).toBeCloseTo(0.2);
  });

  it('警告に、次に何をするかが書かれている', () => {
    for (const w of ['api_cost_too_high', 'gross_margin_too_low', 'too_much_manual_support',
                     'payment_failure_rate_high', 'repurchase_rate_low'] as const) {
      expect(warningMessage(w).length).toBeGreaterThan(15);
    }
    expect(warningMessage('too_much_manual_support')).toContain('採算が悪化');
  });
});
