// 受講者の声の読み取りと承認（管理者のみ・2026-08-26 Phase S7）。
//
// 【この層の責任】
// 「許諾がある」ことと「掲載してよい」ことを**分けたまま**扱う。
// 許諾済みでも approved_at が入るまでは公開物ではない。
// 自動公開はしない（承認は人が押す）。
import { supabase } from '../../../../services/supabaseClient';

export interface TestimonialRow {
  id: string;
  userId: string;
  learnerId: string | null;
  body: string;
  locale: string;
  /** report / trial_end など。どの場面の直後に書かれたか */
  context: string | null;
  /** 本人が「掲載してよい」と言ったか。false のものは掲載できない */
  consentPublish: boolean;
  /** 本人が決めた呼び名。null＝匿名で扱う */
  displayName: string | null;
  /** 管理者が掲載を承認した時刻。null＝未承認＝非公開 */
  approvedAtISO: string | null;
  /** 却下した時刻。null＝まだ判断していない（承認と却下が同時に立つことはない） */
  rejectedAtISO: string | null;
  rejectReason: string | null;
  /** 本人が「名前は出さないでほしい」と言ったか。表示名の有無とは別の意思 */
  anonymous: boolean;
  /**
   * 掲載用の編集案（誤字直しなど）。**原文（body）は書き換えない。**
   * null なら原文をそのまま載せる。
   */
  editedBody: string | null;
  createdAtISO: string;
}

/** 実際に掲載される文（編集案があればそれ、無ければ原文） */
export const publishText = (t: TestimonialRow): string => t.editedBody ?? t.body;

/** 掲載できる状態か（許諾＋承認が揃い、却下されていない） */
export const isPublishable = (t: TestimonialRow): boolean =>
  t.consentPublish && t.approvedAtISO !== null && t.rejectedAtISO === null;

/** 管理画面での並び。手を打つ必要がある順 */
export type TestimonialBucket = 'awaiting_review' | 'no_consent' | 'published' | 'rejected';

export const bucketOf = (t: TestimonialRow): TestimonialBucket => {
  if (t.rejectedAtISO !== null) return 'rejected';
  if (!t.consentPublish) return 'no_consent';
  return t.approvedAtISO === null ? 'awaiting_review' : 'published';
};

const BUCKET_ORDER: Record<TestimonialBucket, number> = {
  awaiting_review: 0, no_consent: 1, published: 2, rejected: 3,
};

export const sortForAdmin = (rows: TestimonialRow[]): TestimonialRow[] =>
  [...rows].sort((a, b) =>
    (BUCKET_ORDER[bucketOf(a)] - BUCKET_ORDER[bucketOf(b)])
    || (a.createdAtISO < b.createdAtISO ? 1 : -1));

/** 全件（管理者以外はRLSで0行）。失敗時は空配列＋error を返し、黙って0件にしない */
export const adminListTestimonials = async (): Promise<{ rows: TestimonialRow[]; failed: boolean }> => {
  const { data, error } = await supabase
    .from('ai_testimonials')
    .select('id, user_id, learner_id, body, locale, context, consent_publish, display_name, approved_at, created_at, rejected_at, reject_reason, anonymous, edited_body')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !Array.isArray(data)) return { rows: [], failed: true };
  return {
    failed: false,
    rows: (data as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      userId: String(r.user_id),
      learnerId: (r.learner_id as string) ?? null,
      body: String(r.body ?? ''),
      locale: String(r.locale ?? 'ja'),
      context: (r.context as string) ?? null,
      consentPublish: r.consent_publish === true,
      displayName: (r.display_name as string) ?? null,
      approvedAtISO: (r.approved_at as string) ?? null,
      rejectedAtISO: (r.rejected_at as string) ?? null,
      rejectReason: (r.reject_reason as string) ?? null,
      anonymous: r.anonymous === true,
      editedBody: (r.edited_body as string) ?? null,
      createdAtISO: String(r.created_at ?? ''),
    })),
  };
};

/** 掲載を承認・取り消し（サーバー側でも許諾が無い行は承認できない） */
export const adminApproveTestimonial = async (
  id: string, approve: boolean,
): Promise<{ ok: boolean; code: string }> => {
  const { data, error } = await supabase.rpc('ai_approve_testimonial', { p_id: id, p_approve: approve });
  if (error) return { ok: false, code: 'network' };
  const r = data as { ok?: boolean; code?: string } | null;
  return { ok: r?.ok === true, code: r?.code ?? 'unknown' };
};

/** 却下する（見たけれど載せない、を記録として残す） */
export const adminRejectTestimonial = async (
  id: string, reason = '',
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('ai_reject_testimonial', { p_id: id, p_reason: reason });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
};

/** 却下を取り消して未処理へ戻す（押し間違いから戻れるように） */
export const adminUnrejectTestimonial = async (id: string): Promise<boolean> => {
  const { data, error } = await supabase.rpc('ai_unreject_testimonial', { p_id: id });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
};

/**
 * 掲載用の編集案を置く（空文字で取り消し）。**原文は書き換わらない。**
 * AIが勝手に美化しないための仕組みで、入れるのは人。
 */
export const adminSetTestimonialEdit = async (
  id: string, edited: string,
): Promise<boolean> => {
  const { data, error } = await supabase.rpc('ai_set_testimonial_edit', { p_id: id, p_edited: edited });
  if (error) return false;
  return (data as { ok?: boolean } | null)?.ok === true;
};
