// 期間制の利用権（半年伴走コースなど）を**サーバーが台帳で確かめる**。
//
// client の申告（hasPeriodAccess）をそのまま信じると、払っていない人でも
// 「払った」と言えば教材が取れてしまう。ここで service_role で台帳を引き直す。
//
// 判定は「日付」だけ。60分パスのように使った時間では終わらない。

export interface PeriodAccessEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
}

interface EntitlementRow {
  granted_at: string;
  expires_at: string;
  period_ends_at: string | null;
  active_seconds: number | null;
}

/**
 * この user が、いま期間制の利用権を持っているか。
 * 引けなかったときは false（＝持っていない扱い）。
 * 通信の失敗で教材が開くより、開かないほうが安全側。
 */
export const hasActivePeriodAccess = async (
  env: PeriodAccessEnv, userId: string, nowMs = Date.now(),
): Promise<boolean> => {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return false;

  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  };

  // 利用権は learner_id で持つので、まず auth の user から learner を引く
  const lr = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ai_learners?user_id=eq.${encodeURIComponent(userId)}&select=id&limit=1`,
    { headers },
  ).catch(() => null);
  if (!lr || !lr.ok) return false;

  let learnerId: string | null;
  try { learnerId = ((await lr.json()) as { id: string }[])[0]?.id ?? null; } catch { return false; }
  if (!learnerId) return false;

  const er = await fetch(
    `${env.SUPABASE_URL}/rest/v1/ai_plan_entitlements`
    + `?learner_id=eq.${encodeURIComponent(learnerId)}&status=eq.active`
    + '&select=granted_at,expires_at,period_ends_at,active_seconds',
    { headers },
  ).catch(() => null);
  if (!er || !er.ok) return false;

  let rows: EntitlementRow[];
  try { rows = await er.json() as EntitlementRow[]; } catch { return false; }

  return rows.some((r) => {
    if (r.active_seconds !== null) return false;      // 時間制は 60分パス側の担当
    const start = Date.parse(r.granted_at);
    const end = Date.parse(r.period_ends_at ?? r.expires_at);
    return Number.isFinite(start) && Number.isFinite(end) && nowMs >= start && nowMs < end;
  });
};
