// 自分の会話枠の残り（2026-09-09 C-3）。
//
// 数え方はサーバー（ai_start_session）と同じ RPC を使う。画面の数字と、
// 実際に始められるかがズレると、押してから断られることになる。
import { supabase } from '../../../services/supabaseClient';

export interface ConversationBudget {
  /**
   * 枠の情報が取れたか。**2026-09-09 から全員 true**（週3回の上限は
   * プランの有無に関係なくかかるため）。取得できなかったときだけ false。
   */
  hasBudget: boolean;
  planId: string | null;
  /** 週の上限（既定3回・全員） */
  voicePerWeek: number;
  /** 今週あと何回できるか */
  voiceRemainingWeek: number;
  /** 週の枠を使い切った人に「いつ1回もどるか」。まだ余っていれば null */
  nextVoiceAvailableAtISO: string | null;
  /** 回数券の残り */
  credits: number;
  voiceTotal: number;
  voiceRemainingTotal: number;
  voicePerDay: number;
  voiceRemainingToday: number;
  textPerDay: number;
  textRemainingToday: number;
}

export const fetchConversationBudget = async (): Promise<ConversationBudget | null> => {
  const { data, error } = await supabase.rpc('ai_my_conversation_budget');
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  const d = data as Record<string, unknown>;
  if (d.hasBudget !== true) return { ...EMPTY, hasBudget: false };
  return {
    hasBudget: true,
    planId: d.planId ? String(d.planId) : null,
    voicePerWeek: Number(d.voicePerWeek ?? 0),
    voiceRemainingWeek: Number(d.voiceRemainingWeek ?? 0),
    nextVoiceAvailableAtISO: d.nextVoiceAvailableAt ? String(d.nextVoiceAvailableAt) : null,
    credits: Number(d.credits ?? 0),
    voiceTotal: Number(d.voiceTotal ?? 0),
    voiceRemainingTotal: Number(d.voiceRemainingTotal ?? 0),
    voicePerDay: Number(d.voicePerDay ?? 0),
    voiceRemainingToday: Number(d.voiceRemainingToday ?? 0),
    textPerDay: Number(d.textPerDay ?? 0),
    textRemainingToday: Number(d.textRemainingToday ?? 0),
  };
};

const EMPTY: ConversationBudget = {
  hasBudget: false, planId: null,
  voicePerWeek: 0, voiceRemainingWeek: 0, nextVoiceAvailableAtISO: null, credits: 0,
  voiceTotal: 0, voiceRemainingTotal: 0, voicePerDay: 0,
  voiceRemainingToday: 0, textPerDay: 0, textRemainingToday: 0,
};
