// 販売ファネルの集計（2026-08-26 CEO指示 Phase S8）。純関数だけ。I/O は salesFunnelApi.ts。
//
// 【既存の学習ファネル（adminFunnel.ts）との違い】
// adminFunnel は「買った人がどこまで学習したか」を見る。
// こちらは **どこから来た人が、どこで止まったか** を見る。
// 流入元が分からないまま広告費を使ってきた（実測: UTM付きLP閲覧0件）ので、
// この表が埋まるまでは集客の判断ができない。
//
// 【0件と「集計できていない」を区別する】
// 数字が出ないとき、それが「本当に0だった」のか「取得に失敗した」のかを
// 画面が言い分けられるように、失敗は呼び出し側が別途持つ。ここは0を0として返す。
import type { FunnelKind } from '../attribution';

/** 期間の選び方。仕様（Phase S8）の4種 */
export type SalesWindow = 'today' | '7d' | '30d' | 'all';

export const WINDOW_DAYS: Record<SalesWindow, number | null> = {
  today: 0, '7d': 7, '30d': 30, all: null,
};

export interface SalesEventRow {
  anonId: string;
  userId: string | null;
  kind: string;
  planId: string | null;
  occurredOn: string;   // JSTのYYYY-MM-DD
  occurredAtISO: string;
  isTest: boolean;
}

export interface SalesAttributionRow {
  anonId: string;
  ftSource: string | null;
  ftCampaign: string | null;
}

export interface SalesPurchaseRow {
  userId: string | null;
  planId: string;
  status: string;
  livemode: boolean;
  createdAtISO: string;
  attributionSource: string | null;
  attributionCampaign: string | null;
}

export interface SalesApplicationRow {
  planId: string;
  createdAtISO: string;
}

export interface SourceRow { key: string; lpViews: number; purchases: number }

export interface SalesFunnel {
  window: SalesWindow;
  /** 13種すべて。0件も0として持つ（表示側で「まだ無い」と言えるように） */
  counts: Record<FunnelKind, number>;
  /** 決済完了した購入（本番決済のみ） */
  purchasesByPlan: { planId: string; paid: number }[];
  /** 流入元別（first-touch）。UTM が無い分は「直接／不明」にまとめる */
  bySource: SourceRow[];
  byCampaign: SourceRow[];
  /**
   * 翌日以降に復習まで進んだ回数。
   * 「復習した」ではなく **日をまたいで戻ってきた** の意味なので、
   * その人の最初の会話完了より後の日付の review_completed だけ数える。
   */
  nextDayReviews: number;
  /** 体験からの移行。6か月は決済ではなく申込なので別名で持つ */
  upgrades: { trialToMonth: number; sixMonthApplications: number };
  /** 1件でも数字があるか（全部0なら「まだ何も無い」と言う） */
  hasAnyData: boolean;
}

const KINDS: FunnelKind[] = [
  'lp_view', 'cta_click',
  'trial_checkout_start', 'monthly_checkout_start', 'six_month_checkout_start',
  'purchase', 'trial_activated',
  'lesson_started', 'lesson_completed',
  'review_scheduled', 'review_completed',
  'upgrade_cta_view', 'upgrade_cta_click',
];

const zeroCounts = (): Record<FunnelKind, number> =>
  Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<FunnelKind, number>;

/** JSTの YYYY-MM-DD */
export const jstDay = (iso: string): string => {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
};

/** 期間の開始日（JSTのYYYY-MM-DD）。all は null＝制限なし */
export const windowStartDay = (w: SalesWindow, nowISO: string): string | null => {
  const days = WINDOW_DAYS[w];
  if (days === null) return null;
  const t = Date.parse(nowISO);
  // today は当日のみ。7d/30d は「今日を含めて N 日」
  const back = days === 0 ? 0 : days - 1;
  return new Date(t + 9 * 3_600_000 - back * 86_400_000).toISOString().slice(0, 10);
};

/** UTM が無い流入は「直接／不明」に寄せる。空文字で分裂させない */
export const DIRECT_KEY = '(直接・不明)';
const keyOf = (v: string | null | undefined): string => (v && v.trim() ? v.trim() : DIRECT_KEY);

const sortRows = (m: Map<string, SourceRow>): SourceRow[] =>
  [...m.values()].sort((a, b) => (b.purchases - a.purchases) || (b.lpViews - a.lpViews));

