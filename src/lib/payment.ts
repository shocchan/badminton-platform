import { loadStripe } from '@stripe/stripe-js';
import type { Stripe } from '@stripe/stripe-js';

export type PaymentMethod = 'credit' | 'paypay' | 'bank';

const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as string | undefined;

// キー未設定時はクレジット決済の選択肢自体を出さない（PayPay/銀行振込のみで運用可能）
export const isCreditPaymentAvailable = !!STRIPE_PUBLISHABLE_KEY;

let stripePromise: Promise<Stripe | null> | null = null;
export const getStripe = () => {
  if (!STRIPE_PUBLISHABLE_KEY) return null;
  if (!stripePromise) {
    stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY, { locale: 'ja' });
  }
  return stripePromise;
};

// クレジット決済のキャンセル手数料率（期限内キャンセルでも10%を差し引いて返金）
// 決済手数料の上乗せはしない（全支払い方法で参加費は同額）。実費はkawabadoが負担する運用方針
export const CREDIT_CANCEL_FEE_RATE = 0.10;
export const calcCreditRefundAmount = (entryFee: number) =>
  entryFee - Math.round(entryFee * CREDIT_CANCEL_FEE_RATE);

// Edge Function 呼び出し（30秒タイムアウト付き）
export const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 30000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};
