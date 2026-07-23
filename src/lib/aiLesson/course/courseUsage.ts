// 利用上限の取得と残り回数の算出。上限は ai_config.usage_limits（DB）で変更可能。

import { supabase } from '../../../services/supabaseClient';
import { DEFAULT_USAGE_LIMITS } from './courseConfig';

export interface UsageLimits {
  session_max_seconds: number;
  daily_max_sessions: number;
  daily_max_seconds: number;
  monthly_max_sessions: number;
  monthly_max_seconds: number;
  monthly_cost_warn_usd: number;
}

export interface TodayUsage {
  sessionsCount: number;
  secondsUsed: number;
  costUsd: number;
}

export const getUsageLimits = async (): Promise<UsageLimits> => {
  const { data } = await supabase.from('ai_config').select('value').eq('key', 'usage_limits').maybeSingle();
  const v = (data?.value as Partial<UsageLimits> | undefined) ?? undefined;
  return { ...DEFAULT_USAGE_LIMITS, ...(v ?? {}) };
};

export const getTodayUsage = async (learnerId: string): Promise<TodayUsage> => {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from('ai_usage_daily').select('*')
    .eq('learner_id', learnerId).eq('usage_date', today).maybeSingle();
  const r = data as { sessions_count?: number; seconds_used?: number; estimated_cost_usd?: number } | null;
  return { sessionsCount: r?.sessions_count ?? 0, secondsUsed: r?.seconds_used ?? 0, costUsd: Number(r?.estimated_cost_usd ?? 0) };
};

/** 今日あと何回できるか（セッション数と秒数の両方で判定） */
export const remainingSessionsToday = (limits: UsageLimits, usage: TodayUsage): number => {
  const bySessions = Math.max(limits.daily_max_sessions - usage.sessionsCount, 0);
  const bySeconds = usage.secondsUsed >= limits.daily_max_seconds ? 0 : bySessions;
  return Math.min(bySessions, bySeconds);
};
