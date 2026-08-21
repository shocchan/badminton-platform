// 学習ファネル・再訪率の集計（Phase 1 計測基盤 2026-08-21）。
//
// **表示は純関数、I/Oは adminFunnelApi**（原則13。buildKpis と同じ流儀）。
// 分母と分子を必ず対で持つ: 人数が少ない段階で割合だけが独り歩きしないよう、
// UI は「n / 分母」の実数を必ず併記する契約。
//
// 「活動した日」の定義: 会話セッション・音声利用・穴埋めイベント（app_open等）の
// **どれかがあった日**（JST）。イベント表を足した理由は、バトルや教材だけの日が
// ai_usage_daily（音声中心）に載らず再訪率が過小に出ていたため。
import { jstDateKeyOf } from '../adventure/advTeacherNote';
import type { AdminPurchaseRow } from './adminAccountsApi';

export interface FunnelLearnerRow { id: string; userId: string | null; createdAtISO: string }
export interface FunnelSessionRow {
  learnerId: string; startedAtISO: string;
  completionStatus: string; lessonKind: string; errorCode: string | null;
}
export interface FunnelUsageRow { learnerId: string; usageDate: string }
export interface FunnelEventRow { userId: string; kind: string; createdAtISO: string }

export interface CourseFunnel {
  windowDays: number;
  /** 購入ファネル（本番決済のみ・期間内） */
  purchase: {
    paid: number;            // 決済完了（provisioned含む）
    provisioned: number;     // アカウント発行済み
    setupDone: number;       // 発行済みのうち、名前入力まで来た（learner行あり）
    convStarted: number;     // さらに会話を1回でも開始した
  };
  /** 全学習者の活動（購入者以外の手動発行の生徒も含む） */
  activity: {
    activeLearners: number;      // 期間内に1日でも活動した人数
    convSessions: number;        // 会話開始数
    convCompleted: number;       // 会話完了数
    convErrors: number;          // エラーで終わった会話
    reviewSessions: number;      // 復習セッション数（lesson_kind review*）
    reviewLearners: number;      // 復習した人数
  };
  /** 再訪（期間内に初めて活動した人が母数） */
  retention: {
    base: number;   // 期間内に初活動した人数
    d1: number;     // 翌日も活動
    d7: number;     // 2〜7日目のどこかで再活動
  };
}

const dayAfter = (dateKey: string, days: number): string => {
  const t = Date.parse(`${dateKey}T00:00:00+09:00`);
  return jstDateKeyOf(new Date(t + days * 86_400_000).toISOString());
};

export const buildCourseFunnel = (input: {
  purchases: AdminPurchaseRow[];
  learners: FunnelLearnerRow[];
  sessions: FunnelSessionRow[];
  usage: FunnelUsageRow[];
  events: FunnelEventRow[];
  nowISO: string;
  windowDays?: number;
}): CourseFunnel => {
  const windowDays = input.windowDays ?? 30;
  const sinceMs = Date.parse(input.nowISO) - windowDays * 86_400_000;
  const inWindow = (iso: string): boolean => {
    const t = Date.parse(iso);
    return !Number.isNaN(t) && t >= sinceMs;
  };

  const learnerByUser = new Map<string, FunnelLearnerRow>();
  for (const l of input.learners) if (l.userId) learnerByUser.set(l.userId, l);
  const userByLearner = new Map<string, string>();
  for (const l of input.learners) if (l.userId) userByLearner.set(l.id, l.userId);

  // ── 購入ファネル（テスト決済は除外） ──
  const live = input.purchases.filter((p) => p.livemode && inWindow(p.createdAtISO));
  const paid = live.filter((p) => p.status === 'paid' || p.status === 'provisioned');
  const provisioned = live.filter((p) => p.status === 'provisioned');
  const setupDone = provisioned.filter((p) => p.userId !== null && learnerByUser.has(p.userId));
  const sessionsAll = input.sessions.filter((s) => inWindow(s.startedAtISO));
  const learnersWithConv = new Set(sessionsAll.map((s) => s.learnerId));
  const convStarted = setupDone.filter((p) => {
    const l = p.userId ? learnerByUser.get(p.userId) : undefined;
    return l !== undefined && learnersWithConv.has(l.id);
  });

  // ── 活動した日（learner単位・JST日付キー集合） ──
  const daysByLearner = new Map<string, Set<string>>();
  const add = (learnerId: string, dateKey: string): void => {
    if (!dateKey) return;
    const set = daysByLearner.get(learnerId) ?? new Set<string>();
    set.add(dateKey);
    daysByLearner.set(learnerId, set);
  };
  for (const s of sessionsAll) add(s.learnerId, jstDateKeyOf(s.startedAtISO));
  for (const u of input.usage) add(u.learnerId, u.usageDate);
  for (const e of input.events) {
    if (!inWindow(e.createdAtISO)) continue;
    const l = learnerByUser.get(e.userId);
    if (l) add(l.id, jstDateKeyOf(e.createdAtISO));
  }
  // usage は期間外の日付が混ざりうるので窓で絞る
  const sinceKey = jstDateKeyOf(new Date(sinceMs).toISOString());
  for (const [id, set] of daysByLearner) {
    const filtered = new Set([...set].filter((d) => d >= sinceKey));
    if (filtered.size === 0) daysByLearner.delete(id);
    else daysByLearner.set(id, filtered);
  }

  // ── 再訪（期間内に「初めて」活動した人だけを母数にする） ──
  // 期間前から使っている継続者を混ぜると、D1が「継続者の毎日利用」で膨らむ
  const firstDayEver = new Map<string, string>();
  const noteFirst = (learnerId: string, dateKey: string): void => {
    if (!dateKey) return;
    const cur = firstDayEver.get(learnerId);
    if (!cur || dateKey < cur) firstDayEver.set(learnerId, dateKey);
  };
  for (const s of input.sessions) noteFirst(s.learnerId, jstDateKeyOf(s.startedAtISO));
  for (const u of input.usage) noteFirst(u.learnerId, u.usageDate);
  for (const e of input.events) {
    const l = learnerByUser.get(e.userId);
    if (l) noteFirst(l.id, jstDateKeyOf(e.createdAtISO));
  }
  let base = 0, d1 = 0, d7 = 0;
  for (const [learnerId, first] of firstDayEver) {
    if (first < sinceKey) continue; // 期間前からの人は母数に入れない
    base += 1;
    const days = daysByLearner.get(learnerId) ?? new Set<string>();
    if (days.has(dayAfter(first, 1))) d1 += 1;
    let returned7 = false;
    for (let i = 1; i <= 7 && !returned7; i += 1) {
      if (days.has(dayAfter(first, i))) returned7 = true;
    }
    if (returned7) d7 += 1;
  }

  const reviews = sessionsAll.filter((s) => s.lessonKind.startsWith('review'));
  return {
    windowDays,
    purchase: {
      paid: paid.length,
      provisioned: provisioned.length,
      setupDone: setupDone.length,
      convStarted: convStarted.length,
    },
    activity: {
      activeLearners: daysByLearner.size,
      convSessions: sessionsAll.length,
      convCompleted: sessionsAll.filter((s) => s.completionStatus === 'completed').length,
      convErrors: sessionsAll.filter((s) => s.errorCode !== null && s.errorCode !== '').length,
      reviewSessions: reviews.length,
      reviewLearners: new Set(reviews.map((s) => s.learnerId)).size,
    },
    retention: { base, d1, d7 },
  };
};
