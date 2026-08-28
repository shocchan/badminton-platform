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

export interface FunnelLearnerRow {
  id: string; userId: string | null; createdAtISO: string;
  /**
   * テストアカウントか（ai_learners.is_test または受講権 source='test'）。
   * **本番KPIから必ず除外する**。管理画面の buildKpis が type='student' 以外を
   * 除外しているのと同じ規律（2026-08-21 の検証で漏れを発見して追加）
   */
  isTest: boolean;
}
export interface FunnelSessionRow {
  learnerId: string; startedAtISO: string;
  completionStatus: string; lessonKind: string; errorCode: string | null;
}
export interface FunnelUsageRow { learnerId: string; usageDate: string }
export interface FunnelEventRow {
  userId: string; kind: string; createdAtISO: string;
  /** イベントの付随情報。error_occurred の where を読むのに使う（無ければ null） */
  props?: Record<string, unknown> | null;
}

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
  /**
   * Time to First Value（2026-08-26）。
   * 購入（発行完了）から**最初の会話を始める**までの実時間。
   * 新しいイベントは足していない: ai_plan_purchases.provisionedAt と
   * ai_learning_sessions.started_at の差から出せるため。
   * 目標は3分以内だが、初回設定（診断5〜8分）を挟むので実測を見て評価する。
   * n が小さいうちは平均を出さず**中央値と実数**だけを見る（外れ値1件で像が歪むため）。
   */
  /**
   * 学習者の前で起きた失敗（2026-08-26）。
   * 「動いています」と言うために、失敗が0件だと確認できる状態にする。
   * where ごと（checkout / trial_start / realtime …）に件数を出す。
   */
  errors: { total: number; byWhere: { where: string; n: number }[] };
  ttfv: {
    /** 購入者のうち、実際に会話を始めた人数（＝中央値の母数） */
    n: number;
    /** 発行済みだが、まだ一度も会話を始めていない人数 */
    notStarted: number;
    /** 購入→初回会話開始の中央値（分）。n=0 なら null */
    medianMinutes: number | null;
    /** 3分以内に到達した人数 */
    within3min: number;
  };
  /**
   * 決済手段の内訳（2026-08-26）。中国語話者が支付宝/微信を使うかは集客判断に直結する。
   * payment_method は webhook が記録する。未取得（古い行・未確定）は 'unknown'。
   */
  paymentMethods: { method: string; started: number; paid: number }[];
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

  // テストアカウントは本番KPIに混ぜない（購入は livemode で、学習は is_test で落とす）
  const testLearnerIds = new Set(input.learners.filter((l) => l.isTest).map((l) => l.id));
  const isTestLearner = (learnerId: string): boolean => testLearnerIds.has(learnerId);

  const learnerByUser = new Map<string, FunnelLearnerRow>();
  for (const l of input.learners) if (l.userId && !l.isTest) learnerByUser.set(l.userId, l);

  // ── 購入ファネル（テスト決済は除外） ──
  const live = input.purchases.filter((p) => p.livemode && inWindow(p.createdAtISO));
  const paid = live.filter((p) => p.status === 'paid' || p.status === 'provisioned');
  const provisioned = live.filter((p) => p.status === 'provisioned');
  const setupDone = provisioned.filter((p) => p.userId !== null && learnerByUser.has(p.userId));
  const sessionsAll = input.sessions.filter((s) => inWindow(s.startedAtISO) && !isTestLearner(s.learnerId));
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
  for (const u of input.usage) { if (!isTestLearner(u.learnerId)) add(u.learnerId, u.usageDate); }
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
  for (const s of input.sessions) { if (!isTestLearner(s.learnerId)) noteFirst(s.learnerId, jstDateKeyOf(s.startedAtISO)); }
  for (const u of input.usage) { if (!isTestLearner(u.learnerId)) noteFirst(u.learnerId, u.usageDate); }
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

  /* ── 学習者の前で起きた失敗（期間内・テストアカウントを除く） ──
     内訳は props.where（checkout / trial_start / realtime …）で分ける。 */
  const errorRows = input.events.filter((e) => {
    if (e.kind !== 'error_occurred') return false;
    const l = learnerByUser.get(e.userId);
    if (l && isTestLearner(l.id)) return false;
    return inWindow(e.createdAtISO);
  });
  const errorByWhere = new Map<string, number>();
  for (const e of errorRows) {
    const raw = e.props?.where;
    const where = typeof raw === 'string' && raw ? raw : 'other';
    errorByWhere.set(where, (errorByWhere.get(where) ?? 0) + 1);
  }

  /* ── TTFV: 購入（発行完了）→ 最初の会話開始 ──
     窓で絞らず「その購入者の全セッション」から最初の1件を探す。
     窓の端で購入した人が翌日始めたケースを取りこぼさないため。 */
  const firstSessionAtByLearner = new Map<string, number>();
  for (const s of input.sessions) {
    if (isTestLearner(s.learnerId)) continue;
    const t = Date.parse(s.startedAtISO);
    if (Number.isNaN(t)) continue;
    const cur = firstSessionAtByLearner.get(s.learnerId);
    if (cur === undefined || t < cur) firstSessionAtByLearner.set(s.learnerId, t);
  }
  const gapsMin: number[] = [];
  let ttfvNotStarted = 0;
  for (const p of provisioned) {
    const provisionedAt = p.provisionedAtISO ? Date.parse(p.provisionedAtISO) : NaN;
    const l = p.userId ? learnerByUser.get(p.userId) : undefined;
    const firstAt = l ? firstSessionAtByLearner.get(l.id) : undefined;
    if (firstAt === undefined) { ttfvNotStarted += 1; continue; }
    if (!Number.isFinite(provisionedAt)) continue;
    // 購入より前のセッション（既存アカウントの再購入）は TTFV に数えない
    const gap = (firstAt - provisionedAt) / 60_000;
    if (gap >= 0) gapsMin.push(gap);
  }
  gapsMin.sort((a, b) => a - b);
  const medianMinutes = gapsMin.length === 0
    ? null
    : Math.round((gapsMin.length % 2 === 1
      ? gapsMin[(gapsMin.length - 1) / 2]
      : (gapsMin[gapsMin.length / 2 - 1] + gapsMin[gapsMin.length / 2]) / 2) * 10) / 10;

  /* ── 決済手段の内訳（開始＝checkoutを作った数 / 成立＝発行まで到達した数） ── */
  const pmMap = new Map<string, { started: number; paid: number }>();
  for (const p of live) {
    const key = p.paymentMethod && p.paymentMethod.length > 0 ? p.paymentMethod : 'unknown';
    const cur = pmMap.get(key) ?? { started: 0, paid: 0 };
    cur.started += 1;
    if (p.status === 'paid' || p.status === 'provisioned') cur.paid += 1;
    pmMap.set(key, cur);
  }
  const paymentMethods = [...pmMap.entries()]
    .map(([method, v]) => ({ method, ...v }))
    .sort((a, b) => b.started - a.started || a.method.localeCompare(b.method));

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
    errors: {
      total: errorRows.length,
      byWhere: [...errorByWhere.entries()]
        .map(([where, n]) => ({ where, n }))
        .sort((a, b) => b.n - a.n),
    },
    ttfv: {
      n: gapsMin.length,
      notStarted: ttfvNotStarted,
      medianMinutes,
      within3min: gapsMin.filter((g) => g <= 3).length,
    },
    paymentMethods,
  };
};
