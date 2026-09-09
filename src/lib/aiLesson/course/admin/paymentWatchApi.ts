// 決済観測データの取得（管理者のみ・読み取り専用）。
// 判定ロジックは paymentWatch.ts（純関数）。ここは取得と型合わせだけ。
import { supabase } from '../../../../services/supabaseClient';
import type {
  PaymentWatch, PaymentSessionRow, PaymentEventRow, PurchaseStatus,
} from './paymentWatch';

const STATUSES: PurchaseStatus[] = [
  'pending', 'awaiting_payment', 'paid', 'provisioned', 'expired', 'failed', 'refunded',
];
const statusOf = (v: unknown): PurchaseStatus =>
  STATUSES.includes(v as PurchaseStatus) ? (v as PurchaseStatus) : 'pending';

const OUTCOMES: PaymentEventRow['outcome'][] = [
  'received', 'handled', 'ignored', 'waiting', 'error', 'signature_failed',
];
const outcomeOf = (v: unknown): PaymentEventRow['outcome'] =>
  OUTCOMES.includes(v as PaymentEventRow['outcome']) ? (v as PaymentEventRow['outcome']) : 'ignored';

type RawSession = Record<string, unknown>;
type RawEvent = Record<string, unknown>;

const toSession = (r: RawSession): PaymentSessionRow => ({
  sessionRef: String(r.sessionRef ?? ''),
  createdAtISO: String(r.createdAt ?? ''),
  updatedAtISO: String(r.updatedAt ?? ''),
  planId: String(r.planId ?? ''),
  amountJpy: Number(r.amountJpy ?? 0),
  locale: String(r.locale ?? 'ja'),
  status: statusOf(r.status),
  livemode: !!r.livemode,
  isTest: !!r.isTest,
  paymentMethod: r.paymentMethod ? String(r.paymentMethod) : null,
  hasPaymentIntent: !!r.hasPaymentIntent,
  hasBuyerEmail: !!r.hasBuyerEmail,
  provisioned: !!r.provisioned,
  loginClaimed: !!r.loginClaimed,
  error: String(r.error ?? ''),
  webhookCount: Number(r.webhookCount ?? 0),
});

const toEvent = (r: RawEvent): PaymentEventRow => ({
  receivedAtISO: String(r.receivedAt ?? ''),
  eventType: String(r.eventType ?? 'unknown'),
  sessionRef: r.sessionRef ? String(r.sessionRef) : null,
  paymentStatus: r.paymentStatus ? String(r.paymentStatus) : null,
  paymentMethod: r.paymentMethod ? String(r.paymentMethod) : null,
  livemode: typeof r.livemode === 'boolean' ? r.livemode : null,
  outcome: outcomeOf(r.outcome),
  detail: String(r.detail ?? ''),
});

/**
 * 決済の観測データ。管理者以外は RPC 側で forbidden になる。
 * 失敗したら null を返す（画面は「読み込めませんでした」を出す。空データを成功に見せない）。
 */
export const fetchPaymentWatch = async (days = 30): Promise<PaymentWatch | null> => {
  const { data, error } = await supabase.rpc('ai_admin_payment_watch', { p_days: days });
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  const d = data as {
    since?: string;
    sessions?: RawSession[];
    events?: RawEvent[];
    totals?: Record<string, unknown>;
  };
  return {
    sinceISO: String(d.since ?? ''),
    sessions: (d.sessions ?? []).map(toSession),
    events: (d.events ?? []).map(toEvent),
    totals: {
      sessions: Number(d.totals?.sessions ?? 0),
      provisioned: Number(d.totals?.provisioned ?? 0),
      webhookEvents: Number(d.totals?.webhookEvents ?? 0),
      webhookEventsEver: Number(d.totals?.webhookEventsEver ?? 0),
    },
  };
};
