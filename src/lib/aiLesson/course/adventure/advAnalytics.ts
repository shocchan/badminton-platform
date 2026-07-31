// V2計測（§24）。既存courseAnalytics（gtag存在時のみ・sandbox中停止）へ委譲。
// 送信禁止: 会話本文・名前・メール・自由記述・音声・個別の誤答文全文。
import { trackCourse } from '../courseAnalytics';
import type { AdvGoalType, AdvSkill, JlptLevel } from './advTypes';

export type AdvEventName =
  | 'onboarding_started' | 'goal_selected' | 'target_level_selected'
  | 'diagnosis_started' | 'diagnosis_completed' | 'route_generated'
  | 'today_quest_viewed' | 'today_quest_started' | 'today_quest_completed'
  | 'battle_started' | 'battle_completed'
  | 'mastery_80_reached' | 'delayed_mastery_reached'
  | 'conversation_started' | 'conversation_completed'
  | 'report_viewed' | 'next_quest_started' | 'human_lesson_summary_viewed';

export interface AdvEventParams {
  goalType?: AdvGoalType;
  targetLevel?: JlptLevel;
  routeStage?: string;
  skillType?: AdvSkill;
  durationBucket?: '5' | '15' | '30';
  locale?: 'ja' | 'zh';
}

const ALLOWED_KEYS = new Set(['goalType', 'targetLevel', 'routeStage', 'skillType', 'durationBucket', 'locale']);

/** 許可キー以外は送らない（誤って本文等が混ざるのを型と実行時の二重で防ぐ） */
export const trackAdv = (event: AdvEventName, params: AdvEventParams = {}): void => {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (!ALLOWED_KEYS.has(k) || typeof v !== 'string') continue;
    safe[k] = v.slice(0, 40);
  }
  trackCourse(`adv_${event}`, safe);
};
