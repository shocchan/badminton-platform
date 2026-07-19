// 管理者向けデータAPI（ai_is_admin のRLSで全生徒にアクセス可）。
// 一般ユーザーはRLSにより自分の行しか読めないため、この関数群は実質管理者専用。

import { supabase } from '../../../services/supabaseClient';
import type { AdminOverrides, CourseSessionRecord, ItemProgress, Learner, LessonReport } from './types';

export interface AdminLearnerRow extends Learner {
  createdAtISO: string;
}

export const adminListLearners = async (): Promise<AdminLearnerRow[]> => {
  const { data, error } = await supabase.from('ai_learners').select('*').order('updated_at', { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, userId: r.user_id as string, displayName: (r.display_name as string) ?? '',
    preferredLanguage: (r.preferred_language === 'ja' ? 'ja' : 'zh'),
    estimatedLevel: (r.estimated_level as string) ?? 'N3', difficultyLevel: (r.difficulty_level as Learner['difficultyLevel']) ?? 2,
    currentWeek: (r.current_week as number) ?? 1, isActive: (r.is_active as boolean) ?? true,
    hearing: (r.hearing as Record<string, unknown>) ?? {}, settings: (r.settings as Learner['settings']) ?? {} as Learner['settings'],
    adminOverrides: (r.admin_overrides as AdminOverrides) ?? {}, createdAtISO: (r.created_at as string) ?? '',
  }));
};

export const adminGetProgress = async (learnerId: string): Promise<ItemProgress[]> => {
  const { data } = await supabase.from('ai_item_progress').select('*').eq('learner_id', learnerId);
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    itemId: r.item_id as string, masteryState: r.mastery_state as ItemProgress['masteryState'],
    masteryScore: Number(r.mastery_score), firstLearnedAt: r.first_learned_at as string,
    lastPracticedAt: r.last_practiced_at as string, nextReviewAt: r.next_review_at as string | null,
    reviewStage: r.review_stage as ItemProgress['reviewStage'],
    successfulReviews: r.successful_reviews as number, failedReviews: r.failed_reviews as number,
  }));
};

export const adminGetSessions = async (learnerId: string, limit = 30): Promise<CourseSessionRecord[]> => {
  const { data } = await supabase.from('ai_learning_sessions').select('*')
    .eq('learner_id', learnerId).order('started_at', { ascending: false }).limit(limit);
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string, missionId: r.mission_id as string, mode: r.mode as 'voice' | 'text',
    lessonKind: r.lesson_kind as CourseSessionRecord['lessonKind'], difficulty: r.difficulty as number,
    startedAt: r.started_at as string, endedAt: r.ended_at as string | null, durationSeconds: r.duration_seconds as number,
    completionStatus: r.completion_status as CourseSessionRecord['completionStatus'], endReason: r.end_reason as string | null,
    targetExpression: r.target_expression as string, targetUsed: r.target_used as boolean,
    targetUsedIndependently: r.target_used_independently as boolean, hintsUsed: r.hints_used as number,
    chineseSupportUsed: r.chinese_support_used as boolean, errorCode: r.error_code as string | null,
    estimatedCostUsd: Number(r.estimated_cost_usd ?? 0), report: (r.report as LessonReport) ?? null,
  }));
};

export const adminUpdateLearner = async (
  learnerId: string,
  patch: Partial<{ difficultyLevel: number; isActive: boolean; adminOverrides: AdminOverrides; settings: Learner['settings'] }>,
): Promise<boolean> => {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.difficultyLevel !== undefined) row.difficulty_level = patch.difficultyLevel;
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (patch.adminOverrides !== undefined) row.admin_overrides = patch.adminOverrides;
  if (patch.settings !== undefined) row.settings = patch.settings;
  const { error } = await supabase.from('ai_learners').update(row).eq('id', learnerId);
  return !error;
};
