// 販売ファネルの集計（2026-08-26 Phase S8）。
//
// この表の仕事は「どこから来た人が、どこで止まったか」を出すこと。
// いちばん壊れやすいのは **0件と「取れなかった」を混同すること** と、
// **staging の確認が本番の数字に混ざること**（同じDBを共有しているため）。
import { describe, it, expect } from 'vitest';
import {
  buildSalesFunnel, windowStartDay, jstDay, DIRECT_KEY,
  type SalesEventRow, type SalesPurchaseRow,
} from './salesFunnel';

const NOW = '2026-08-26T12:00:00+09:00';

const ev = (o: Partial<SalesEventRow> = {}): SalesEventRow => ({
  anonId: 'a1', userId: null, kind: 'lp_view', planId: null,
  occurredOn: '2026-08-26', occurredAtISO: NOW, isTest: false, ...o,
});
const buy = (o: Partial<SalesPurchaseRow> = {}): SalesPurchaseRow => ({
  userId: 'u1', planId: 'ai-trial-pass', status: 'provisioned', livemode: true,
  createdAtISO: NOW, attributionSource: null, attributionCampaign: null, ...o,
});
const build = (o: Partial<Parameters<typeof buildSalesFunnel>[0]> = {}) => buildSalesFunnel({
  events: [], attribution: [], purchases: [], applications: [],
  window: '30d', nowISO: NOW, ...o,
});

describe('期間の切り方', () => {
  it('今日は当日だけ', () => {
    expect(windowStartDay('today', NOW)).toBe('2026-08-26');
  });
  it('7日は今日を含めて7日', () => {
    expect(windowStartDay('7d', NOW)).toBe('2026-08-20');
  });
  it('30日は今日を含めて30日', () => {
    expect(windowStartDay('30d', NOW)).toBe('2026-07-28');
  });
  it('全期間は制限なし', () => {
    expect(windowStartDay('all', NOW)).toBeNull();
  });
  it('JSTで日付を切る（UTCの深夜で1日ずれない）', () => {
    // 日本時間の 8/27 00:30 は UTC では 8/26 15:30
    expect(jstDay('2026-08-26T15:30:00Z')).toBe('2026-08-27');
  });
});

