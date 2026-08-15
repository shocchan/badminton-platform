// 通常活動の申し込み・キャンセルにおける定員計算のロジック。
// UIコンポーネントから切り出して単体テストできるようにしている（ActivityPage.tsx から使用）。

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
