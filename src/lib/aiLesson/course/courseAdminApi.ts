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
    id: r.id as string, userId: r.user_id as string,
    startedAtISO: (r.created_at as string) ?? null,
    displayName: (r.display_name as string) ?? '',
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

// ── 問題報告（§18）・プライバシー操作（§13）・テストデータ削除（§21） ──

export interface AdminIssueReport {
  id: string;
  learnerId: string | null;
  sessionId: string | null;
  page: string | null;
  errorCode: string | null;
  userAgent: string | null;
  platform: string | null;
  online: boolean | null;
  comment: string | null;
  resolved: boolean;
  createdAt: string;
}

export const adminListIssueReports = async (limit = 50): Promise<AdminIssueReport[]> => {
  const { data } = await supabase.from('ai_issue_reports').select('*')
    .order('created_at', { ascending: false }).limit(limit);
  if (!data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    learnerId: (r.learner_id as string) ?? null,
    sessionId: (r.session_id as string) ?? null,
    page: (r.page as string) ?? null,
    errorCode: (r.error_code as string) ?? null,
    userAgent: (r.user_agent as string) ?? null,
    platform: (r.platform as string) ?? null,
    online: (r.online as boolean) ?? null,
    comment: (r.comment as string) ?? null,
    resolved: (r.resolved as boolean) ?? false,
    createdAt: r.created_at as string,
  }));
};

export const adminResolveIssue = async (id: string, resolved: boolean): Promise<boolean> => {
  const { error } = await supabase.from('ai_issue_reports').update({ resolved }).eq('id', id);
  return !error;
};

/** 対象生徒の発話ログ（文字起こし）だけを削除する。レポート・進捗は残る */
export const adminDeleteUtterances = async (learnerId: string): Promise<number> => {
  const { data, error } = await supabase.rpc('ai_admin_delete_utterances', { p_learner_id: learnerId });
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
};

/** staging受入テストで作った is_test の生徒を一括削除（本番データと混ざらないようにする） */
export const adminDeleteTestLearners = async (): Promise<number> => {
  const { data, error } = await supabase.rpc('ai_delete_test_learners');
  if (error) return 0;
  return typeof data === 'number' ? data : 0;
};

// ── 利用とコスト（§管理画面で生徒ごとに確認） ──

export interface DailyUsagePoint { date: string; sessions: number; seconds: number; costUsd: number; }
export interface AdminUsageCost {
  month: { sessions: number; seconds: number; costUsd: number };
  today: { sessions: number; seconds: number; costUsd: number };
  days: DailyUsagePoint[];        // 当月の日次（古い→新しい）
  monthlyMaxSessions: number;     // 上限（learner個別 > config > 既定80）
  monthlyMaxSeconds: number;
}

/** YYYY-MM-DD（Asia/Tokyo）。サーバーの ai_start_session と日付基準を合わせる */
const jstDate = (d: Date): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(d);

/** 対象生徒の「今月」の利用量・推定コストを集計（ai_usage_daily を当月で合算） */
export const adminGetUsageCost = async (learner: AdminLearnerRow): Promise<AdminUsageCost> => {
  const today = jstDate(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const { data } = await supabase.from('ai_usage_daily')
    .select('usage_date, sessions_count, seconds_used, estimated_cost_usd')
    .eq('learner_id', learner.id).gte('usage_date', monthStart)
    .order('usage_date', { ascending: true });
  const rows = (data ?? []) as { usage_date: string; sessions_count: number; seconds_used: number; estimated_cost_usd: number }[];

  const days: DailyUsagePoint[] = rows.map((r) => ({
    date: r.usage_date, sessions: r.sessions_count ?? 0,
    seconds: r.seconds_used ?? 0, costUsd: Number(r.estimated_cost_usd ?? 0),
  }));
  const month = days.reduce((a, d) => ({
    sessions: a.sessions + d.sessions, seconds: a.seconds + d.seconds, costUsd: a.costUsd + d.costUsd,
  }), { sessions: 0, seconds: 0, costUsd: 0 });
  const t = days.find((d) => d.date === today);
  const todayUsage = t ?? { sessions: 0, seconds: 0, costUsd: 0 };

  // 上限は learner個別指定 > ai_config > 既定
  const { data: cfg } = await supabase.from('ai_config').select('value').eq('key', 'usage_limits').maybeSingle();
  const limits = (cfg?.value as Record<string, number> | undefined) ?? {};
  const monthlyMaxSessions = learner.adminOverrides.monthlyMaxSessions ?? limits.monthly_max_sessions ?? 80;
  const monthlyMaxSeconds = learner.adminOverrides.monthlyMaxSeconds ?? limits.monthly_max_seconds ?? 21600;

  return {
    month,
    today: { sessions: todayUsage.sessions, seconds: todayUsage.seconds, costUsd: todayUsage.costUsd },
    days, monthlyMaxSessions, monthlyMaxSeconds,
  };
};
