import { useState } from 'react';
import type { Tournament } from '../types';
import { supabase } from '../services/supabaseClient';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { StripePaymentForm } from './StripePaymentForm';
import { PaymentCompletionPage } from './PaymentCompletionPage';
import { isCreditPaymentAvailable, isStripeRedirectPaymentAvailable, fetchWithTimeout } from '../lib/payment';
import type { PaymentMethod } from '../lib/payment';
import { useLanguage } from '../contexts/LanguageContext';
import { getEntryTexts } from '../locales/entry';
import { isCreditOnly, isEntryClosed } from '../lib/entryDeadline';
import { trackGenerateLead, trackBeginCheckout, trackPurchase } from '../lib/analytics';

interface EntryFormProps {
  tournament: Tournament;
  entryCount: number; // confirmed のみのカウント
  onClose: () => void;
}

type Step = 'input' | 'confirm' | 'payment-method' | 'success';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_BASE = SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');

export const EntryForm = ({ tournament, entryCount, onClose }: EntryFormProps) => {
  const { lang } = useLanguage();
  const t = getEntryTexts(lang);
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
  const [stripeInfo, setStripeInfo] = useState<{ clientSecret: string; amount: number } | null>(null);
  const [paidInfo, setPaidInfo] = useState<{ amount: number; paidAt: string } | null>(null);
  const [confirmWarning, setConfirmWarning] = useState(false);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
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
      setError(t.errEmail);
      return;
    }
    setError(null);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      // 締切の一次チェック（UX用。本当の強制は create_tournament_entry RPC 側で行う）
      if (isEntryClosed(tournament)) {
        setError(t.errDeadline);
        setStep('input');
        setLoading(false);
        return;
      }

      // 重複申し込みチェック（同メール×同大会、cancelled 以外）。
      // entries を直接読むと他人の氏名・電話・メールまで取得できてしまうため、
      // 大会×メールが一致した1件だけを返すRPCを使う（大文字小文字と前後空白は無視）。
      const { data: found } = await supabase.rpc('find_entry_for_resume', {
        p_tournament_id: tournament.id,
        p_email: formData.email,
      });
      const existing = (found as { id: number; status: string; cancel_token: string; payment_status: string }[] | null)?.[0] ?? null;

      if (existing) {
        // 支払い前（未完了）に画面を閉じただけの場合は「申し込み済み」として弾かず、
        // 同じエントリーをそのまま再利用して支払い画面へ戻す（重複作成しない。
        // entries への UPDATE 権限は anon に付与していないため、内容の更新はせず既存の値をそのまま使う）
        const resumable = existing.status === 'confirmed' && tournament.payment_required && existing.payment_status !== 'completed';
        if (resumable) {
          setEntryInfo({ id: existing.id, cancelToken: existing.cancel_token });
          setStep('payment-method');
          setLoading(false);
          return;
        }
        const msg = existing.status === 'waitlist' ? t.errDupWaitlist : t.errDupEntry;
        setError(msg);
        setStep('input');
        setLoading(false);
        return;
      }

      // 申込の作成はサーバー側RPCに一本化する。
      // 締切・重複・定員を advisory lock の中で原子的に判定してからINSERTするため、
      // 同時申込でも定員超過や重複が発生しない（匿名の直接INSERTは権限を剥奪済み）。
      const { data: created, error: rpcError } = await supabase.rpc('create_tournament_entry', {
        p_tournament_id: tournament.id,
        p_name: formData.name,
        p_email: formData.email,
        p_phone: formData.phone || null,
        p_partner_name: isDoubles ? formData.partner_name : null,
        p_notes: formData.notes || null,
      });

      if (rpcError) {
        // RPC が返すエラーコードを利用者向けの文言に変換する
        const msg = rpcError.message || '';
        const code = (rpcError as { code?: string }).code || '';
        if (msg.includes('ENTRY_CLOSED')) setError(t.errDeadline);
        else if (msg.includes('CAPACITY_FULL')) setError(t.errCapacityFull);
        else if (msg.includes('DUPLICATE_ENTRY')) setError(t.errDupEntry);
        // 42501 = 権限エラー。古いバンドルを開いたままの場合などに起こりうる。
        // 申し込みは作成されていないので、再読み込みを促す
        else if (code === '42501' || msg.includes('permission denied')) setError(t.errStale);
        else setError(t.errSubmit);
        setStep('input');
        setLoading(false);
        return;
      }

      const row = (created as {
        entry_id: number; entry_cancel_token: string; entry_status: 'confirmed' | 'waitlist'; late_entry: boolean;
      }[] | null)?.[0];
      if (!row) throw new Error('create_tournament_entry returned no row');

      const status = row.entry_status;
      // 申込レコード作成の成功地点で計測（確定・キャンセル待ち両方）
      trackGenerateLead(tournament.id, tournament.entry_fee, status);

      // 支払いが必要な確定エントリーは支払い方法選択へ。それ以外は従来通りメール送信して完了
      if (status === 'confirmed' && tournament.payment_required) {
        setEntryInfo({ id: row.entry_id, cancelToken: row.entry_cancel_token });
        setStep('payment-method');
      } else {
        await sendEmail(formData.email, status, row.entry_cancel_token);
        setStep('success');
      }
    } catch (err) {
      setError(t.errSubmit);
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
          // 銀行振込は2026-08-28に廃止。空を渡すとメール側の振込先ブロックが出ない
          bank_account: '',
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

  // 追加受付中はオンラインのクレジットカード決済のみ（PayPay・銀行振込は選択させない）
  const creditOnly = isCreditOnly(tournament);

  const handleSelectMethod = (method: PaymentMethod) => {
    if (paymentLoading) return;
    // 追加受付中はオンライン決済のみ（PayPayは入金確認が間に合わないため）
    if (creditOnly && method !== 'credit' && method !== 'wechat_alipay') return;
    setPaymentMethod(method);
    setPaymentError(null);
    if (method === 'credit' && !stripeInfo) {
      void createPaymentIntent();
    }
  };

  // WeChat Pay / Alipay: Stripeの決済画面へ遷移する。
  // 戻り先を控えておき、支払い後に同じ大会ページへ帰ってきて確認処理を走らせる。
  const startRedirectCheckout = async () => {
    if (!entryInfo) return;
    setPaymentLoading(true);
    setPaymentError(null);
    try {
      const res = await fetchWithTimeout(`${EDGE_BASE}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'create',
          entry_id: entryInfo.id,
          cancel_token: entryInfo.cancelToken,
          return_origin: window.location.origin,
          return_path: window.location.pathname,
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error || !data.url) {
        setPaymentError(data.error || t.payErrPrepare);
        return;
      }
      trackBeginCheckout(tournament.id, data.amount ?? tournament.entry_fee);
      // 戻ってきたときに完了画面を出せるよう、申込情報を残しておく
      sessionStorage.setItem(
        'kawabado_checkout',
        JSON.stringify({ entryId: entryInfo.id, name: formData.name, email: formData.email }),
      );
      window.location.href = data.url;
    } catch (err) {
      setPaymentError(
        err instanceof DOMException && err.name === 'AbortError' ? t.payErrTimeout : t.payErrPrepare,
      );
    } finally {
      setPaymentLoading(false);
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
        setPaymentError(data.error || t.payErrPrepare);
        return;
      }
      setStripeInfo({ clientSecret: data.clientSecret, amount: data.amount });
      // PaymentIntent 作成成功＝決済開始
      trackBeginCheckout(tournament.id, data.amount);
    } catch (err) {
      setPaymentError(
        err instanceof DOMException && err.name === 'AbortError' ? t.payErrTimeout : t.payErrPrepare,
      );
    } finally {
      setPaymentLoading(false);
    }
  };

  // PayPay: 従来通りの案内メールを送信して完了（入金確認は運営が手動で行う）
  const handleConfirmOfflinePayment = async (method: 'paypay') => {
    if (!entryInfo) return;
    if (creditOnly) return; // 追加受付中はオフライン決済を成立させない
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
        // サーバー側が Stripe に照会して succeeded を確認できた時だけ purchase を送る。
        // already_completed（再送）では二重計上しない
        if (!data.already_completed) {
          trackPurchase(tournament.id, data.amount ?? stripeInfo?.amount ?? tournament.entry_fee);
        }
      } else {
        setPaidInfo({ amount: stripeInfo?.amount ?? 0, paidAt: new Date().toISOString() });
        setConfirmWarning(true);
      }
    } catch {
      setPaidInfo({ amount: stripeInfo?.amount ?? 0, paidAt: new Date().toISOString() });
      setConfirmWarning(true);
    } finally {
      setPaymentLoading(false);
      setStep('success');
    }
  };

  // 支払い方法未選択のままモーダルを閉じた場合も、従来通りの案内メール（PayPay/銀行振込情報）を送る。
  // ただし追加受付中はカード決済のみなので、オフライン支払いの案内は送らない
  // （決済未完了のまま参加確定と誤解させないため）
  const handleClose = () => {
    if (step === 'payment-method' && entryInfo && !paidInfo && !creditOnly) {
      void sendEmail(formData.email, 'confirmed', entryInfo.cancelToken);
    }
    onClose();
  };

  // 確認画面の表示フィールド
  const confirmFields = [
    { label: t.labelName, value: formData.name },
    ...(isDoubles ? [{ label: t.labelPartner, value: formData.partner_name || t.notEntered }] : []),
    { label: t.labelEmail, value: formData.email },
    { label: t.labelPhone.replace(/（.*）|\(.*\)/, ''), value: formData.phone || t.notEntered },
    { label: t.labelNotes.replace(/（.*）|\(.*\)/, ''), value: formData.notes || t.notEntered },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto ${step === 'payment-method' ? 'max-w-2xl' : 'max-w-md'}`}>
        {/* ヘッダー */}
        <div className={`px-6 py-5 rounded-t-2xl ${isWaitlist ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-gradient-to-r from-blue-600 to-blue-500'}`}>
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-white font-bold text-lg">
                {isWaitlist ? t.formTitleWaitlist : t.formTitle}
              </h2>
              <p className="text-white/80 text-sm mt-1">{tournament.title}</p>
            </div>
            <button onClick={handleClose} aria-label={t.close} className="text-white/70 hover:text-white text-2xl leading-none">×</button>
          </div>
          {/* キャンセル待て案内 */}
          {isWaitlist && step === 'input' && (
            <div className="mt-3 bg-white/20 rounded-xl px-3 py-2 text-white text-xs">
              {t.waitlistNote}
            </div>
          )}
          {/* ステップインジケーター */}
          {step !== 'success' && (
            <div className="flex items-center gap-2 mt-4">
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'input' ? 'text-white' : 'text-white/60'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'input' ? 'bg-white text-blue-600' : 'bg-white/30 text-white'}`}>1</span>
                {t.stepInput}
              </div>
              <div className="flex-1 h-px bg-white/30" />
              <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'confirm' ? 'text-white' : 'text-white/40'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'confirm' ? 'bg-white text-blue-600' : 'bg-white/20 text-white'}`}>2</span>
                {t.stepConfirm}
              </div>
              {!isWaitlist && tournament.payment_required && (
                <>
                  <div className="flex-1 h-px bg-white/30" />
                  <div className={`flex items-center gap-1.5 text-xs font-medium ${step === 'payment-method' ? 'text-white' : 'text-white/40'}`}>
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${step === 'payment-method' ? 'bg-white text-blue-600' : 'bg-white/20 text-white'}`}>3</span>
                    {t.stepPayment}
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
                ✅ {t.paySelectLead}<span className="font-bold">{t.paySelectLeadStrong}</span>
                {isDoubles && (
                  <p className="text-xs text-green-700 mt-1">{t.payPairNote(Math.round(tournament.entry_fee / 2).toLocaleString())}</p>
                )}
              </div>

              {!paymentLoading && (
                <button
                  type="button"
                  onClick={() => setStep('confirm')}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700"
                >
                  {t.back}
                </button>
              )}

              <PaymentMethodSelector
                entryFee={tournament.entry_fee}
                paypayId={tournament.paypay_id}
                creditAvailable={isCreditPaymentAvailable}
                redirectAvailable={isStripeRedirectPaymentAvailable}
                creditOnly={creditOnly}
                selected={paymentMethod}
                onSelect={handleSelectMethod}
                disabled={paymentLoading}
                lang={lang}
              />

              {paymentError && (
                <div role="alert" className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                  {paymentError}
                  {paymentMethod === 'credit' && (
                    <button
                      onClick={() => void createPaymentIntent()}
                      className="block mt-2 text-xs font-bold text-red-700 underline"
                    >
                      {t.payRetry}
                    </button>
                  )}
                </div>
              )}

              {/* クレジットカード決済フォーム */}
              {paymentMethod === 'credit' && paymentLoading && !stripeInfo && (
                <div className="flex items-center justify-center gap-3 py-8 text-gray-500 text-sm" aria-live="polite">
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-600 rounded-full animate-spin" />
                  {t.payPreparing}
                </div>
              )}
              {paymentMethod === 'credit' && stripeInfo && (
                <div className="border border-gray-200 rounded-xl p-4 bg-white">
                  <p className="text-sm font-bold text-gray-700 mb-3">{t.payCardLead}</p>
                  <StripePaymentForm
                    clientSecret={stripeInfo.clientSecret}
                    amount={stripeInfo.amount}
                    lang={lang}
                    onSuccess={id => void handleStripeSuccess(id)}
                  />
                </div>
              )}

              {/* PayPay */}
              {paymentMethod === 'paypay' && tournament.paypay_id && (
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
                  <p className="text-sm font-bold text-gray-700">{t.payPaypayLead}</p>
                  <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1">PayPay ID</p>
                    <p className="text-lg font-bold text-red-600">{tournament.paypay_id}</p>
                    <p className="text-xs text-gray-500 mt-1">{t.payPaypayMsg(formData.name)}</p>
                  </div>
                  <p className="text-xs text-gray-500">{t.payPaypayNote}</p>
                  <button
                    onClick={() => void handleConfirmOfflinePayment('paypay')}
                    disabled={paymentLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    {paymentLoading ? t.paySending : t.payPaypayBtn}
                  </button>
                </div>
              )}

              {/* WeChat Pay / Alipay（Stripeの決済画面へ移動） */}
              {paymentMethod === 'wechat_alipay' && (
                <div className="border border-gray-200 rounded-xl p-4 bg-white space-y-3">
                  <p className="text-sm text-gray-600 leading-relaxed">{t.pmRedirectNotice}</p>
                  <button
                    onClick={() => void startRedirectCheckout()}
                    disabled={paymentLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                  >
                    {paymentLoading ? t.pmRedirectLoading : t.pmRedirectButton}
                  </button>
                </div>
              )}

            </div>
          )}

          {/* 完了画面（クレジット決済） */}
          {step === 'success' && paymentMethod === 'credit' && paidInfo && (
            <PaymentCompletionPage
              tournament={tournament}
              name={formData.name}
              entryFee={tournament.entry_fee}
              total={paidInfo.amount}
              paidAt={paidInfo.paidAt}
              calendarUrl={buildGoogleCalendarUrl()}
              warning={confirmWarning}
              lang={lang}
              onClose={onClose}
            />
          )}

          {/* 完了画面 */}
          {step === 'success' && !(paymentMethod === 'credit' && paidInfo) && (
            <div className="text-center py-8">
              <div className="text-5xl mb-4">{isWaitlist ? '⏳' : '✅'}</div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {isWaitlist ? t.doneTitleWaitlist : t.doneTitle}
              </h3>
              <p className="text-gray-600 text-sm mb-4">
                {isWaitlist
                  ? t.doneLeadWaitlist(tournament.title)
                  : t.doneLead(tournament.title, formatDate(tournament.event_date))
                }
              </p>

              {/* キャンセル待ちの場合 */}
              {isWaitlist && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-left">
                  <p className="text-sm font-medium text-amber-900 mb-1">{t.doneWaitlistBox}</p>
                  <p className="text-xs text-amber-700 mb-1">{t.doneMail}: {formData.email}</p>
                  <p className="text-xs text-amber-700">{t.doneWaitlistBoxNote}</p>
                </div>
              )}

              {/* 確定申し込みの場合 */}
              {!isWaitlist && tournament.payment_required && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 text-left">
                  <p className="text-sm font-medium text-blue-900 mb-2">{t.donePayMailSent}</p>
                  {paymentMethod && (
                    <p className="text-xs text-blue-700 mb-2">{t.doneSelectedMethod}: {paymentMethod === 'paypay' ? t.methodPaypay : t.methodBank}</p>
                  )}
                  <p className="text-xs text-blue-700 mb-2">{t.doneMail}: {formData.email}</p>
                  <p className="text-xs text-blue-700">{t.donePayDeadline}: {tournament.payment_deadline ? formatDate(tournament.payment_deadline) : t.doneTbd}</p>
                </div>
              )}

              {/* キャンセル方法案内 */}
              {!isWaitlist && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 mb-4 text-left">
                  <p className="text-sm font-medium text-gray-700 mb-1">{t.doneCancelTitle}</p>
                  <p className="text-xs text-gray-500">{t.doneCancelNote((() => { const d = new Date(tournament.event_date); d.setDate(d.getDate() - 14); return formatDate(d.toISOString().split('T')[0]); })())}</p>
                </div>
              )}

              {/* カレンダー追加ボタン（確定のみ） */}
              {!isWaitlist && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 text-left">
                  <p className="text-sm font-bold text-green-900 mb-1">{t.doneCalTitle}</p>
                  <p className="text-xs text-green-700 mb-3">{t.doneCalNote}</p>
                  <a
                    href={buildGoogleCalendarUrl()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full bg-white border border-green-300 hover:bg-green-50 text-green-800 font-bold text-sm py-2.5 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>
                    </svg>
                    {t.doneCalBtn}
                  </a>
                </div>
              )}

              <button
                onClick={onClose}
                className={`w-full text-white px-6 py-3 rounded-xl font-bold transition-colors ${isWaitlist ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {t.close}
              </button>
            </div>
          )}

          {/* 確認画面 */}
          {step === 'confirm' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">{t.confirmLead(isWaitlist)}</p>
              <div className="bg-gray-50 rounded-xl divide-y divide-gray-200">
                <div className={`rounded-t-xl px-4 py-3 ${isWaitlist ? 'bg-amber-50' : 'bg-blue-50'}`}>
                  <p className={`text-xs font-medium mb-0.5 ${isWaitlist ? 'text-amber-600' : 'text-blue-600'}`}>{t.confirmTournament}</p>
                  <p className={`text-sm font-bold ${isWaitlist ? 'text-amber-900' : 'text-blue-900'}`}>{tournament.title}</p>
                  <p className={`text-xs ${isWaitlist ? 'text-amber-700' : 'text-blue-700'}`}>{formatDate(tournament.event_date)} ｜ {tournament.location}</p>
                  {isWaitlist && <p className="text-xs text-amber-600 font-medium mt-1">{t.confirmWaitlistNote}</p>}
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
                  {t.back}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className={`flex-1 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors text-sm ${isWaitlist ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {loading ? t.submitting : isWaitlist ? t.submitWaitlist : t.submit}
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.labelName} <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={t.phName}
                />
              </div>

              {isDoubles && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t.labelPartner}
                    <span className="text-xs text-gray-400 font-normal ml-2">{t.labelPartnerNote}</span>
                  </label>
                  <input
                    type="text"
                    value={formData.partner_name}
                    onChange={e => setFormData(p => ({ ...p, partner_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t.phPartner}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.labelEmail} <span className="text-red-500">*</span></label>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.labelPhone}</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData(p => ({ ...p, phone: e.target.value }))}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="090-1234-5678"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t.labelNotes}</label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder={t.phNotes}
                />
              </div>
              <button
                type="submit"
                className={`w-full text-white font-bold py-3 rounded-xl transition-colors ${isWaitlist ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {t.toConfirm}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
