// 通常活動の定員・補欠・キャンセルの計算。金額と信用に直結するので網羅的に固定する。
import { describe, it, expect } from 'vitest';
import { calcRemaining, splitEntryQuantity } from './activityEntry';

describe('calcRemaining: 残り枠', () => {
  it('定員から確定人数を引く', () => {
    expect(calcRemaining(20, 8)).toBe(12);
  });

  it('ちょうど埋まったら0', () => {
    expect(calcRemaining(20, 20)).toBe(0);
  });

  it('定員を超えて確定していてもマイナスにならない', () => {
    expect(calcRemaining(20, 23)).toBe(0);
  });
});

describe('splitEntryQuantity: 確定と補欠の振り分け', () => {
  it('空きが十分なら全員確定', () => {
    expect(splitEntryQuantity(2, 20, 5)).toEqual({ confirmedQty: 2, waitlistQty: 0 });
  });

  it('空き枠をまたぐ申込は分割する（空き3枠に5人 → 確定3・補欠2）', () => {
    expect(splitEntryQuantity(5, 20, 17)).toEqual({ confirmedQty: 3, waitlistQty: 2 });
  });

  it('満員なら全員補欠', () => {
    expect(splitEntryQuantity(3, 20, 20)).toEqual({ confirmedQty: 0, waitlistQty: 3 });
  });

  it('定員オーバー状態でも確定枠を作らない', () => {
    expect(splitEntryQuantity(1, 20, 25)).toEqual({ confirmedQty: 0, waitlistQty: 1 });
  });

  it('最後の1枠にちょうど収まる', () => {
    expect(splitEntryQuantity(1, 20, 19)).toEqual({ confirmedQty: 1, waitlistQty: 0 });
  });

  it('負の申込人数は0として扱う', () => {
    expect(splitEntryQuantity(-1, 20, 0)).toEqual({ confirmedQty: 0, waitlistQty: 0 });
  });
});
