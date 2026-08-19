// セルフサービス決済のクライアント側ゲートのテスト。
//
// いちばん守りたいのは:
// 1. **環境変数が無ければ決済へ進めない**（off が既定＝Stripe未設定でLPが壊れない）
// 2. **人間レッスンを含む商品は決済対象にならない**（6か月コースの無人決済を作らない）
import { describe, it, expect } from 'vitest';
import { checkoutMode, isSelfCheckoutPlan, canStartCheckout } from './planCheckout';
import { planById } from './planCatalog';

describe('checkoutMode（環境ゲート）', () => {
  it('**未設定の既定は off**（このテスト環境に VITE_AI_COURSE_CHECKOUT は無い）', () => {
    expect(checkoutMode()).toBe('off');
  });
});

describe('決済対象の判定', () => {
  it('600円・2,980円プランは商品条件を満たす', () => {
    expect(isSelfCheckoutPlan(planById('ai-trial-pass')!)).toBe(true);
    expect(isSelfCheckoutPlan(planById('ai-month')!)).toBe(true);
  });

  it('**6か月コース（人間レッスン入り）は決済対象にならない**', () => {
    expect(isSelfCheckoutPlan(planById('coach-6m')!)).toBe(false);
    // ctaMode を無理に checkout にしても lessonCount で拒否される（二重の防壁）
    expect(isSelfCheckoutPlan({ ...planById('coach-6m')!, ctaMode: 'checkout' })).toBe(false);
  });

  it('価格未確定（priceJpy null）や日数未定義の商品は決済対象にならない', () => {
    const base = planById('ai-month')!;
    expect(isSelfCheckoutPlan({ ...base, priceJpy: null })).toBe(false);
    expect(isSelfCheckoutPlan({ ...base, accessDays: null })).toBe(false);
    expect(isSelfCheckoutPlan({ ...base, status: 'paused' })).toBe(false);
  });

  it('**off のあいだは canStartCheckout が常に false**（applyフォールバックに落ちる）', () => {
    expect(canStartCheckout(planById('ai-trial-pass')!)).toBe(false);
    expect(canStartCheckout(planById('ai-month')!)).toBe(false);
  });
});
