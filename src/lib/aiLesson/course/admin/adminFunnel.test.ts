// 学習ファネル集計の境界を固定する（Phase 1 計測基盤）。
// 特に守りたいこと:
// ① テスト決済を売上ファネルに数えない ② 分母は「期間内に初めて活動した人」
// ③ バトル等のイベントだけの日も活動日として数える（音声偏重の再訪過小を直した本題）
import { describe, it, expect } from 'vitest';
import { buildCourseFunnel } from './adminFunnel';
import type { AdminPurchaseRow } from './adminAccountsApi';

const NOW = '2026-09-15T12:00:00+09:00';
const D = 86_400_000;
const iso = (daysAgo: number): string => new Date(Date.parse(NOW) - daysAgo * D).toISOString();

const purchase = (over: Partial<AdminPurchaseRow> = {}): AdminPurchaseRow => ({
  id: 'p1', stripeSessionId: 'cs_1', planId: 'ai-trial-pass', planVersion: 3,
  amountJpy: 600, livemode: true, buyerEmail: 'a@b.c', locale: 'ja',
  status: 'provisioned', userId: 'u1', loginId: 's1', error: null,
  createdAtISO: iso(5), provisionedAtISO: iso(5), ...over,
});
const learner = (id: string, userId: string, daysAgo = 5, isTest = false) =>
  ({ id, userId, createdAtISO: iso(daysAgo), isTest });
const session = (learnerId: string, daysAgo: number, over: Partial<{ completionStatus: string; lessonKind: string; errorCode: string | null }> = {}) => ({
  learnerId, startedAtISO: iso(daysAgo),
  completionStatus: 'completed', lessonKind: 'new', errorCode: null, ...over,
});

describe('購入ファネル', () => {
  it('決済→発行→設定→会話開始 を段で数える', () => {
    const f = buildCourseFunnel({
      purchases: [purchase()],
      learners: [learner('l1', 'u1')],
      sessions: [session('l1', 4)],
      usage: [], events: [], nowISO: NOW,
    });
    expect(f.purchase).toEqual({ paid: 1, provisioned: 1, setupDone: 1, convStarted: 1 });
  });

  it('**テスト決済は数えない**', () => {
    const f = buildCourseFunnel({
      purchases: [purchase({ livemode: false })],
      learners: [], sessions: [], usage: [], events: [], nowISO: NOW,
    });
    expect(f.purchase.paid).toBe(0);
  });

  it('発行済みでも learner 行が無ければ setupDone に入らない（未ログインの検出）', () => {
    const f = buildCourseFunnel({
      purchases: [purchase()],
      learners: [], sessions: [], usage: [], events: [], nowISO: NOW,
    });
    expect(f.purchase.provisioned).toBe(1);
    expect(f.purchase.setupDone).toBe(0);
  });
});

describe('再訪（D1 / D7）', () => {
  it('翌日に活動すれば D1・7日以内なら D7', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1')],
      sessions: [session('l1', 6), session('l1', 5)],
      usage: [], events: [], nowISO: NOW,
    });
    expect(f.retention).toEqual({ base: 1, d1: 1, d7: 1 });
  });

  it('**イベントだけの日（バトル等）も活動日として数える**', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1')],
      sessions: [session('l1', 6)],
      usage: [],
      events: [{ userId: 'u1', kind: 'battle_completed', createdAtISO: iso(5) }],
      nowISO: NOW,
    });
    expect(f.retention.d1).toBe(1); // 音声だけ見ていたら 0 になっていた
  });

  it('期間前から使っている継続者は母数に入れない', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1', 60)],
      sessions: [session('l1', 60), session('l1', 3), session('l1', 2)],
      usage: [], events: [], nowISO: NOW,
    });
    expect(f.retention.base).toBe(0);
    expect(f.activity.activeLearners).toBe(1); // 活動人数には入る
  });
});

describe('活動・エラー・復習', () => {
  it('完了・エラー・復習を区別して数える', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1')],
      sessions: [
        session('l1', 3),
        session('l1', 3, { completionStatus: 'in_progress', errorCode: 'mic_denied' }),
        session('l1', 2, { lessonKind: 'review_day1' }),
      ],
      usage: [], events: [], nowISO: NOW,
    });
    expect(f.activity.convSessions).toBe(3);
    expect(f.activity.convCompleted).toBe(2);
    expect(f.activity.convErrors).toBe(1);
    expect(f.activity.reviewSessions).toBe(1);
    expect(f.activity.reviewLearners).toBe(1);
  });
});

