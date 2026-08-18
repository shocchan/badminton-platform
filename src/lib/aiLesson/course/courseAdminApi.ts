// 管理者向けデータAPI（ai_is_admin のRLSで全生徒にアクセス可）。
// 一般ユーザーはRLSにより自分の行しか読めないため、この関数群は実質管理者専用。

import { supabase } from '../../../services/supabaseClient';
import type { AdminOverrides, CourseSessionRecord, ItemProgress, Learner, LessonReport, SpeechMetrics } from './types';
import type { UsageLimits } from './admin/adminAccountsApi';

export interface AdminLearnerRow extends Learner {
  createdAtISO: string;
  /** staging受入テスト用アカウント（一括削除の対象）。DB: ai_learners.is_test */
  isTest: boolean;
}

const mapLearnerRow = (r: Record<string, unknown>): AdminLearnerRow => ({
  id: r.id as string, userId: r.user_id as string,
  startedAtISO: (r.created_at as string) ?? null,
  displayName: (r.display_name as string) ?? '',
  preferredLanguage: (r.preferred_language === 'ja' ? 'ja' : 'zh'),
  estimatedLevel: (r.estimated_level as string) ?? 'N3', difficultyLevel: (r.difficulty_level as Learner['difficultyLevel']) ?? 2,
  currentWeek: (r.current_week as number) ?? 1, isActive: (r.is_active as boolean) ?? true,
  hearing: (r.hearing as Record<string, unknown>) ?? {}, settings: (r.settings as Learner['settings']) ?? {} as Learner['settings'],
  adminOverrides: (r.admin_overrides as AdminOverrides) ?? {}, createdAtISO: (r.created_at as string) ?? '',
  isTest: (r.is_test as boolean) ?? false,
});

export const adminListLearners = async (): Promise<AdminLearnerRow[]> => {
  const { data, error } = await supabase.from('ai_learners').select('*').order('updated_at', { ascending: false });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapLearnerRow);
};

/**
 * learner 1行だけを取り直す（stale settings 上書き防止の要・2026-08-18 P0）。
 * settings を書く操作（学習設計調整・先生コメント・操作パネル）の完了後は、
 * 必ずこれで最新行を取り直してから次の書き込みの土台にすること。
 * 古い settings を土台に writeAdvProfile で全書き戻しすると、直前の変更が黙って消える。
 */
