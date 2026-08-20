// 申込と同意の保存。
//
// 2026-08-20 変更: **匿名キーでの直接insertをやめ、Edge Function 経由にした。**
//   匿名キーは配信JSに埋まっているので、URLが公開されると誰でも無制限に
//   ゴミ申込を流し込める（広告を出す前に塞ぐ必要があった）。
//   ai-course-apply が ①Turnstile検証 ②入力検証 ③service_roleで保存
//   ④管理者へメール通知 まで行う。テーブルの匿名INSERT権限は剥奪済み。
//
// 変わらない原則: **保存に失敗したら成功したふりをしない。**
// 「送信できました」と出して実際は消えている、が最悪なので、
// 失敗はそのまま返し、画面側でメール連絡先を案内させる。
import type { ApplicationSubmission } from './planApplication';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type SubmitResult =
  | { ok: true }
  /** 受け口が無い・準備中（画面はメール連絡先を出す） */
  | { ok: false; reason: 'store_unavailable' }
  /** bot判定を通過できなかった（画面は「もう一度チェックしてください」を出す） */
  | { ok: false; reason: 'captcha' }
  | { ok: false; reason: 'failed'; message: string };

/**
 * 申込1件と同意1件を保存する。
 * @param turnstileToken bot対策のトークン（環境で有効なときだけ画面が渡す）
 */
export const submitPlanApplication = async (
  s: ApplicationSubmission, turnstileToken?: string,
): Promise<SubmitResult> => {
  if (!SUPA_URL || !ANON_KEY) return { ok: false, reason: 'store_unavailable' };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-course-apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({
        application: s.application,
        consent: s.consent,
        turnstileToken: turnstileToken || undefined,
      }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    const err = String(data?.error ?? '');
    if (err === 'captcha_required' || err === 'captcha_failed') return { ok: false, reason: 'captcha' };
    // 関数が無い・落ちている（404/503）＝受け口が無い扱いにして人へ繋ぐ
    if (res.status === 404 || res.status === 503) return { ok: false, reason: 'store_unavailable' };
    return { ok: false, reason: 'failed', message: err || `http_${res.status}` };
  } catch (e) {
    return { ok: false, reason: 'failed', message: e instanceof Error ? e.message : 'network' };
  }
};
