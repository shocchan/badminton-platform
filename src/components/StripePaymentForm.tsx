import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { getStripe } from '../lib/payment';

interface StripePaymentFormProps {
  clientSecret: string;
  amount: number;
  onSuccess: (paymentIntentId: string) => void;
}

// Stripe エラーの日本語フォールバック（locale:'ja' で大半は翻訳済みだが保険）
const fallbackErrorMessage = (code?: string) => {
  switch (code) {
    case 'card_declined': return 'カードが利用できませんでした。別のカードをお試しください。';
    case 'expired_card': return 'カードの有効期限が切れています。';
    case 'incorrect_cvc': return 'セキュリティコード（CVC）が正しくありません。';
    case 'insufficient_funds': return 'カードの利用限度額を超えています。';
    case 'processing_error': return '決済処理中にエラーが発生しました。もう一度お試しください。';
    default: return 'お支払いに失敗しました。もう一度お試しいただくか、別の支払い方法をご利用ください。';
  }
};

const CheckoutForm = ({ amount, onSuccess }: { amount: number; onSuccess: (id: string) => void }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || processing) return;
    setProcessing(true);
    setError(null);

    // confirmPayment がネットワーク不調等で応答しないケースに備え、45秒でタイムアウトさせる
    // （処理中オーバーレイが無限に出続けることを防ぐ安全策）
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
      setError('決済の応答がありません。通信環境をご確認のうえもう一度お試しいただくか、別の支払い方法をご利用ください。');
      setProcessing(false);
      return;
    }

    const { error: stripeError, paymentIntent } = result;
    if (stripeError) {
      setError(stripeError.message || fallbackErrorMessage(stripeError.code));
      setProcessing(false);
      return;
    }
    if (paymentIntent?.status === 'succeeded') {
      onSuccess(paymentIntent.id);
      return;
    }
    setError('お支払いを確認できませんでした。もう一度お試しください。');
    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement options={{ layout: 'tabs' }} />
      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
          {error}
          <p className="text-xs text-red-500 mt-1">別の支払い方法（PayPay・銀行振込）もご利用いただけます。</p>
        </div>
      )}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors"
      >
        {processing ? '処理中...' : `¥${amount.toLocaleString()} で支払う`}
      </button>

      {/* 決済処理中のフルスクリーンオーバーレイ（キャンセル不可） */}
      {processing && (
        <div className="fixed inset-0 bg-black/50 flex flex-col items-center justify-center z-[60]" aria-live="polite">
          <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
          <p className="text-white font-bold mt-4">決済処理中...</p>
          <p className="text-white/70 text-sm mt-1">このまま画面を閉じずにお待ちください</p>
        </div>
      )}
    </form>
  );
};

export const StripePaymentForm = ({ clientSecret, amount, onSuccess }: StripePaymentFormProps) => {
  const stripePromise = getStripe();
  if (!stripePromise) return null;

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        locale: 'ja',
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
      <CheckoutForm amount={amount} onSuccess={onSuccess} />
    </Elements>
  );
};
