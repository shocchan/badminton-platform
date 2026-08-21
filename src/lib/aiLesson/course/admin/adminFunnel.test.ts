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
const learner = (id: string, userId: string, daysAgo = 5) =>
  ({ id, userId, createdAtISO: iso(daysAgo) });
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
