import { useState } from 'react';
import type { Tournament } from '../types';
import { supabase } from '../services/supabaseClient';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { StripePaymentForm } from './StripePaymentForm';
import { PaymentCompletionPage } from './PaymentCompletionPage';
import { isCreditPaymentAvailable, fetchWithTimeout } from '../lib/payment';
import type { PaymentMethod } from '../lib/payment';

interface EntryFormProps {
  tournament: Tournament;
  entryCount: number; // confirmed のみのカウント
  onClose: () => void;
}

type Step = 'input' | 'confirm' | 'payment-method' | 'success';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_BASE = SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');

export const EntryForm = ({ tournament, entryCount, onClose }: EntryFormProps) => {
  const isDoubles = tournament.event_type?.includes('ダブルス');
  const isWaitlist = entryCount >= tournament.capacity;

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    partner_name: '',
    notes: '',
  });
  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 支払い方法選択（Vol.4〜 クレジット決済対応）
  const [entryInfo, setEntryInfo] = useState<{ id: number; cancelToken: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [stripeInfo, setStripeInfo] = useState<{ clientSecret: string; amount: number; fee: number } | null>(null);
  const [paidInfo, setPaidInfo] = useState<{ amount: number; paidAt: string } | null>(null);
  const [confirmWarning, setConfirmWarning] = useState<string | null>(null);
  const [bankCopied, setBankCopied] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // Googleカレンダー追加URL
  const buildGoogleCalendarUrl = () => {
    const d = tournament.event_date.slice(0, 10).replace(/-/g, '');
    const start = `${d}T${tournament.start_time.slice(0, 5).replace(':', '')}00`;
    const end   = `${d}T${tournament.end_time.slice(0, 5).replace(':', '')}00`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: tournament.title,
      dates: `${start}/${end}`,
      details: `川口・蕨バドミントン交流会\n参加費: ¥${tournament.entry_fee.toLocaleString()}`,
      location: tournament.venue_address || tournament.location,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  const handleConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('有効なメールアドレスを入力してください');
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      // 申し込み締め切りチェック（大会14日前）
      const entryDeadline = new Date(tournament.event_date);
      entryDeadline.setDate(entryDeadline.getDate() - 14);
      entryDeadline.setHours(23, 59, 59);
      if (new Date() > entryDeadline) {
        setError('申し込み締め切りを過ぎています。');
        setStep('input');
        setLoading(false);
        return;
      }

      // 重複申し込みチェック（同メール×同大会、cancelled 以外）
      const { data: existing } = await supabase
        .from('entries')
        .select('id, status')
        .eq('tournament_id', tournament.id)
        .eq('email', formData.email)
        .neq('status', 'cancelled')
        .maybeSingle();

      if (existing) {
        const msg = existing.status === 'waitlist'
          ? 'このメールアドレスはすでにキャンセル待ちに登録済みです。'
          : 'このメールアドレスはすでにこの大会に申し込み済みです。';
        setError(msg);
        setStep('input');
        setLoading(false);
        return;
      }

      // 最新の confirmed カウントを再チェック（競合防止）
      const { count: confirmedCount } = await supabase
        .from('entries')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id)
        .eq('status', 'confirmed');

      const actualIsWaitlist = (confirmedCount ?? 0) >= tournament.capacity;
      const status = actualIsWaitlist ? 'waitlist' : 'confirmed';

      const { data: inserted, error: insertError } = await supabase
        .from('entries')
        .insert([{
          tournament_id: tournament.id,
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          partner_name: isDoubles ? formData.partner_name : null,
          notes: formData.notes,
          status,
        }])
        .select('id, cancel_token')
        .single();

      if (insertError) throw insertError;

      // 支払いが必要な確定エントリーは支払い方法選択へ。それ以外は従来通りメール送信して完了
      if (status === 'confirmed' && tournament.payment_required && inserted) {
        setEntryInfo({ id: inserted.id, cancelToken: inserted.cancel_token });
        setStep('payment-method');
      } else {
        await sendEmail(formData.email, status, inserted?.cancel_token);
        setStep('success');
      }
    } catch (err) {
      setError('申し込みに失敗しました。もう一度お試しください。');
      setStep('input');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const sendEmail = async (
    email: string,
    status: 'confirmed' | 'waitlist',
    cancelToken?: string,
    method?: PaymentMethod,
    entryId?: number,
  ) => {
    try {
      const cancelLink = cancelToken
        ? `${window.location.origin}/cancel?token=${cancelToken}`
        : undefined;

      const response = await fetch(`${EDGE_BASE}/send-payment-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: email,
          name: formData.name,
          phone: formData.phone,
          notes: formData.notes,
          partner_name: isDoubles ? formData.partner_name : null,
          tournament_title: tournament.title,
          tournament_date: tournament.event_date,
          payment_deadline: tournament.payment_deadline,
          bank_account: tournament.bank_account,
          paypay_id: tournament.paypay_id,
          payment_required: tournament.payment_required && status === 'confirmed',
          entry_fee: tournament.entry_fee,
          cancel_link: cancelLink,
          is_waitlist: status === 'waitlist',
          // 支払い方法が選択済みの場合は entries に記録される（PayPay/銀行振込）
          payment_method: method,
          entry_id: entryId,
          cancel_token: method ? cancelToken : undefined,
        }),
      });
      if (!response.ok) console.warn('Email sending failed, but entry was saved');
    } catch (err) {
      console.warn('Email sending error:', err);
    }
  };

  // ── 支払い方法選択ハンドラー ──

  const handleSelectMethod = (method: PaymentMethod) => {
    if (paymentLoading) return;
    setPaymentMethod(method);
    setPaymentError(null);
    if (method === 'credit' && !stripeInfo) {
      void createPaymentIntent();
    }
  };

  const createPaymentIntent = async () => {
    if (!entryInfo) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await fetchWithTimeout(`${EDGE_BASE}/create-payment-intent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ entry_id: entryInfo.id, cancel_token: entryInfo.cancelToken }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.clientSecret) {
        setPaymentError(data.error || '決済の準備に失敗しました。別の支払い方法をご利用ください。');
        return;
      }
      setStripeInfo({ clientSecret: data.clientSecret, amount: data.amount, fee: data.fee });
    } catch (err) {
      setPaymentError(
        err instanceof DOMException && err.name === 'AbortError'
          ? '一時的に処理できません。時間をおいてお試しいただくか、別の支払い方法をご利用ください。'
          : '決済の準備に失敗しました。別の支払い方法をご利用ください。',
      );
    } finally {
      setPaymentLoading(false);
    }
  };

  // PayPay / 銀行振込: 従来通りの案内メールを送信して完了
  const handleConfirmOfflinePayment = async (method: 'paypay' | 'bank') => {
    if (!entryInfo) return;
    setPaymentLoading(true);
    setPaymentError(null);
    await sendEmail(formData.email, 'confirmed', entryInfo.cancelToken, method, entryInfo.id);
    setPaymentLoading(false);
    setStep('success');
  };

  // クレジット決済成功 → サーバー側で決済確認 + 完了メール送信
  const handleStripeSuccess = async (paymentIntentId: string) => {
    setPaymentLoading(true);
    try {
      const res = await fetchWithTimeout(`${EDGE_BASE}/confirm-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ payment_intent_id: paymentIntentId }),
      });
      const data = await res.json();
      if (data.success) {
        setPaidInfo({
          amount: data.amount ?? stripeInfo?.amount ?? 0,
          paidAt: data.paid_at ?? new Date().toISOString(),
        });
      } else {
        setPaidInfo({ amount: stripeInfo?.amount ?? 0, paidAt: new Date().toISOString() });
        setConfirmWarning('お支払いは完了していますが、確認処理に時間がかかっています。確認メールが届かない場合も参加は確定していますのでご安心ください。');
      }
    } catch {
      setPaidInfo({ amount: stripeInfo?.amount ?? 0, paidAt: new Date().toISOString() });
      setConfirmWarning('お支払いは完了していますが、確認処理に時間がかかっています。確認メールが届かない場合も参加は確定していますのでご安心ください。');
    } finally {
      setPaymentLoading(false);
      setStep('success');
    }
  };

  const handleCopyBank = async () => {
    if (!tournament.bank_account) return;
    try {
      await navigator.clipboard.writeText(tournament.bank_account);
      setBankCopied(true);
      setTimeout(() => setBankCopied(false), 2000);
    } catch { /* clipboard 非対応環境では何もしない */ }
  };

  // 支払い方法未選択のままモーダルを閉じた場合も、従来通りの案内メール（PayPay/銀行振込情報）を送る
  const handleClose = () => {
    if (step === 'payment-method' && entryInfo && !paidInfo) {
      void sendEmail(formData.email, 'confirmed', entryInfo.cancelToken);
    }
    onClose();
  };

  // 確認画面の表示フィールド
  const confirmFields = [
    { label: 'お名前', value: formData.name },
    ...(isDoubles ? [{ label: 'ペアの相手のお名前', value: formData.partner_name || '未入力' }] : []),
    { label: 'メールアドレス', value: formData.email },
    { label: '電話番号', value: formData.phone || '未入力' },
    { label: '備考', value: formData.notes || '未入力' },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto ${step === 'payment-method' ? 'max-w-2xl' : 'max-w-md'}`}>
        {/* ヘッダー */}
        <div className={`px-6 py-5 rounded-t-2xl ${isWaitlist ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-blue-600 to-blue-500'}`}>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-white font-bold text-lg">
                {isWaitlist ? 'キャンセル待ち申し込み' : '大会申し込み'}
              </h2>
              <p className="text-white/80 text-sm mt-1">{tournament.title}</p>
            </div>
            <button onClick={handleClose} aria-label="閉じる" className="text-white/70 hover:text-white text-2xl leading-none">×</button>
          </div>
          {/* キャンセル待て案内 */}
          {isWaitlist && step === 'input' && (
            <div className="mt-3 bg-white/20 rounded-xl px-3 py-2 text-white text-xs">
              ⏳ この大会は満員です。キャンセル待ちに登録すると、空きが出た際にメールでご連絡します。
            </div>
          )}
          {/* ステップインジケーター */}
          {step !== 'success' && (
            <div className="flex items-center gap-2 mt-4">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'input' ? 'text-white' : 'text-white/60'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'input' ? 'bg-white text-blue-600' : 'bg-white/30 text-white'}`}>1</span>
                入力
              </div>
              <div className="flex-1 h-px bg-white/30" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'confirm' ? 'text-white' : 'text-white/40'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'confirm' ? 'bg-white text-blue-600' : 'bg-white/20 text-white'}`}>2</span>
                確認
              </div>
              {!isWaitlist && tournament.payment_required && (
                <>
                  <div className="flex-1 h-px bg-white/30" />
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'payment-method' ? 'text-white' : 'text-white/40'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'payment-method' ? 'bg-white text-blue-600' : 'bg-white/20 text-white'}`}>3</span>
                    支払い
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-5">
          {/* 支払い方法選択画面 */}
          {step === 'payment-method' && entryInfo && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
                ✅ 申し込みを受け付けました。<span className="font-bold">お支払い方法を選択してください。</span>
              </div>

              <PaymentMethodSelector
                entryFee={tournament.entry_fee}
                paypayId={tournament.paypay_id}
                bankAccount={tournament.bank_account}
                creditAvailable={isCreditPaymentAvailable}
                selected={paymentMethod}
                onSelect={handleSelectMethod}
                disabled={paymentLoading}
              />

              {paymentError && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {paymentError}
                  {paymentMethod === 'credit' && (
                    <button
                      onClick={() => void createPaymentIntent()}
                      className="block mt-2 text-xs font-bold text-red-700 underline"
                    >
                      もう一度お試しください
                    </button>
                  )}
                </div>
              )}

              {/* クレジットカード決済フォーム */}
              {paymentMethod === 'credit' && paymentLoading && !stripeInfo && (
                <div className="flex items-center justify-center gap-3 py-8 text-gray-500 text-sm" aria-live="polite">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                  決済の準備中...
                </div>
              )}
              {paymentMethod === 'credit' && stripeInfo && (
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <p className="text-sm font-bold text-gray-700 mb-3">💳 カード情報を入力してください</p>
                  <StripePaymentForm
                    clientSecret={stripeInfo.clientSecret}
                    amount={stripeInfo.amount}
                    onSuccess={id => void handleStripeSuccess(id)}
                  />
                </div>
              )}

              {/* PayPay */}
              {paymentMethod === 'paypay' && tournament.paypay_id && (
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
                  <p className="text-sm font-bold text-gray-700">📱 PayPayでのお支払い</p>
                  <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">PayPay ID</p>
                    <p className="text-lg font-bold text-red-600">{tournament.paypay_id}</p>
                    <p className="text-xs text-gray-500 mt-1">✏️ 送金時のメッセージに「{formData.name}」とご記入ください</p>
                  </div>
                  <p className="text-xs text-gray-500">確定すると、お支払い情報をメールでお送りします。期限までにお支払いください。</p>
                  <button
                    onClick={() => void handleConfirmOfflinePayment('paypay')}
                    disabled={paymentLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    {paymentLoading ? '送信中...' : 'PayPayで支払う（案内メールを受け取る）'}
                  </button>
                </div>
              )}

              {/* 銀行振込 */}
              {paymentMethod === 'bank' && tournament.bank_account && (
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
                  <p className="text-sm font-bold text-gray-700">🏦 銀行振込でのお支払い</p>
                  <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <p className="text-sm text-blue-900 whitespace-pre-line leading-relaxed">{tournament.bank_account}</p>
                    <button
                      onClick={() => void handleCopyBank()}
                      className="mt-2 text-xs font-bold text-blue-700 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-100 transition-colors"
                    >
                      {bankCopied ? '✓ コピーしました' : '📋 振込情報をコピー'}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500">確定すると、振込先情報をメールでお送りします。期限までにお振込みください。</p>
                  <button
                    onClick={() => void handleConfirmOfflinePayment('bank')}
                    disabled={paymentLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    {paymentLoading ? '送信中...' : '銀行振込で支払う（案内メールを受け取る）'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 完了画面（クレジット決済） */}
          {step === 'success' && paymentMethod === 'credit' && paidInfo && entryInfo && (
            <PaymentCompletionPage
              tournament={tournament}
              name={formData.name}
              entryId={entryInfo.id}
              entryFee={tournament.entry_fee}
              fee={paidInfo.amount - tournament.entry_fee}
              total={paidInfo.amount}
              paidAt={paidInfo.paidAt}
              calendarUrl={buildGoogleCalendarUrl()}
              warning={confirmWarning}
              onClose={onClose}
            />
          )}

          {/* 完了画面 */}
          {step === 'success' && !(paymentMethod === 'credit' && paidInfo) && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">{isWaitlist ? '⏳' : '✅'}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {isWaitlist ? 'キャンセル待ち登録完了！' : '申し込み完了！'}
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                {isWaitlist
                  ? `${tournament.title}のキャンセル待ちに登録しました。空きが出た際にメールでご連絡します。`
                  : `${tournament.title}（${formatDate(tournament.event_date)}）への申し込みを受け付けました。`
                }
              </p>

              {/* キャンセル待ちの場合 */}
              {isWaitlist && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-left">
                  <p className="text-sm font-medium text-amber-900 mb-1">⏳ キャンセル待ち登録完了</p>
                  <p className="text-xs text-amber-700 mb-1">メールアドレス: {formData.email}</p>
                  <p className="text-xs text-amber-700">繰り上げ当選した際、メールにてご案内します。</p>
                </div>
              )}

              {/* 確定申し込みの場合 */}
              {!isWaitlist && tournament.payment_required && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-left">
                  <p className="text-sm font-medium text-blue-900 mb-2">💳 支払い案内メールをお送りしました</p>
                  {paymentMethod && (
                    <p className="text-xs text-blue-700 mb-2">選択した支払い方法: {paymentMethod === 'paypay' ? 'PayPay' : '銀行振込'}</p>
                  )}
                  <p className="text-xs text-blue-700 mb-2">メールアドレス: {formData.email}</p>
                  <p className="text-xs text-blue-700">支払い期限: {tournament.payment_deadline ? formatDate(tournament.payment_deadline) : '未定'}</p>
                </div>
              )}

              {/* キャンセル方法案内 */}
              {!isWaitlist && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-left">
                  <p className="text-sm font-medium text-gray-700 mb-1">❌ キャンセルについて</p>
                  <p className="text-xs text-gray-500">メールに記載のキャンセルリンクからキャンセルできます。期限: 大会2週間前（{(() => { const d = new Date(tournament.event_date); d.setDate(d.getDate() - 14); return formatDate(d.toISOString().split('T')[0]); })()}）</p>
                </div>
              )}

              {/* カレンダー追加ボタン（確定のみ） */}
              {!isWaitlist && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 text-left">
                  <p className="text-sm font-bold text-green-900 mb-1">📅 大会をカレンダーに追加しよう</p>
                  <p className="text-xs text-green-700 mb-3">当日忘れないようにカレンダーに登録しておきましょう！</p>
                  <a
                    href={buildGoogleCalendarUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-white border border-green-300 hover:bg-green-50 text-green-800 font-bold text-sm py-2.5 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                    </svg>
                    Googleカレンダーに追加
                  </a>
                </div>
              )}

              <button
                onClick={onClose}
                className={`w-full text-white px-6 py-3 rounded-xl font-bold transition-colors ${isWaitlist ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                閉じる
              </button>
            </div>
          )}

          {/* 確認画面 */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">以下の内容で{isWaitlist ? 'キャンセル待ち登録' : '申し込み'}します。よろしいですか？</p>
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-200">
                <div className={`rounded-t-xl px-4 py-3 ${isWaitlist ? 'bg-amber-50' : 'bg-blue-50'}`}>
                  <p className={`text-xs font-medium mb-0.5 ${isWaitlist ? 'text-amber-600' : 'text-blue-600'}`}>申し込み大会</p>
                  <p className={`text-sm font-bold ${isWaitlist ? 'text-amber-900' : 'text-blue-900'}`}>{tournament.title}</p>
                  <p className={`text-xs ${isWaitlist ? 'text-amber-700' : 'text-blue-700'}`}>{formatDate(tournament.event_date)} ｜ {tournament.location}</p>
                  {isWaitlist && <p className="text-xs text-amber-600 font-medium mt-1">⏳ キャンセル待ちでの登録になります</p>}
                </div>
                {confirmFields.map(({ label, value }) => (
                  <div key={label} className="px-4 py-3">
                    <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                    <p className="text-sm text-gray-900">{value}</p>
                  </div>
                ))}
              </div>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                >
                  ← 戻る
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className={`flex-1 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors text-sm ${isWaitlist ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {loading ? '送信中...' : isWaitlist ? 'キャンセル待ちで登録' : '申し込む'}
                </button>
              </div>
            </div>
          )}

          {/* 入力画面 */}
          {step === 'input' && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className={`rounded-xl p-3 text-sm ${isWaitlist ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                📅 {formatDate(tournament.event_date)} ｜ 📍 {tournament.location}
              </div>
              {error && (
                <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">{error}</div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">お名前 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="山田 太郎"
                />
              </div>

              {isDoubles && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ペアの相手のお名前
                    <span className="text-xs text-gray-400 font-normal ml-2">（未定の場合は「未定」と入力）</span>
                  </label>
                  <input
                    type="text"
                    value={formData.partner_name}
                    onChange={e => setFormData(p => ({ ...p, partner_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="鈴木 花子"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="example@email.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">電話番号（任意）</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="090-1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考（任意）</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="その他ご連絡事項があればご記入ください"
                />
              </div>
              <button
                type="submit"
                className={`w-full text-white font-bold py-3 rounded-xl transition-colors ${isWaitlist ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                確認画面へ →
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
