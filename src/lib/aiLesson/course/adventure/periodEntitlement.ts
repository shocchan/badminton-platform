// 期間制の利用権（半年伴走コースなど）を台帳から読む。
//
// 60分パスは「使った時間」で終わるが、こちらは「日付」で終わる。
// 混ぜると片方の終了条件でもう片方が止まるので、判定を分けて持つ。
//
// 読むのは ai_plan_entitlements。RLSで自分の行しか見えないので、
// ここで他人の利用権を引くことはできない（見えたとしても教材はサーバーが拒否する）。

import { supabase } from '../../../../services/supabaseClient';

export interface PeriodEntitlement {
  id: string;
  planId: string;
  /** 使い始められる日時 */
  startsAtMs: number;
  /** これを過ぎたら終わり */
  endsAtMs: number;
}

export type PeriodState =
  | { kind: 'none' }
  | { kind: 'before_start'; entitlement: PeriodEntitlement }
  | { kind: 'active'; entitlement: PeriodEntitlement }
  | { kind: 'expired'; entitlement: PeriodEntitlement };

interface Row {
  id: string;
  plan_id: string;
  granted_at: string;
  expires_at: string;
  period_ends_at: string | null;
  active_seconds: number | null;
  status: string;
}

/** 時間制（active_seconds あり）は 60分パス側の担当なので、ここでは拾わない */
const toPeriod = (r: Row): PeriodEntitlement | null => {
  if (r.active_seconds !== null) return null;
  const startsAtMs = Date.parse(r.granted_at);
  const endsAtMs = Date.parse(r.period_ends_at ?? r.expires_at);
  if (!Number.isFinite(startsAtMs) || !Number.isFinite(endsAtMs)) return null;
  return { id: r.id, planId: r.plan_id, startsAtMs, endsAtMs };
};

/**
 * いま有効な期間制の利用権。
 * 取得に失敗したときは `none`（＝利用権なし扱い）。
 * 通信の失敗で教材が開いてしまうより、開かないほうが安全側。
 */
export const currentPeriodEntitlement = async (
  learnerId: string, nowMs = Date.now(),
): Promise<PeriodState> => {
  const { data, error } = await supabase
    .from('ai_plan_entitlements')
    .select('id,plan_id,granted_at,expires_at,period_ends_at,active_seconds,status')
    .eq('learner_id', learnerId)
    .eq('status', 'active')
    .order('expires_at', { ascending: false });

  if (error || !data) return { kind: 'none' };

  const periods = (data as Row[]).map(toPeriod).filter((p): p is PeriodEntitlement => p !== null);
  if (periods.length === 0) return { kind: 'none' };

  // 使えるものがあればそれを優先。無ければ「これから」「もう終わった」を返して
  // 画面が理由を説明できるようにする
  const usable = periods.find((p) => nowMs >= p.startsAtMs && nowMs < p.endsAtMs);
  if (usable) return { kind: 'active', entitlement: usable };

  const upcoming = periods.filter((p) => nowMs < p.startsAtMs)
    .sort((a, b) => a.startsAtMs - b.startsAtMs)[0];
  if (upcoming) return { kind: 'before_start', entitlement: upcoming };

  const latest = periods.sort((a, b) => b.endsAtMs - a.endsAtMs)[0];
  return { kind: 'expired', entitlement: latest };
};
