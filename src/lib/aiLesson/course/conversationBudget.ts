// 自分の会話枠の残り（2026-09-09 C-3）。
//
// 数え方はサーバー（ai_start_session）と同じ RPC を使う。画面の数字と、
// 実際に始められるかがズレると、押してから断られることになる。
import { supabase } from '../../../services/supabaseClient';

export interface ConversationBudget {
  /** 枠そのものが無い人（plan_id を持たない従来の生徒）は false。何も表示しない */
  hasBudget: boolean;
  planId: string | null;
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
  voiceTotal: 0, voiceRemainingTotal: 0, voicePerDay: 0,
  voiceRemainingToday: 0, textPerDay: 0, textRemainingToday: 0,
};
