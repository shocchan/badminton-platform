// 教材レビューの記録・取得（Task 3・管理者のみ）。
// 教材本文はコード側（contentReviewQueue）。ここは人の判定だけを読み書きする。
import { supabase } from '../../../../services/supabaseClient';
import type { ContentKind, ReviewStatus } from './contentReviewQueue';

export interface ContentReviewState {
  status: ReviewStatus;
  note: string;
  reviewedBy: string;
  reviewedAtISO: string;
  /** 何回判定し直したか（履歴の件数） */
  revisions: number;
}

export const reviewKeyOf = (kind: ContentKind, id: string): string => `${kind}:${id}`;

const asStatus = (v: unknown): ReviewStatus =>
  v === 'reviewed' || v === 'needs_fix' ? v : 'unreviewed';

/** 現在の判定（種別×IDごとの最新）。管理者以外は空 */
export const adminListContentReviews = async (): Promise<Map<string, ContentReviewState>> => {
  const { data, error } = await supabase.rpc('ai_admin_list_content_reviews');
  if (error) throw new Error(error.message);
  const map = new Map<string, ContentReviewState>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    map.set(reviewKeyOf(String(r.content_kind) as ContentKind, String(r.content_id)), {
      status: asStatus(r.status),
      note: String(r.note ?? ''),
      reviewedBy: String(r.reviewed_by ?? ''),
      reviewedAtISO: String(r.reviewed_at ?? ''),
      revisions: Number(r.revisions ?? 1),
    });
  }
  return map;
};

/**
 * 1件だけ記録する（追記＝履歴が残る）。
 * 一括更新の関数は**用意しない**（全件を一度に確認済みにできないようにするため）。
 */
export const adminSetContentReview = async (
  kind: ContentKind, contentId: string, status: ReviewStatus, note: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('ai_admin_set_content_review', {
    p_kind: kind, p_content_id: contentId, p_status: status, p_note: note,
  });
  if (error) throw new Error(error.message);
  return data === true;
};

export interface ContentReviewHistoryRow {
  status: ReviewStatus; note: string; reviewedBy: string; createdAtISO: string;
}

/** 1件の履歴（誤操作から戻すときに、いつ何にしたかを見る） */
export const adminContentReviewHistory = async (
  kind: ContentKind, contentId: string,
): Promise<ContentReviewHistoryRow[]> => {
  const { data, error } = await supabase.rpc('ai_admin_content_review_history', {
    p_kind: kind, p_content_id: contentId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    status: asStatus(r.status),
    note: String(r.note ?? ''),
    reviewedBy: String(r.reviewed_by ?? ''),
    createdAtISO: String(r.created_at ?? ''),
  }));
};
