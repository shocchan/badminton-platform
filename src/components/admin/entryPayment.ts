// 大会エントリーの入金まわりの判定（2026-08-24）。
//
// 【なぜ切り出すか】
// 「誰が未入金か」の定義は、稼働中の自動督促（payment-reminder / pg_cron・毎日10:00 JST）と
// 一字一句そろっていないと意味がない。ずれると「画面では入金済みなのに督促メールが飛ぶ」
// （またはその逆）が起きる。AdminPage.tsx の中に埋めるとテストで固定できないので、
// 判定だけをここに出してテストで縛る。
//
// 督促側の対象条件（supabase/functions/payment-reminder/index.ts）:
//   status が 'confirmed' または未設定（NULL）
//   × 大会が payment_required = true
//   × payment_status <> 'completed'（NULLを含む）
//
// ⚠️ 対象は「大会（tournaments / entries）」だけ。通常活動（activities）の料金は
//    アナログ運用のままで、ここには一切つながっていない。

import type { Entry } from '../../types';

// payment_status には 'refunded'（キャンセル時の返金）が実際に入る。
// 共有の Entry 型はまだ 'refunded' を持たないため、この画面用に広げて扱う。
export type EntryPaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type EntryWithTournament = Omit<Entry, 'payment_status'> & {
  payment_status?: EntryPaymentStatus | null;
  tournaments?: {
    title: string;
    payment_required?: boolean;
    payment_deadline?: string | null;
    entry_fee?: number;
  };
};

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  credit: 'カード',
  paypay: 'PayPay',
  // WeChat Pay / Alipay（Stripe の決済画面へ遷移する方式）
  wechat_alipay: 'WeChat/Alipay',
  // 銀行振込は2026-08-28に受付終了。過去の申し込みの表示用に残す
  bank: '銀行振込',
};

export const paymentMethodLabel = (m?: string | null): string =>
  m ? PAYMENT_METHOD_LABEL[m] ?? m : '未選択';

/** 支払い期限までの残り日数。マイナスなら超過。期限未設定は null。 */
export const daysToDeadline = (deadline?: string | null, now: Date = new Date()): number | null => {
  if (!deadline) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const due = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(due)) return null;
  return Math.round((due - today) / 86400000);
};

/** 入金管理の対象か（支払い必須の大会 × 参加確定）。待機・取消は対象外。 */
export const needsPayment = (e: EntryWithTournament): boolean =>
  !!e.tournaments?.payment_required && (!e.status || e.status === 'confirmed');

/** 督促の対象＝未入金。督促側の条件をそのまま写している。 */
export const isUnpaid = (e: EntryWithTournament): boolean =>
  needsPayment(e) && e.payment_status !== 'completed';

/** 入金列に出すバッジの中身。null なら支払い管理の対象外（「-」を出す）。 */
export const paymentBadge = (
  e: EntryWithTournament
): { tone: 'paid' | 'refunded' | 'unpaid'; label: string } | null => {
  if (!needsPayment(e)) return null;
  const method = e.payment_method ? `・${paymentMethodLabel(e.payment_method)}` : '';
  if (e.payment_status === 'completed') return { tone: 'paid', label: `入金済${method}` };
  if (e.payment_status === 'refunded') return { tone: 'refunded', label: `返金済${method}` };
  return { tone: 'unpaid', label: `未入金・${paymentMethodLabel(e.payment_method)}` };
};

/** 期限の注意書き。出すものが無ければ null。 */
export const deadlineNote = (
  e: EntryWithTournament,
  now: Date = new Date()
): { tone: 'over' | 'soon' | 'unset'; text: string } | null => {
  if (!isUnpaid(e)) return null;
  const d = daysToDeadline(e.tournaments?.payment_deadline, now);
  if (d === null) return { tone: 'unset', text: '期限未設定' };
  if (d < 0) return { tone: 'over', text: `${-d}日超過` };
  if (d <= 3) return { tone: 'soon', text: `あと${d}日` };
  return null;
};

/** CSV用の入金状況（支払い不要の大会は空欄ではなく「支払い不要」と書き切る）。 */
export const paymentCsvCells = (e: EntryWithTournament): [string, string] => {
  if (!needsPayment(e)) return ['', '支払い不要'];
  const status =
    e.payment_status === 'completed' ? '入金済'
    : e.payment_status === 'refunded' ? '返金済'
    : '未入金';
  return [paymentMethodLabel(e.payment_method), status];
};