export const adminGetLearner = async (learnerId: string): Promise<AdminLearnerRow | null> => {
  const { data, error } = await supabase.from('ai_learners').select('*').eq('id', learnerId).maybeSingle();
  if (error || !data) return null;
  return mapLearnerRow(data as Record<string, unknown>);
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
    // 生徒側 courseRepository.listRecentSessions と同じ変換。これが無いと
    // 成長根拠（calculateSpeakingGrowth）が全セッションを「メトリクス無し」として除外する
    speechMetrics: (r.speech_metrics && typeof (r.speech_metrics as SpeechMetrics).studentTurns === 'number'
      ? (r.speech_metrics as SpeechMetrics) : undefined),
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

/**
 * 対象生徒の「今月」の利用量・推定コストを集計（ai_usage_daily を当月で合算）。
 * 上限は呼び出し側が adminGetUsageLimits() で一度だけ解決して渡す
 * （画面ごとに ai_config を読み直して値がずれる二重ソースを廃止・2026-08-18）。
 */
export const adminGetUsageCost = async (learner: AdminLearnerRow, limits: UsageLimits): Promise<AdminUsageCost> => {
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

  // 上限は learner個別指定 > 全体設定（引数で受ける）
  const monthlyMaxSessions = learner.adminOverrides.monthlyMaxSessions ?? limits.monthlyMaxSessions;
  const monthlyMaxSeconds = learner.adminOverrides.monthlyMaxSeconds ?? limits.monthlyMaxSeconds;

  return {
    month,
    today: { sessions: todayUsage.sessions, seconds: todayUsage.seconds, costUsd: todayUsage.costUsd },
    days, monthlyMaxSessions, monthlyMaxSeconds,
  };
};

// ── 生徒一覧カード用: 全生徒の今月サマリを1クエリで取得 ──

export interface LearnerUsageSummary { sessions: number; costUsd: number; lastDate: string | null; }

/** 全生徒の「今月」の回数・推定コスト・最終利用日を learner_id ごとに集計 */
export const adminGetMonthlyUsageMap = async (): Promise<Record<string, LearnerUsageSummary>> => {
  const today = jstDate(new Date());
  const monthStart = `${today.slice(0, 7)}-01`;
  const { data } = await supabase.from('ai_usage_daily')
    .select('learner_id, usage_date, sessions_count, estimated_cost_usd')
    .gte('usage_date', monthStart);
  const map: Record<string, LearnerUsageSummary> = {};
  for (const r of (data ?? []) as { learner_id: string; usage_date: string; sessions_count: number; estimated_cost_usd: number }[]) {
    const m = map[r.learner_id] ?? { sessions: 0, costUsd: 0, lastDate: null };
    m.sessions += r.sessions_count ?? 0;
    m.costUsd += Number(r.estimated_cost_usd ?? 0);
    if (!m.lastDate || r.usage_date > m.lastDate) m.lastDate = r.usage_date;
    map[r.learner_id] = m;
  }
  return map;
};

// ログイン状況の adminGetLearnerLogins は管理ページ刷新（2026-08-18）で廃止。
// 後継は adminAccountsApi.adminListAccounts（auth.users 起点・RPC ai_admin_list_accounts）。
// RPC ai_admin_learner_logins 本体はDBに残してある（adminAccountsApi のフェイルソフトが使う）。

// ── 受講権（利用期間）の管理（2026-08-18 CEO指示） ──
// 書き込みは ai_course_access のRLS（ai_is_admin）が守る。ここはUIの手足

/** 受講権の発行元。purchase は将来の決済フロー専用（管理UIからは設定しない） */
export type AdminAccessSource = 'manual' | 'purchase' | 'test';

export interface AdminAccessRow {
  userId: string;
  validFromISO: string;
  validUntilISO: string;
  note: string | null;
  updatedAtISO: string;
  /** 紐づく商品（planCatalog.ts の PlanId）。手動発行なら null */
  planId: string | null;
  planVersion: number | null;
  source: AdminAccessSource;
  /** AI会話の累計上限秒（体験パス等）。null＝商品由来の上限なし */
  aiSecondsLimit: number | null;
  /** 「いつ誰が」の誰（admin-ui 等）。受講権台帳の表示用 */
  grantedBy: string | null;
}

export const adminListAccess = async (): Promise<Record<string, AdminAccessRow>> => {
  const { data, error } = await supabase.from('ai_course_access').select('*');
  if (error || !data) return {};
  const out: Record<string, AdminAccessRow> = {};
  for (const r of data as Record<string, unknown>[]) {
    out[r.user_id as string] = {
      userId: r.user_id as string,
      validFromISO: r.valid_from as string,
      validUntilISO: r.valid_until as string,
      note: (r.note as string) ?? null,
      updatedAtISO: r.updated_at as string,
      planId: (r.plan_id as string) ?? null,
      planVersion: typeof r.plan_version === 'number' ? r.plan_version : null,
      source: (r.source as AdminAccessSource) ?? 'manual',
      aiSecondsLimit: typeof r.ai_seconds_limit === 'number' ? r.ai_seconds_limit : null,
      grantedBy: (r.granted_by as string) ?? null,
    };
  }
  return out;
};

/**
 * 期間の設定・変更（upsert）。「いつ誰が」は granted_by と updated_at に残る。
 * 日付はJSTの「その日の終わりまで」に丸める（valid_until）・「その日の始まりから」（valid_from）。
 *
 * opts で渡された列**だけ**をペイロードに含める（未指定列は既存値温存）。
 * これが無いと、将来の source='purchase' 行（決済で自動発行）を
 * 管理UIの期間変更が黙って 'manual' に潰してしまう。
 * 管理UIから設定できる source は manual | test のみ（purchase は決済フロー専用）。
 */
export const adminSetAccess = async (
  userId: string, validFromDate: string, validUntilDate: string, note: string,
  opts?: { planId?: string | null; planVersion?: number | null; source?: 'manual' | 'test' },
): Promise<{ ok: boolean; error?: string }> => {
  const row: Record<string, unknown> = {
    user_id: userId,
    valid_from: `${validFromDate}T00:00:00+09:00`,
    valid_until: `${validUntilDate}T23:59:59+09:00`,
    note: note || null,
    granted_by: 'admin-ui',
    updated_at: new Date().toISOString(),
  };
  if (opts?.planId !== undefined) row.plan_id = opts.planId;
  if (opts?.planVersion !== undefined) row.plan_version = opts.planVersion;
  if (opts?.source !== undefined) row.source = opts.source;
  const { error } = await supabase.from('ai_course_access').upsert(row, { onConflict: 'user_id' });
  return error ? { ok: false, error: error.message } : { ok: true };
};
