// クレジット決済の返金額。実際にお金が動く計算なので端数の扱いまで固定する。
import { describe, it, expect } from 'vitest';
import { CREDIT_CANCEL_FEE_RATE, calcCreditRefundAmount } from './payment';

describe('CREDIT_CANCEL_FEE_RATE', () => {
  it('キャンセル手数料率は10%（キャンセルポリシーの記載と一致させること）', () => {
    expect(CREDIT_CANCEL_FEE_RATE).toBe(0.10);
  });
});

describe('calcCreditRefundAmount: 返金額', () => {
  it('参加費の90%を返金する', () => {
    expect(calcCreditRefundAmount(1000)).toBe(900);
    expect(calcCreditRefundAmount(3000)).toBe(2700);
  });

  it('端数が出る場合は手数料を四捨五入して差し引く', () => {
    // 1500 * 0.1 = 150 → 1350
    expect(calcCreditRefundAmount(1500)).toBe(1350);
    // 1555 * 0.1 = 155.5 → 四捨五入で156 → 1399
    expect(calcCreditRefundAmount(1555)).toBe(1399);
  });

  it('0円なら0円', () => {
    expect(calcCreditRefundAmount(0)).toBe(0);
  });

  it('返金額が参加費を超えることはない', () => {
    for (const fee of [100, 600, 1000, 2500, 12000]) {
      expect(calcCreditRefundAmount(fee)).toBeLessThanOrEqual(fee);
      expect(calcCreditRefundAmount(fee)).toBeGreaterThanOrEqual(0);
    }
  });
});