describe('数え方', () => {
  it('13種すべてを0で持つ（まだ無い段も表に出せる）', () => {
    const f = build();
    expect(Object.keys(f.counts)).toHaveLength(13);
    expect(f.counts.lp_view).toBe(0);
    expect(f.counts.purchase).toBe(0);
    expect(f.hasAnyData).toBe(false);
  });

  it('知らない kind は数えない（表の合計が勝手に増えない）', () => {
    const f = build({ events: [ev({ kind: 'something_else' })] });
    expect(f.hasAnyData).toBe(true);   // 行は在る
    expect(Object.values(f.counts).reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('staging の確認（is_test）は数えない', () => {
    const f = build({ events: [ev({ isTest: true }), ev({ isTest: false })] });
    expect(f.counts.lp_view).toBe(1);
  });

  it('期間の外は数えない', () => {
    const f = build({
      window: 'today',
      events: [ev({ occurredOn: '2026-08-25' }), ev({ occurredOn: '2026-08-26' })],
    });
    expect(f.counts.lp_view).toBe(1);
  });
});

describe('購入', () => {
  it('テスト決済は数えない', () => {
    const f = build({ purchases: [buy({ livemode: false })] });
    expect(f.purchasesByPlan).toEqual([]);
  });

  it('未払い（pending）は数えない', () => {
    const f = build({ purchases: [buy({ status: 'pending' })] });
    expect(f.purchasesByPlan).toEqual([]);
  });

  it('paid と provisioned はどちらも売上として数える', () => {
    const f = build({ purchases: [buy({ status: 'paid' }), buy({ status: 'provisioned' })] });
    expect(f.purchasesByPlan).toEqual([{ planId: 'ai-trial-pass', paid: 2 }]);
  });
});

describe('流入元', () => {
  it('UTMが無い分は「直接・不明」にまとめる（空文字で分裂させない）', () => {
    const f = build({
      events: [ev({ anonId: 'a1' })],
      attribution: [{ anonId: 'a1', ftSource: null, ftCampaign: null }],
    });
    expect(f.bySource).toEqual([{ key: DIRECT_KEY, lpViews: 1, purchases: 0 }]);
  });

  it('first-touch で分ける', () => {
    const f = build({
      events: [ev({ anonId: 'a1' }), ev({ anonId: 'a2' })],
      attribution: [
        { anonId: 'a1', ftSource: 'xhs', ftCampaign: 'aug' },
        { anonId: 'a2', ftSource: 'wechat', ftCampaign: 'aug' },
      ],
    });
    expect(f.bySource.map((r) => r.key).sort()).toEqual(['wechat', 'xhs']);
    expect(f.byCampaign).toEqual([{ key: 'aug', lpViews: 2, purchases: 0 }]);
  });

  it('購入は「購入時に焼き付けた値」で数える（台帳の更新に影響されない）', () => {
    const f = build({
      events: [ev({ anonId: 'a1' })],
      attribution: [{ anonId: 'a1', ftSource: 'wechat', ftCampaign: null }],
      purchases: [buy({ attributionSource: 'xhs' })],
    });
    const xhs = f.bySource.find((r) => r.key === 'xhs');
    expect(xhs?.purchases).toBe(1);
    expect(xhs?.lpViews).toBe(0);
  });

  it('購入が多い順に並ぶ（判断に使う順）', () => {
    const f = build({
      purchases: [
        buy({ attributionSource: 'xhs' }), buy({ attributionSource: 'xhs' }),
        buy({ attributionSource: 'meta' }),
      ],
    });
    expect(f.bySource.map((r) => r.key)).toEqual(['xhs', 'meta']);
  });
});

describe('日をまたいで戻ってきた復習', () => {
  it('同じ日の復習は数えない（戻ってきた、ではない）', () => {
    const f = build({ events: [
      ev({ kind: 'lesson_completed', userId: 'u1', occurredOn: '2026-08-26' }),
      ev({ kind: 'review_completed', userId: 'u1', occurredOn: '2026-08-26' }),
    ] });
    expect(f.nextDayReviews).toBe(0);
  });

  it('翌日以降の復習は数える', () => {
    const f = build({ events: [
      ev({ kind: 'lesson_completed', userId: 'u1', occurredOn: '2026-08-25' }),
      ev({ kind: 'review_completed', userId: 'u1', occurredOn: '2026-08-26' }),
    ] });
    expect(f.nextDayReviews).toBe(1);
  });

  it('初回が期間の前でも取りこぼさない', () => {
    // 窓を today にしても、初回（8/01）は全期間から探す
    const f = build({
      window: 'today',
      events: [
        ev({ kind: 'lesson_completed', userId: 'u1', occurredOn: '2026-08-01' }),
        ev({ kind: 'review_completed', userId: 'u1', occurredOn: '2026-08-26' }),
      ],
    });
    expect(f.nextDayReviews).toBe(1);
  });

  it('未ログインの行は anon_id で人をまとめる', () => {
    const f = build({ events: [
      ev({ kind: 'lesson_completed', anonId: 'a9', userId: null, occurredOn: '2026-08-25' }),
      ev({ kind: 'review_completed', anonId: 'a9', userId: null, occurredOn: '2026-08-26' }),
    ] });
    expect(f.nextDayReviews).toBe(1);
  });
});

describe('続きへの移行', () => {
  it('体験を買った人が月額を買ったら移行として数える', () => {
    const f = build({ purchases: [
      buy({ userId: 'u1', planId: 'ai-trial-pass' }),
      buy({ userId: 'u1', planId: 'ai-month' }),
    ] });
    expect(f.upgrades.trialToMonth).toBe(1);
  });

  it('体験を買っていない人の月額は移行に数えない', () => {
    const f = build({ purchases: [buy({ userId: 'u2', planId: 'ai-month' })] });
    expect(f.upgrades.trialToMonth).toBe(0);
  });

  it('6か月は決済ではなく申込として数える（売上と混ぜない）', () => {
    const f = build({ applications: [{ planId: 'coach-6m', createdAtISO: NOW }] });
    expect(f.upgrades.sixMonthApplications).toBe(1);
    expect(f.purchasesByPlan).toEqual([]);
  });
});
