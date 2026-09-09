// 学習コードの発行・失効・一覧（管理者のみ）。
// 平文が返るのは発行の瞬間だけ。台帳にはハッシュしか無いので、閉じたら二度と見られない。
import { supabase } from '../../../../services/supabaseClient';

export interface LearningCodeRow {
  id: string;
  userId: string;
  /** 先頭3文字だけ（どれを配ったかの見分け用。推測の材料にはならない） */
  codePrefix: string;
  label: string;
  issuedAtISO: string;
  issuedBy: string | null;
  lastUsedAtISO: string | null;
  useCount: number;
  revokedAtISO: string | null;
  revokedReason: string | null;
  isTest: boolean;
}

export interface LearningCodesView {
  rows: LearningCodeRow[];
  /** 直近24時間の失敗した試行数（総当たりの兆候を見る） */
  recentFailures: number;
}

const toRow = (r: Record<string, unknown>): LearningCodeRow => ({
  id: String(r.id ?? ''),
  userId: String(r.userId ?? ''),
  codePrefix: String(r.codePrefix ?? ''),
  label: String(r.label ?? ''),
  issuedAtISO: String(r.issuedAt ?? ''),
  issuedBy: r.issuedBy ? String(r.issuedBy) : null,
  lastUsedAtISO: r.lastUsedAt ? String(r.lastUsedAt) : null,
  useCount: Number(r.useCount ?? 0),
  revokedAtISO: r.revokedAt ? String(r.revokedAt) : null,
  revokedReason: r.revokedReason ? String(r.revokedReason) : null,
  isTest: !!r.isTest,
});

/** 一覧。管理者以外は null（「あるけど見えない」を見せない） */
export const fetchLearningCodes = async (): Promise<LearningCodesView | null> => {
  const { data, error } = await supabase.rpc('ai_admin_learning_codes');
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  const d = data as { rows?: Record<string, unknown>[]; recentFailures?: number };
  return {
    rows: (d.rows ?? []).map(toRow),
    recentFailures: Number(d.recentFailures ?? 0),
  };
};

/**
 * 発行（既定は再発行＝その人の有効な既存コードを失効させてから作る）。
 * 戻り値の `code` は**この1回しか出てこない**。
 */
export const issueLearningCode = async (
  userId: string, label = '', revokeExisting = true,
): Promise<{ ok: true; id: string; code: string } | { ok: false; reason: string }> => {
  const { data, error } = await supabase.rpc('ai_admin_issue_learning_code', {
    p_user_id: userId, p_label: label, p_revoke_existing: revokeExisting,
  });
  if (error) return { ok: false, reason: 'network' };
  const d = data as { ok?: boolean; code?: string; id?: string } | null;
  if (!d || d.ok !== true || typeof d.code !== 'string') {
    return { ok: false, reason: String((d as { code?: string } | null)?.code ?? 'failed') };
  }
  return { ok: true, id: String(d.id ?? ''), code: d.code };
};

/** 失効。学習記録には触れないので、間違えても取り返しがつく（もう一度発行すればよい） */
export const revokeLearningCode = async (id: string, reason = 'revoked'): Promise<boolean> => {
  const { data, error } = await supabase.rpc('ai_admin_revoke_learning_code', { p_id: id, p_reason: reason });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
};
