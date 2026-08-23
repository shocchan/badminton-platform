// セルフサービス決済（Stripe Checkout）のクライアント側ゲートと呼び出し。
//
// モデル（CEO指示 2026-08-19: 600円・2,980円は人の手を挟まず決済→自動発行→メール）:
// - 決済できるのは**人間レッスンを含まない商品だけ**（サーバー側 isSelfServePlan も同じ判定）
// - 有効化は環境変数 VITE_AI_COURSE_CHECKOUT（'test' | 'live'。未設定・その他は off）。
//   off のあいだは従来どおり申込フォーム（ApplicationModal）へフォールバックする
//   ＝Stripeキー未設定でもLPは壊れない
// - 金額はクライアントから送らない（サーバーが自分のカタログから読む）
import type { PlanConfig, PlanId } from './planCatalog';
import { getReferralCode } from '../../../analytics';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export type CheckoutMode = 'off' | 'test' | 'live';

export const checkoutMode = (): CheckoutMode => {
  const v = import.meta.env.VITE_AI_COURSE_CHECKOUT as string | undefined;
  return v === 'test' || v === 'live' ? v : 'off';
};

/** この商品はオンライン決済の対象か（金額・状態・人間レッスン無しをすべて満たす） */
export const isSelfCheckoutPlan = (p: Pick<PlanConfig, 'status' | 'ctaMode' | 'lessonCount' | 'priceJpy' | 'accessDays'>): boolean =>
  p.status === 'published' && p.ctaMode === 'checkout' && p.lessonCount === 0 &&
  p.priceJpy !== null && p.priceJpy > 0 && p.accessDays !== null;

/** いまオンライン決済へ進めるか（商品条件 × 環境ゲート） */
export const canStartCheckout = (p: Pick<PlanConfig, 'status' | 'ctaMode' | 'lessonCount' | 'priceJpy' | 'accessDays'>): boolean =>
  isSelfCheckoutPlan(p) && checkoutMode() !== 'off';

export type StartCheckoutResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'disabled' | 'not_ready' | 'network' | 'rejected' };

/**
 * 保持中の流入情報（lib/analytics が保存したもの）。個人情報は含まれない。
 * 紹介コード（`?ref=`）も同じ入れ物で送る（2026-08-23）。
 * 台帳の `utm` 列（jsonb）へそのまま入るので、**新しい列もmigrationも要らない**。
 */
const storedUtm = (): Record<string, string> | undefined => {
  try {
    const utm = JSON.parse(sessionStorage.getItem('kb_utm') ?? '{}') as Record<string, string>;
    const ref = getReferralCode();
    const merged = ref ? { ...utm, ref } : utm;
    return Object.keys(merged).length > 0 ? merged : undefined;
  } catch { return undefined; }
};

/**
 * Stripe Checkout セッションを作ってURLを返す。呼び出し側が location.href で遷移する。
 * 失敗しても throw しない（LPで握って相談導線へ案内できるように）。
 */
export const startCheckout = async (planId: PlanId, locale: 'ja' | 'zh'): Promise<StartCheckoutResult> => {
  if (checkoutMode() === 'off') return { ok: false, reason: 'disabled' };
  if (!SUPA_URL || !ANON_KEY) return { ok: false, reason: 'not_ready' };
  try {
    // ログイン中（体験終了後のアップグレード等）なら本人のトークンを添える。
    // サーバーが検証して購入を**そのアカウント**へ紐づける＝購入時のメールが違っても
    // 学習記録のあるアカウントの期間が伸びる（新しいアカウントを作らない）
    const { getAccessToken } = await import('../courseAuth');
    const token = await getAccessToken().catch(() => null);
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-course-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ planId, locale, utm: storedUtm() }),
    });
    if (res.status === 503) return { ok: false, reason: 'not_ready' };
    if (!res.ok) return { ok: false, reason: 'rejected' };
    const data = await res.json().catch(() => ({}));
    if (typeof data?.url !== 'string') return { ok: false, reason: 'rejected' };
    return { ok: true, url: data.url };
  } catch {
    return { ok: false, reason: 'network' };
  }
};

export interface PurchaseStatus {
  status: 'pending' | 'paid' | 'provisioned' | 'failed' | 'unknown';
  planId: string | null;
  loginId: string | null;
  maskedEmail: string | null;
}

/** 決済完了ページ用の状態照会（session_id は購入者のブラウザだけが知るトークン） */
export const fetchPurchaseStatus = async (sessionId: string): Promise<PurchaseStatus> => {
  const unknown: PurchaseStatus = { status: 'unknown', planId: null, loginId: null, maskedEmail: null };
  if (!SUPA_URL || !ANON_KEY) return unknown;
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-course-purchase-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ sessionId }),
    });
    if (!res.ok) return unknown;
    const data = await res.json().catch(() => ({}));
    const status = ['pending', 'paid', 'provisioned', 'failed'].includes(data?.status) ? data.status : 'unknown';
    return {
      status,
      planId: typeof data?.planId === 'string' ? data.planId : null,
      loginId: typeof data?.loginId === 'string' ? data.loginId : null,
      maskedEmail: typeof data?.maskedEmail === 'string' ? data.maskedEmail : null,
    };
  } catch {
    return unknown;
  }
};
