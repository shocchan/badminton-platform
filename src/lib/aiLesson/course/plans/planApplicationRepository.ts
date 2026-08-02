// 申込と同意の保存。
//
// ⚠️ **保存先テーブルのマイグレーションはまだ適用していない**
//    （supabase/migrations/20260802000000_ai_course_plan_applications.sql）。
//    staging と production は同じ Supabase プロジェクトなので、適用にはCEOの許可が要る。
//
// 未適用のあいだは保存に失敗する。そのとき **成功したふりをしない**。
// 「送信できました」と出して実際は消えている、が最悪なので、
// 失敗はそのまま返し、画面側でメール連絡先を案内させる。
import { supabase } from '../../../../services/supabaseClient';
import type { ApplicationSubmission } from './planApplication';

export type SubmitResult =
  | { ok: true }
  /** 保存先がまだ無い（マイグレーション未適用）。運用でカバーできるので画面で案内を出す */
  | { ok: false; reason: 'store_unavailable' }
  | { ok: false; reason: 'failed'; message: string };

/** PostgRESTが「テーブルが無い」と言っているか */
const isMissingTable = (code: string | undefined, message: string): boolean =>
  code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message);

/**
 * 申込1件と同意1件を保存する。
 *
 * 同意は申込が入ってからにする。逆にすると、申込が落ちたときに
 * **どの申込にも紐づかない同意記録**が残る。
 */
export const submitPlanApplication = async (s: ApplicationSubmission): Promise<SubmitResult> => {
  const a = s.application;
  const { error: appError } = await supabase.from('ai_plan_applications').insert({
    application_id: a.applicationId,
    selected_plan_id: a.selectedPlanId,
    displayed_price_label: a.displayedPriceLabel,
    plan_version: a.planVersion,
    application_at: a.applicationAt,
    locale: a.locale,
    application_status: a.applicationStatus,
    name: a.name,
    email: a.email,
    note: a.note,
  });
  if (appError) {
    return isMissingTable(appError.code, appError.message)
      ? { ok: false, reason: 'store_unavailable' }
      : { ok: false, reason: 'failed', message: appError.message };
  }

  const c = s.consent;
  const { error: consentError } = await supabase.from('ai_terms_consents').insert({
    subject_id: c.subjectId,
    subject_kind: c.subjectKind,
    terms_version: c.termsVersion,
    consented_at: c.consentedAt,
    locale: c.locale,
  });
  if (consentError) {
    // 申込は入ったが同意が入らなかった。**申込を消さない**（連絡先は残したい）。
    // 同意の証拠が無いことは失敗として返し、人が拾えるようにする
    return isMissingTable(consentError.code, consentError.message)
      ? { ok: false, reason: 'store_unavailable' }
      : { ok: false, reason: 'failed', message: consentError.message };
  }
  return { ok: true };
};
