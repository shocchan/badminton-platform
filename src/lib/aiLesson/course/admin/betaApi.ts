// Friends Beta と100人チャレンジのデータ取得・招待発行（管理者のみ）。
// 判定・計算は plans/friendsBeta.ts（純関数）。ここは I/O だけ。
import { supabase } from '../../../../services/supabaseClient';
import { getAccessToken } from '../courseAuth';

export interface BetaDashboard {
  seats: number;
  maxSeats: number;
  started: number;
  firstLessonDone: number;
  secondVisit: number;
  day7: number;
  day30: number;
  /** **推定**のAI原価。実請求ではない（音声は分数からの見積りしか作れない） */
  costUsdEstimated: number;
  costJpyEstimated: number;
  budgetJpy: number;
  days: number;
}

export const fetchBetaDashboard = async (): Promise<BetaDashboard | null> => {
  const { data, error } = await supabase.rpc('ai_admin_beta_dashboard');
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  const d = data as Record<string, unknown>;
  const cfg = (d.config ?? {}) as Record<string, unknown>;
  return {
    seats: Number(d.seats ?? 0),
    maxSeats: Number(d.maxSeats ?? 100),
    started: Number(d.started ?? 0),
    firstLessonDone: Number(d.firstLessonDone ?? 0),
    secondVisit: Number(d.secondVisit ?? 0),
    day7: Number(d.day7 ?? 0),
    day30: Number(d.day30 ?? 0),
    costUsdEstimated: Number(d.costUsdEstimated ?? 0),
    costJpyEstimated: Number(d.costJpyEstimated ?? 0),
    budgetJpy: Number(d.budgetJpy ?? 10000),
    days: Number(cfg.days ?? 30),
  };
};

export interface BetaInvite {
  userId: string;
  /** 4桁区切りの学習コード。**この1回しか返らない** */
  code: string;
  url: string;
  validUntilISO: string;
  seatsUsed: number;
  maxSeats: number;
}

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * 1枠発行する。アカウント作成・受講権・学習コードをサーバー側で1回にまとめる。
 * 失敗理由は画面に出す用の粗いコードだけ返す。
 */
export const issueBetaInvite = async (
  label = '', lang: 'ja' | 'zh' = 'zh',
): Promise<{ ok: true; invite: BetaInvite } | { ok: false; reason: string }> => {
  if (!SUPA_URL || !ANON_KEY) return { ok: false, reason: 'not_configured' };
  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'forbidden' };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-course-beta-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label, lang }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d?.ok !== true) return { ok: false, reason: String(d?.code ?? 'failed') };
    return {
      ok: true,
      invite: {
        userId: String(d.userId ?? ''),
        code: String(d.code ?? ''),
        url: String(d.url ?? ''),
        validUntilISO: String(d.validUntil ?? ''),
        seatsUsed: Number(d.seatsUsed ?? 0),
        maxSeats: Number(d.maxSeats ?? 100),
      },
    };
  } catch {
    return { ok: false, reason: 'network' };
  }
};