describe('テストアカウントの除外（本番KPIを汚さない）', () => {
  it('**is_test の学習者は活動・再訪に数えない**', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1', 5, true)],
      sessions: [session('l1', 6), session('l1', 5)],
      usage: [{ learnerId: 'l1', usageDate: '2026-09-10' }],
      events: [{ userId: 'u1', kind: 'app_open', createdAtISO: iso(4) }],
      nowISO: NOW,
    });
    expect(f.activity.activeLearners).toBe(0);
    expect(f.activity.convSessions).toBe(0);
    expect(f.retention.base).toBe(0);
  });

  it('本番の学習者は数える（除外が効きすぎていない）', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1'), learner('l2', 'u2', 5, true)],
      sessions: [session('l1', 3), session('l2', 3)],
      usage: [], events: [], nowISO: NOW,
    });
    expect(f.activity.activeLearners).toBe(1);
    expect(f.activity.convSessions).toBe(1);
  });
});

describe('タイムゾーン境界（JST / UTC）', () => {
  // JST は UTC+9。UTC 15:00 = 翌日 00:00 JST。ここを跨いでも日付がずれないこと
  it('UTC 15:30 の活動は「翌日」のJST日付として数える', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1', 40)],
      sessions: [
        // 2026-09-10 14:30 UTC = 09-10 23:30 JST
        { learnerId: 'l1', startedAtISO: '2026-09-10T14:30:00Z', completionStatus: 'completed', lessonKind: 'new', errorCode: null },
        // 2026-09-10 15:30 UTC = 09-11 00:30 JST → 翌日扱い＝D1成立
        { learnerId: 'l1', startedAtISO: '2026-09-10T15:30:00Z', completionStatus: 'completed', lessonKind: 'new', errorCode: null },
      ],
      usage: [], events: [], nowISO: NOW, windowDays: 30,
    });
    expect(f.retention.base).toBe(1);
    expect(f.retention.d1).toBe(1);
  });

  it('同じJST日の2セッションは活動日1日ぶん（水増ししない）', () => {
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1', 40)],
      sessions: [
        { learnerId: 'l1', startedAtISO: '2026-09-10T01:00:00Z', completionStatus: 'completed', lessonKind: 'new', errorCode: null },
        { learnerId: 'l1', startedAtISO: '2026-09-10T09:00:00Z', completionStatus: 'completed', lessonKind: 'new', errorCode: null },
      ],
      usage: [], events: [], nowISO: NOW, windowDays: 30,
    });
    expect(f.retention.d1).toBe(0); // 同じ日なので翌日再訪ではない
    expect(f.activity.activeLearners).toBe(1);
  });
});

describe('二重記録に強いこと', () => {
  it('**同じ日にイベントが何度入っても活動日は1日**（再読込で水増ししない）', () => {
    const many = Array.from({ length: 25 }, () => ({
      userId: 'u1', kind: 'app_open', createdAtISO: iso(3),
    }));
    const f = buildCourseFunnel({
      purchases: [], learners: [learner('l1', 'u1', 40)],
      sessions: [], usage: [], events: many, nowISO: NOW,
    });
    expect(f.activity.activeLearners).toBe(1);
    expect(f.retention.base).toBe(1);
    expect(f.retention.d1).toBe(0);
  });
});

describe('割合と実数の整合', () => {
  it('各段の分子は分母を超えない', () => {
    const f = buildCourseFunnel({
      purchases: [purchase(), purchase({ id: 'p2', userId: 'u2', status: 'paid', provisionedAtISO: null })],
      learners: [learner('l1', 'u1')],
      sessions: [session('l1', 2)],
      usage: [], events: [], nowISO: NOW,
    });
    expect(f.purchase.provisioned).toBeLessThanOrEqual(f.purchase.paid);
    expect(f.purchase.setupDone).toBeLessThanOrEqual(f.purchase.provisioned);
    expect(f.purchase.convStarted).toBeLessThanOrEqual(f.purchase.setupDone);
    expect(f.retention.d1).toBeLessThanOrEqual(f.retention.base);
    expect(f.retention.d7).toBeLessThanOrEqual(f.retention.base);
    expect(f.activity.convCompleted).toBeLessThanOrEqual(f.activity.convSessions);
  });
});
