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

// クレジット決済手数料: 参加費の4%（四捨五入）。サーバー側（create-payment-intent）と同じ式
// Stripeの実費（3.6%＋α、実測値ベース）をカバーし、キャンセル時の部分返金でkawabadoが損をしないための率
export const calcCreditAmounts = (entryFee: number) => {
  const fee = Math.round(entryFee * 0.04);
  return { fee, total: entryFee + fee };
};

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
