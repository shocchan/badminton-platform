// LP閲覧数の読み出し（I/Oのみ。集計は adminLpViews の純関数）。
import { supabase } from '../../../../services/supabaseClient';
import { summarizeLpViews, type LpViewRow, type LpViewSummary } from './adminLpViews';
import { jstTodayISO } from '../courseUsage';

export const fetchLpViewSummary = async (): Promise<LpViewSummary> => {
  const since = new Date(Date.now() - 31 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('ai_lp_views')
    .select('viewed_on, path, lang, referrer_host, utm_source')
    .gte('viewed_on', since)
    .limit(20000);

  const rows: LpViewRow[] = (error ? [] : data ?? []).map((r) => ({
    viewedOn: String(r.viewed_on),
    path: String(r.path),
    lang: String(r.lang),
    referrerHost: r.referrer_host ? String(r.referrer_host) : null,
    utmSource: r.utm_source ? String(r.utm_source) : null,
  }));
  return summarizeLpViews(rows, jstTodayISO());
};
