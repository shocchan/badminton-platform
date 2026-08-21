// 学習ファネルのI/O（Phase 1 計測基盤）。集計は adminFunnel.ts（純関数）に任せ、
// ここは**読むだけ**。管理者RLS（本人 or ai_is_admin）で直接SELECTする。
// 失敗した系列は空配列で返す＝ファネルは出るが該当段が0になる。呼び出し側でエラー表示する。
import { supabase } from '../../../../services/supabaseClient';
import { adminListPurchases } from './adminAccountsApi';
import { buildCourseFunnel, type CourseFunnel, type FunnelEventRow, type FunnelLearnerRow, type FunnelSessionRow, type FunnelUsageRow } from './adminFunnel';

const sinceISO = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

export const fetchCourseFunnel = async (windowDays = 30): Promise<{ funnel: CourseFunnel; failed: string[] }> => {
  const failed: string[] = [];
  // 再訪の「初回判定」に全期間の初日が要るため、learner/sessions/usage は窓より広めに取る
  const wide = sinceISO(windowDays + 40);
  const since = sinceISO(windowDays);

  const [purchases, learnersQ, sessionsQ, usageQ, eventsQ, accessQ] = await Promise.all([
    adminListPurchases().catch(() => { failed.push('purchases'); return []; }),
    supabase.from('ai_learners').select('id, user_id, created_at, is_test').limit(2000),
    supabase.from('ai_learning_sessions')
      .select('learner_id, started_at, completion_status, lesson_kind, error_code')
      .gte('started_at', wide).limit(5000),
    supabase.from('ai_usage_daily').select('learner_id, usage_date').limit(5000),
    supabase.from('ai_course_events').select('user_id, kind, created_at').gte('created_at', since).limit(5000),
    supabase.from('ai_course_access').select('user_id, source').limit(2000),
  ]);

  // テスト判定は2経路（ai_learners.is_test / 受講権 source='test'）。管理画面の型判定と同じ規律
  const testUserIds = new Set(
    (accessQ.error ? [] : accessQ.data ?? [])
      .filter((r) => String(r.source ?? '') === 'test')
      .map((r) => String(r.user_id)),
  );
  if (accessQ.error) failed.push('access');
  const learners: FunnelLearnerRow[] = (learnersQ.error ? [] : learnersQ.data ?? []).map((r) => ({
    id: String(r.id), userId: r.user_id ? String(r.user_id) : null, createdAtISO: String(r.created_at),
    isTest: !!r.is_test || (r.user_id ? testUserIds.has(String(r.user_id)) : false),
  }));
  if (learnersQ.error) failed.push('learners');
  const sessions: FunnelSessionRow[] = (sessionsQ.error ? [] : sessionsQ.data ?? []).map((r) => ({
    learnerId: String(r.learner_id), startedAtISO: String(r.started_at),
    completionStatus: String(r.completion_status ?? ''), lessonKind: String(r.lesson_kind ?? ''),
    errorCode: r.error_code === null || r.error_code === undefined ? null : String(r.error_code),
  }));
  if (sessionsQ.error) failed.push('sessions');
  const usage: FunnelUsageRow[] = (usageQ.error ? [] : usageQ.data ?? []).map((r) => ({
    learnerId: String(r.learner_id), usageDate: String(r.usage_date),
  }));
  if (usageQ.error) failed.push('usage');
  const events: FunnelEventRow[] = (eventsQ.error ? [] : eventsQ.data ?? []).map((r) => ({
    userId: String(r.user_id), kind: String(r.kind), createdAtISO: String(r.created_at),
  }));
  if (eventsQ.error) failed.push('events');

  return {
    funnel: buildCourseFunnel({ purchases, learners, sessions, usage, events, nowISO: new Date().toISOString(), windowDays }),
    failed,
  };
};
