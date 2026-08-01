// 通常活動の定員・補欠・キャンセルの計算。金額と信用に直結するので網羅的に固定する。
import { describe, it, expect } from 'vitest';
import {
  calcRemaining,
  splitEntryQuantity,
  planCancellation,
  remainingAfterCancel,
} from './activityEntry';

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

describe('planCancellation: キャンセルの割り当て', () => {
  it('1行ぶんちょうど取り消すなら行ごと削除', () => {
    expect(planCancellation([{ id: 'a', quantity: 2 }], 2)).toEqual([{ id: 'a', type: 'delete' }]);
  });

  it('一部だけ取り消すなら人数を減らす', () => {
    expect(planCancellation([{ id: 'a', quantity: 3 }], 1)).toEqual([
      { id: 'a', type: 'decrement', nextQuantity: 2 },
    ]);
  });

  it('複数行にまたがるときは先頭から消費する', () => {
    expect(
      planCancellation([{ id: 'w', quantity: 2 }, { id: 'c', quantity: 3 }], 4)
    ).toEqual([
      { id: 'w', type: 'delete' },
      { id: 'c', type: 'decrement', nextQuantity: 1 },
    ]);
  });

  it('必要な行だけ触り、それ以降の行には手を出さない', () => {
    const actions = planCancellation(
      [{ id: 'a', quantity: 1 }, { id: 'b', quantity: 5 }],
      1
    );
    expect(actions).toEqual([{ id: 'a', type: 'delete' }]);
  });

  it('申込総数より多くキャンセルしてもある分しか消さない', () => {
    expect(planCancellation([{ id: 'a', quantity: 2 }], 99)).toEqual([
      { id: 'a', type: 'delete' },
    ]);
  });

  it('キャンセル0件なら何もしない', () => {
    expect(planCancellation([{ id: 'a', quantity: 2 }], 0)).toEqual([]);
  });
});

describe('remainingAfterCancel: キャンセル後の残り人数', () => {
  it('一部キャンセル', () => {
    expect(remainingAfterCancel([{ id: 'a', quantity: 3 }], 1)).toBe(2);
  });

  it('全部キャンセルなら0', () => {
    expect(remainingAfterCancel([{ id: 'a', quantity: 2 }, { id: 'b', quantity: 1 }], 3)).toBe(0);
  });

  it('多くキャンセルしてもマイナスにならない', () => {
    expect(remainingAfterCancel([{ id: 'a', quantity: 2 }], 5)).toBe(0);
  });
});