export const buildSalesFunnel = (input: {
  events: SalesEventRow[];
  attribution: SalesAttributionRow[];
  purchases: SalesPurchaseRow[];
  applications: SalesApplicationRow[];
  window: SalesWindow;
  nowISO: string;
}): SalesFunnel => {
  const from = windowStartDay(input.window, input.nowISO);
  const inWindowDay = (day: string): boolean => !from || day >= from;
  const inWindowISO = (iso: string): boolean => inWindowDay(jstDay(iso));

  // staging と本番は同じDBを共有しているので、テスト印の行は最初に落とす
  const events = input.events.filter((e) => !e.isTest && inWindowDay(e.occurredOn));

  const counts = zeroCounts();
  for (const e of events) {
    if ((KINDS as string[]).includes(e.kind)) counts[e.kind as FunnelKind] += 1;
  }

  // ── 購入（本番決済・完了したものだけ） ──────────────────
  const paid = input.purchases.filter(
    (p) => p.livemode && (p.status === 'paid' || p.status === 'provisioned') && inWindowISO(p.createdAtISO),
  );
  const byPlan = new Map<string, number>();
  for (const p of paid) byPlan.set(p.planId, (byPlan.get(p.planId) ?? 0) + 1);
  const purchasesByPlan = [...byPlan.entries()]
    .map(([planId, n]) => ({ planId, paid: n }))
    .sort((a, b) => b.paid - a.paid);

  // ── 流入元別 ────────────────────────────────────────
  // LP閲覧は anon_id → first-touch、購入は購入行に焼き付けた値を使う。
  // 台帳が後から更新されても、売上の出どころは動かない
  const attrByAnon = new Map(input.attribution.map((a) => [a.anonId, a]));
  const bySource = new Map<string, SourceRow>();
  const byCampaign = new Map<string, SourceRow>();
  const bump = (m: Map<string, SourceRow>, key: string, field: 'lpViews' | 'purchases') => {
    const cur = m.get(key) ?? { key, lpViews: 0, purchases: 0 };
    cur[field] += 1;
    m.set(key, cur);
  };
  for (const e of events) {
    if (e.kind !== 'lp_view') continue;
    const a = attrByAnon.get(e.anonId);
    bump(bySource, keyOf(a?.ftSource), 'lpViews');
    bump(byCampaign, keyOf(a?.ftCampaign), 'lpViews');
  }
  for (const p of paid) {
    bump(bySource, keyOf(p.attributionSource), 'purchases');
    bump(byCampaign, keyOf(p.attributionCampaign), 'purchases');
  }

  // ── 翌日以降に戻ってきて復習した回数 ─────────────────────
  // 窓で切ると「初回が窓の前」の人を落とすので、初回だけは全期間から探す
  const firstLessonDay = new Map<string, string>();
  for (const e of input.events) {
    if (e.isTest || e.kind !== 'lesson_completed') continue;
    const who = e.userId ?? e.anonId;
    const cur = firstLessonDay.get(who);
    if (!cur || e.occurredOn < cur) firstLessonDay.set(who, e.occurredOn);
  }
  let nextDayReviews = 0;
  for (const e of events) {
    if (e.kind !== 'review_completed') continue;
    const first = firstLessonDay.get(e.userId ?? e.anonId);
    if (first && e.occurredOn > first) nextDayReviews += 1;
  }

  // ── 体験からの移行 ──────────────────────────────────
  // 6か月コースは決済を通さない（人が対応する商品）ので、申込数として別に持つ
  const trialBuyers = new Set(
    input.purchases
      .filter((p) => p.livemode && p.planId === 'ai-trial-pass'
        && (p.status === 'paid' || p.status === 'provisioned') && p.userId)
      .map((p) => p.userId as string),
  );
  const trialToMonth = paid.filter(
    (p) => p.planId === 'ai-month' && p.userId && trialBuyers.has(p.userId),
  ).length;
  const sixMonthApplications = input.applications.filter(
    (a) => a.planId === 'coach-6m' && inWindowISO(a.createdAtISO),
  ).length;

  const hasAnyData = events.length > 0 || paid.length > 0 || sixMonthApplications > 0;

  return {
    window: input.window,
    counts,
    purchasesByPlan,
    bySource: sortRows(bySource),
    byCampaign: sortRows(byCampaign),
    nextDayReviews,
    upgrades: { trialToMonth, sixMonthApplications },
    hasAnyData,
  };
};
