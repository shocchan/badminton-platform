import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '../lib/payment';
import { getEntryTexts } from '../locales/entry';
import type { EntryTexts } from '../locales/entry';

interface StripePaymentFormProps {
  clientSecret: string;
  amount: number;
  lang: string;
  onSuccess: (paymentIntentId: string) => void;
}

const CheckoutForm = ({ amount, t, onSuccess }: { amount: number; t: EntryTexts; onSuccess: (id: string) => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // カード入力欄（PaymentElement iframe）の読み込みが完了するまで支払いボタンを無効化する。
  // 読み込み前に confirmPayment すると応答待ちのまま固まるため（2026-07-13の不具合）
  const [elementReady, setElementReady] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || processing || !elementReady) return;
    setProcessing(true);
    setError(null);

    // confirmPayment がネットワーク不調等で応答しないケースに備え、45秒でタイムアウトさせる
    const timeout = new Promise<'timeout'>(resolve => setTimeout(() => resolve('timeout'), 45000));
    const result = await Promise.race([
      stripe.confirmPayment({
        elements,
        confirmParams: { return_url: window.location.href },
        redirect: 'if_required',
      }),
      timeout,
    ]);

    if (result === 'timeout') {
      setError(t.spErrTimeout);
      setProcessing(false);
      return;
    }

    const { error: stripeError, paymentIntent } = result;
    if (stripeError) {
      setError(stripeError.message || t.spErrDefault);
      setProcessing(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
      return;
    }
    setError(t.spErrNotConfirmed);
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{ layout: 'tabs' }}
        onReady={() => setElementReady(true)}
        onLoadError={() => setLoadFailed(true)}
      />

      {elementReady && (
        <p className="text-xs text-amber-600">{t.payCreditCancelNote}</p>
      )}

      {/* カード入力欄の読み込み中表示 */}
      {!elementReady && !loadFailed && (
        <div className="flex items-center justify-center gap-2 py-3 text-gray-500 text-xs" aria-live="polite">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
          {t.spLoading}
        </div>
      )}

      {/* カード入力欄の読み込み失敗（広告ブロッカー・通信不良・キー不整合など） */}
      {loadFailed && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
          {t.spErrLoad}
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
          <p className="text-xs text-red-500 mt-1">{t.spErrAlt}</p>
        </div>
      )}

      {!loadFailed && (
        <button
          type="submit"
          disabled={!stripe || processing || !elementReady}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
        >
          {processing ? t.spProcessing : t.spPay(amount.toLocaleString())}
        </button>
      )}

      {/* 決済処理中のフルスクリーンオーバーレイ（キャンセル不可） */}
      {processing && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center z-[60]" aria-live="polite">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white font-bold mt-4">{t.spOverlayTitle}</p>
          <p className="text-white/70 text-sm mt-1">{t.spOverlayNote}</p>
        </div>
      )}
    </form>
  );
};

export const StripePaymentForm = ({ clientSecret, amount, lang, onSuccess }: StripePaymentFormProps) => {
  const stripePromise = getStripe();
  const t = getEntryTexts(lang);
  if (!stripePromise) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        locale: lang === 'zh' ? 'zh' : 'ja',
        appearance: {
          variables: {
            colorPrimary: '#3b82f6',
            colorText: '#111827',
            borderRadius: '12px',
            colorBackground: '#ffffff',
          },
        },
      }}
    >
      <CheckoutForm amount={amount} t={t} onSuccess={onSuccess} />
    </Elements>
  );
};
