import { describe, it, expect } from 'vitest';
import {
  diagnose, realSessions, byPaymentMethod, timelineFor,
  type PaymentSessionRow, type PaymentWatch, type PaymentEventRow, type PurchaseStatus,
} from './paymentWatch';

const session = (over: Partial<PaymentSessionRow> = {}): PaymentSessionRow => ({
  sessionRef: 'abcd1234',
  createdAtISO: '2026-09-01T00:00:00.000Z',
  updatedAtISO: '2026-09-01T00:00:00.000Z',
  planId: 'ai-trial-pass',
  amountJpy: 600,
  locale: 'zh',
  status: 'pending',
  livemode: true,
  isTest: false,
  paymentMethod: null,
  hasPaymentIntent: false,
  hasBuyerEmail: false,
  provisioned: false,
  loginClaimed: false,
  error: '',
  webhookCount: 0,
  ...over,
});

const watch = (sessions: PaymentSessionRow[], over: Partial<PaymentWatch> = {}): PaymentWatch => ({
  sinceISO: '2026-08-10T00:00:00.000Z',
  sessions,
  events: [],
  totals: {
    sessions: sessions.length,
    provisioned: sessions.filter((s) => s.status === 'provisioned').length,
    webhookEvents: 0,
    webhookEventsEver: 0,
  },
  ...over,
});

describe('realSessions', () => {
  it('テスト行とテストモードは判断から外す', () => {
    const rows = [
      session({ sessionRef: 'real0001' }),
      session({ sessionRef: 'test0001', isTest: true }),
      session({ sessionRef: 'mode0001', livemode: false }),
    ];
    expect(realSessions(rows).map((r) => r.sessionRef)).toEqual(['real0001']);
  });
});

describe('diagnose', () => {
  it('本番の決済がまだ無いときは unknown（「壊れている」と言わない）', () => {
    const v = diagnose(watch([]));
    expect(v.level).toBe('unknown');
    expect(v.next).toContain('¥600');
  });

  it('セッションはあるのに webhook が通算0件なら、受け口を疑う（最優先）', () => {
    // 2026-08-20〜09-07 に実際に起きていた状態の再現
    const rows = Array.from({ length: 14 }, (_, i) => session({ sessionRef: `s${i}`.padEnd(8, '0') }));
    const v = diagnose(watch(rows));
    expect(v.level).toBe('blocked');
    expect(v.headline).toContain('1件も受け取っていません');
    expect(v.because).toContain('14');
    expect(v.next).toContain('checkout.session.completed');
  });

  it('入金済みなのに発行できていない行があれば、それを最優先で出す', () => {
    const rows = [
      session({ sessionRef: 'paid0001', status: 'paid', webhookCount: 2 }),
      session({ sessionRef: 'done0001', status: 'provisioned', provisioned: true, webhookCount: 3 }),
    ];
    const v = diagnose(watch(rows, { totals: { sessions: 2, provisioned: 1, webhookEvents: 5, webhookEventsEver: 5 } }));
    expect(v.level).toBe('blocked');
    expect(v.headline).toContain('入金済みなのに');
    expect(v.because).toContain('1 件');
  });

  it('webhookは届いているのに完了0件なら、支払い画面での離脱として案内する', () => {
    const rows = [
      session({ sessionRef: 'open0001', status: 'expired', webhookCount: 2 }),
      session({ sessionRef: 'open0002', status: 'pending', webhookCount: 1 }),
    ];
    const v = diagnose(watch(rows, { totals: { sessions: 2, provisioned: 0, webhookEvents: 3, webhookEventsEver: 3 } }));
    expect(v.level).toBe('blocked');
    expect(v.headline).toContain('支払いを完了していません');
    expect(v.next).toContain('実際に1回買って');
  });

  it('通知が届いていない session ばかりなら、Stripe側の設定確認を促す', () => {
    const rows = [
      session({ sessionRef: 'none0001', status: 'pending', webhookCount: 0 }),
      session({ sessionRef: 'none0002', status: 'pending', webhookCount: 0 }),
    ];
    // 通算では1件だけ受信がある（別期間）＝「通算0件」の分岐には入らない
    const v = diagnose(watch(rows, { totals: { sessions: 2, provisioned: 0, webhookEvents: 0, webhookEventsEver: 1 } }));
    expect(v.level).toBe('blocked');
    expect(v.next).toContain('Stripe');
  });

  it('発行までつながっていれば ok', () => {
    const rows = [
      session({ sessionRef: 'ok000001', status: 'provisioned', provisioned: true, webhookCount: 3 }),
      session({ sessionRef: 'ok000002', status: 'provisioned', provisioned: true, webhookCount: 3 }),
    ];
    const v = diagnose(watch(rows, { totals: { sessions: 2, provisioned: 2, webhookEvents: 6, webhookEventsEver: 6 } }));
    expect(v.level).toBe('ok');
  });

  it('完了より未確定がはるかに多いときは watch（止まってはいないが取りこぼしている）', () => {
    const rows = [
      session({ sessionRef: 'ok000001', status: 'provisioned', provisioned: true, webhookCount: 3 }),
      ...Array.from({ length: 5 }, (_, i) => session({ sessionRef: `p${i}`.padEnd(8, '0'), status: 'pending', webhookCount: 1 })),
    ];
    const v = diagnose(watch(rows, { totals: { sessions: 6, provisioned: 1, webhookEvents: 8, webhookEventsEver: 8 } }));
    expect(v.level).toBe('watch');
  });

  it('判定文には必ず根拠の数字が入る（「なんとなく」で報告しない）', () => {
    const statuses: PurchaseStatus[] = ['pending', 'paid', 'provisioned', 'expired'];
    for (const s of statuses) {
      const v = diagnose(watch([session({ status: s, webhookCount: 2 })], {
        totals: { sessions: 1, provisioned: s === 'provisioned' ? 1 : 0, webhookEvents: 2, webhookEventsEver: 2 },
      }));
      expect(v.because).toMatch(/\d/);
      expect(v.next.length).toBeGreaterThan(10);
    }
  });
});

