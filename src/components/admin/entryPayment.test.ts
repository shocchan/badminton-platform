// 入金判定は、稼働中の自動督促（payment-reminder / pg_cron・毎日10:00 JST）と
// 同じ条件でなければならない（2026-08-24）。
//
// ずれると「画面では入金済みなのに督促メールが飛ぶ」「未入金なのに誰も気づかない」が起きる。
// 督促側（supabase/functions/payment-reminder/index.ts）の対象条件:
//   status が 'confirmed' または NULL × tournaments.payment_required × payment_status <> 'completed'
import { describe, it, expect } from 'vitest';
import {
  daysToDeadline,
  deadlineNote,
  isUnpaid,
  needsPayment,
  paymentBadge,
  paymentCsvCells,
  paymentMethodLabel,
  type EntryWithTournament,
} from './entryPayment';

const entry = (over: Partial<EntryWithTournament> = {}): EntryWithTournament => ({
  id: 1,
  tournament_id: 1,
  name: 'テスト太郎',
  phone: '090-0000-0000',
  email: 't@example.com',
  entry_date: '2026-08-01',
  created_at: '2026-08-01T00:00:00Z',
  status: 'confirmed',
  payment_method: 'bank',
  payment_status: 'pending',
  tournaments: { title: '第29回', payment_required: true, payment_deadline: '2026-08-30' },
  ...over,
});

describe('入金管理の対象（督促と同じ条件）', () => {
  it('支払い必須の大会 × 参加確定 が対象', () => {
    expect(needsPayment(entry())).toBe(true);
  });

  it('status未設定の古いレコードも確定扱いで対象（督促側と同じ扱い）', () => {
    expect(needsPayment(entry({ status: undefined as unknown as EntryWithTournament['status'] }))).toBe(true);
  });

  it('キャンセル待ちはまだ支払いを求めていないので対象外', () => {
    expect(needsPayment(entry({ status: 'waitlist' }))).toBe(false);
  });

  it('取消済みは対象外', () => {
    expect(needsPayment(entry({ status: 'cancelled' }))).toBe(false);
  });

  it('支払い不要の大会は対象外', () => {
    expect(needsPayment(entry({ tournaments: { title: '無料回', payment_required: false } }))).toBe(false);
  });

  it('通常活動のように大会情報が無い行は対象外（activitiesの料金には触れない）', () => {
    expect(needsPayment(entry({ tournaments: undefined }))).toBe(false);
  });
});

describe('未入金の判定', () => {
  it('payment_status が completed 以外は未入金（NULLを含む）', () => {
    expect(isUnpaid(entry({ payment_status: 'pending' }))).toBe(true);
    expect(isUnpaid(entry({ payment_status: null }))).toBe(true);
    expect(isUnpaid(entry({ payment_status: undefined }))).toBe(true);
    expect(isUnpaid(entry({ payment_status: 'failed' }))).toBe(true);
  });

  it('completed になったら未入金ではない＝督促が止まる', () => {
    expect(isUnpaid(entry({ payment_status: 'completed' }))).toBe(false);
  });

  it('対象外のエントリーは未入金に数えない', () => {
    expect(isUnpaid(entry({ status: 'cancelled', payment_status: 'pending' }))).toBe(false);
  });
});

describe('入金列のバッジ', () => {
  it('対象外は null（画面では「-」）', () => {
    expect(paymentBadge(entry({ status: 'waitlist' }))).toBeNull();
  });

  it('入金済みは支払い方法つきで出る', () => {
    expect(paymentBadge(entry({ payment_status: 'completed' }))).toEqual({ tone: 'paid', label: '入金済・銀行振込' });
  });

  it('返金済みは未入金と区別する', () => {
    expect(paymentBadge(entry({ payment_status: 'refunded' }))?.tone).toBe('refunded');
  });

  it('支払い方法が未選択なら「未選択」と書く（空欄にしない）', () => {
    expect(paymentBadge(entry({ payment_method: null }))).toEqual({ tone: 'unpaid', label: '未入金・未選択' });
  });

  it('支払い方法のラベル', () => {
    expect(paymentMethodLabel('paypay')).toBe('PayPay');
    expect(paymentMethodLabel('credit')).toBe('カード');
    expect(paymentMethodLabel(null)).toBe('未選択');
  });
});

describe('支払い期限', () => {
  const now = new Date('2026-08-24T09:00:00+09:00');

  it('残り日数（超過はマイナス）', () => {
    expect(daysToDeadline('2026-08-30', now)).toBe(6);
    expect(daysToDeadline('2026-08-24', now)).toBe(0);
    expect(daysToDeadline('2026-08-20', now)).toBe(-4);
    expect(daysToDeadline(null, now)).toBeNull();
  });

  it('期限超過は日数つきで警告する', () => {
    const e = entry({ tournaments: { title: 'x', payment_required: true, payment_deadline: '2026-08-20' } });
    expect(deadlineNote(e, now)).toEqual({ tone: 'over', text: '4日超過' });
  });

  it('3日以内は「あとN日」', () => {
    const e = entry({ tournaments: { title: 'x', payment_required: true, payment_deadline: '2026-08-26' } });
    expect(deadlineNote(e, now)).toEqual({ tone: 'soon', text: 'あと2日' });
  });

  it('期限未設定は督促が動きようがないので、その旨を出す', () => {
    const e = entry({ tournaments: { title: 'x', payment_required: true, payment_deadline: null } });
    expect(deadlineNote(e, now)).toEqual({ tone: 'unset', text: '期限未設定' });
  });

  it('まだ余裕があるときは何も出さない（画面を汚さない）', () => {
    const e = entry({ tournaments: { title: 'x', payment_required: true, payment_deadline: '2026-09-30' } });
    expect(deadlineNote(e, now)).toBeNull();
  });

  it('入金済みには期限の注意を出さない', () => {
    const e = entry({ payment_status: 'completed', tournaments: { title: 'x', payment_required: true, payment_deadline: '2026-08-01' } });
    expect(deadlineNote(e, now)).toBeNull();
  });
});

describe('CSVの支払い列', () => {
  it('支払い必須の大会は方法と入金状況を書く', () => {
    expect(paymentCsvCells(entry({ payment_status: 'completed', payment_method: 'paypay' }))).toEqual(['PayPay', '入金済']);
    expect(paymentCsvCells(entry())).toEqual(['銀行振込', '未入金']);
  });

  it('支払い不要の大会は空欄にせず「支払い不要」と書き切る', () => {
    expect(paymentCsvCells(entry({ tournaments: { title: 'x', payment_required: false } }))).toEqual(['', '支払い不要']);
  });
});
