// AIコスト残高の計算テスト（2026-08-19 CEO指示）。
// 「補充したら増えたと確認できる」の実体は topups合計 − 全期間の推定使用。
import { describe, it, expect } from 'vitest';
import { costBalanceOf, type CostTopupRow } from './courseAdminApi';

const tp = (amountUsd: number): CostTopupRow =>
  ({ id: String(Math.abs(amountUsd)), amountUsd, note: null, createdAtISO: '2026-08-19T00:00:00Z' });

describe('AIコスト残高', () => {
  it('残り = チャージ合計 − 使用合計', () => {
    const b = costBalanceOf([tp(50), tp(20)], 12.34);
    expect(b.topupTotal).toBeCloseTo(70);
    expect(b.spent).toBeCloseTo(12.34);
    expect(b.remaining).toBeCloseTo(57.66);
  });
  it('チャージを追加すると残りが増える（補充の確認）', () => {
    const before = costBalanceOf([tp(50)], 30);
    const after = costBalanceOf([tp(50), tp(25)], 30);
    expect(after.remaining - before.remaining).toBeCloseTo(25);
  });
  it('使いすぎはマイナスで正直に出す（0に丸めない）', () => {
    expect(costBalanceOf([tp(10)], 15).remaining).toBeCloseTo(-5);
  });
  it('記録が無ければ合計0（何も無いのに残高があるように見せない）', () => {
    expect(costBalanceOf([], 5).topupTotal).toBe(0);
  });
});
