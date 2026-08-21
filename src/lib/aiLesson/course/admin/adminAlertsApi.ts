// 運用アラートの取得と解決（Task 1・管理者のみ）。
// 検知は Edge Function `ai-course-monitor`（毎日9:00 JST）。ここは表示と解決だけ。
import { supabase } from '../../../../services/supabaseClient';

export type AlertSeverity = 'critical' | 'warning' | 'info';

export interface AdminAlert {
  id: string;
  kind: string;
  severity: AlertSeverity;
  title: string;
  /** PIIを含まない説明（件数・エラーコード・機能名まで） */
  detail: string;
  subjectUserId: string | null;
  occurrences: number;
  firstSeenISO: string;
  lastSeenISO: string;
  resolved: boolean;
  resolvedBy: string | null;
}

const severityOf = (v: unknown): AlertSeverity =>
  v === 'critical' || v === 'warning' ? v : 'info';

/**
 * アラート一覧。未解決を先に、重い順・新しい順。
 * RLSで管理者以外は0行になる（非管理者に「あるけど見えない」を見せない）。
 */
export const adminListAlerts = async (includeResolved = false): Promise<AdminAlert[]> => {
  let q = supabase
    .from('ai_course_alerts')
    .select('id, kind, severity, title, detail, subject_user_id, occurrences, first_seen_at, last_seen_at, resolved, resolved_by')
    .order('resolved', { ascending: true })
    .order('last_seen_at', { ascending: false })
    .limit(200);
  if (!includeResolved) q = q.eq('resolved', false);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: String(r.id),
    kind: String(r.kind),
    severity: severityOf(r.severity),
    title: String(r.title),
    detail: String(r.detail ?? ''),
    subjectUserId: r.subject_user_id ? String(r.subject_user_id) : null,
    occurrences: Number(r.occurrences ?? 1),
    firstSeenISO: String(r.first_seen_at),
    lastSeenISO: String(r.last_seen_at),
    resolved: !!r.resolved,
    resolvedBy: r.resolved_by ? String(r.resolved_by) : null,
  }));
};

/** 解決/未解決の切り替え（誤操作から戻せるよう双方向）。管理者以外は false が返る */
export const adminResolveAlert = async (id: string, resolved: boolean): Promise<boolean> => {
  const { data, error } = await supabase.rpc('ai_admin_resolve_alert', { p_id: id, p_resolved: resolved });
  if (error) throw new Error(error.message);
  return data === true;
};