describe('byPaymentMethod', () => {
  it('手段ごとの件数と成立数を出す。未確定は「(未確定)」でまとめる', () => {
    const rows = [
      session({ sessionRef: 'a', paymentMethod: 'card', status: 'provisioned' }),
      session({ sessionRef: 'b', paymentMethod: 'card', status: 'pending' }),
      session({ sessionRef: 'c', paymentMethod: 'alipay', status: 'paid' }),
      session({ sessionRef: 'd', paymentMethod: null, status: 'expired' }),
      session({ sessionRef: 'e', paymentMethod: 'card', isTest: true }),
    ];
    expect(byPaymentMethod(rows)).toEqual([
      { method: 'card', total: 2, settled: 1 },
      { method: 'alipay', total: 1, settled: 1 },
      { method: '(未確定)', total: 1, settled: 0 },
    ]);
  });
});

describe('timelineFor', () => {
  it('1つのsessionの出来事を古い順に並べる（実決済テスト中に追うため）', () => {
    const ev = (t: string, type: string, outcome: PaymentEventRow['outcome']): PaymentEventRow => ({
      receivedAtISO: t, eventType: type, sessionRef: 'abcd1234',
      paymentStatus: null, paymentMethod: null, livemode: true, outcome, detail: '',
    });
    const w = watch([], {
      events: [
        ev('2026-09-09T10:00:03.000Z', 'checkout.session.completed', 'handled'),
        ev('2026-09-09T10:00:00.000Z', 'checkout_created', 'handled'),
        { ...ev('2026-09-09T10:00:02.000Z', 'other', 'ignored'), sessionRef: 'zzzz9999' },
      ],
    });
    expect(timelineFor(w, 'abcd1234').map((e) => e.eventType))
      .toEqual(['checkout_created', 'checkout.session.completed']);
  });
});
