// 販売ファネルの読み取り（2026-08-26 Phase S8）。集計は salesFunnel.ts（純関数）に任せる。
//
// 読むだけ。RLSで管理者以外は0行になる。
// 失敗した系列は空で返し、**どれが失敗したかを呼び出し側へ返す**。
// 「0件」と「取れなかった」を画面で言い分けられないと、数字を信じられなくなる。
import { supabase } from '../../../../services/supabaseClient';
import { adminListPurchases } from './adminAccountsApi';
import {
  buildSalesFunnel, WINDOW_DAYS,
  type SalesFunnel, type SalesWindow,
  type SalesEventRow, type SalesAttributionRow, type SalesPurchaseRow, type SalesApplicationRow,
} from './salesFunnel';

/** 全期間でも取りすぎない上限。超えたら画面に「一部のみ」と出す判断材料にする */
const ROW_LIMIT = 5000;

export const fetchSalesFunnel = async (
  window: SalesWindow,
): Promise<{ funnel: SalesFunnel; failed: string[]; truncated: boolean }> => {
  const failed: string[] = [];
  const days = WINDOW_DAYS[window];
  // イベントは「翌日復習」の判定に初回が要るので、窓より広めに取る（all は全部）
  const sinceISO = days === null ? null : new Date(Date.now() - (days + 40) * 86_400_000).toISOString();

  let eventsQuery = supabase
    .from('ai_funnel_events')
    .select('anon_id, user_id, kind, plan_id, occurred_on, occurred_at, is_test')
    .order('occurred_at', { ascending: false })
    .limit(ROW_LIMIT);
  if (sinceISO) eventsQuery = eventsQuery.gte('occurred_at', sinceISO);

  const [eventsQ, attrQ, purchases, appsQ] = await Promise.all([
    eventsQuery,
    supabase.from('ai_attribution').select('anon_id, ft_source, ft_campaign').limit(ROW_LIMIT),
    adminListPurchases().catch(() => { failed.push('purchases'); return []; }),
    supabase.from('ai_plan_applications').select('plan_id, created_at').limit(2000),
  ]);

  if (eventsQ.error) failed.push('events');
  if (attrQ.error) failed.push('attribution');
  if (appsQ.error) failed.push('applications');

  const events: SalesEventRow[] = (eventsQ.error ? [] : eventsQ.data ?? []).map((r) => ({
    anonId: String(r.anon_id),
    userId: r.user_id ? String(r.user_id) : null,
    kind: String(r.kind),
    planId: r.plan_id ? String(r.plan_id) : null,
    occurredOn: String(r.occurred_on),
    occurredAtISO: String(r.occurred_at),
    isTest: r.is_test === true,
  }));

  const attribution: SalesAttributionRow[] = (attrQ.error ? [] : attrQ.data ?? []).map((r) => ({
    anonId: String(r.anon_id),
    ftSource: (r.ft_source as string) ?? null,
    ftCampaign: (r.ft_campaign as string) ?? null,
  }));

  const purchaseRows: SalesPurchaseRow[] = purchases.map((p) => ({
    userId: p.userId,
    planId: p.planId,
    status: p.status,
    livemode: p.livemode,
    createdAtISO: p.createdAtISO,
    attributionSource: p.attributionSource ?? null,
    attributionCampaign: p.attributionCampaign ?? null,
  }));

  const applications: SalesApplicationRow[] = (appsQ.error ? [] : appsQ.data ?? []).map((r) => ({
    planId: String(r.plan_id ?? ''),
    createdAtISO: String(r.created_at ?? ''),
  }));

  return {
    funnel: buildSalesFunnel({
      events, attribution, purchases: purchaseRows, applications,
      window, nowISO: new Date().toISOString(),
    }),
    failed,
    truncated: events.length >= ROW_LIMIT,
  };
};
