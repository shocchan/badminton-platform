// 通常活動の申し込み・キャンセルにおける定員計算のロジック。
// UIコンポーネントから切り出して単体テストできるようにしている（ActivityPage.tsx から使用）。

export interface QuantityRow {
  id: string;
  quantity: number;
}

/** 残り枠。定員を超えて申し込まれていてもマイナスにはしない */
export const calcRemaining = (capacity: number, confirmedCount: number): number =>
  Math.max(0, capacity - confirmedCount);

/**
 * 申込人数を「確定」と「補欠」に振り分ける。
 * 空きが3枠のところに5人で申し込んだ場合は 確定3・補欠2 のように分割する。
 */
export const splitEntryQuantity = (
  qty: number,
  capacity: number,
  confirmedCount: number
): { confirmedQty: number; waitlistQty: number } => {
  const requested = Math.max(0, qty);
  const confirmedQty = Math.min(requested, calcRemaining(capacity, confirmedCount));
  return { confirmedQty, waitlistQty: requested - confirmedQty };
};

export interface CancelAction {
  id: string;
  /** delete = 行ごと削除、decrement = 人数を減らす */
  type: 'delete' | 'decrement';
  /** decrement のときの残り人数 */
  nextQuantity?: number;
}

/**
 * キャンセル人数を、申込行に対して先頭から順に割り当てる。
 * 呼び出し側は status の降順（補欠が先）で行を渡すことで、補欠から先に取り消す。
 * 申込総数より多くキャンセルしようとした場合は、あるぶんだけ取り消す。
 */
export const planCancellation = (rows: QuantityRow[], cancelQty: number): CancelAction[] => {
  const actions: CancelAction[] = [];
  let remaining = Math.max(0, cancelQty);
  for (const row of rows) {
    if (remaining <= 0) break;
    const toRemove = Math.min(remaining, row.quantity);
    remaining -= toRemove;
    if (toRemove >= row.quantity) {
      actions.push({ id: row.id, type: 'delete' });
    } else {
      actions.push({ id: row.id, type: 'decrement', nextQuantity: row.quantity - toRemove });
    }
  }
  return actions;
};

/** キャンセル後に残る申込人数（0未満にはしない） */
export const remainingAfterCancel = (rows: QuantityRow[], cancelQty: number): number => {
  const total = rows.reduce((s, r) => s + r.quantity, 0);
  return Math.max(0, total - Math.max(0, cancelQty));
};
