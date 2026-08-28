import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { fetchWithTimeout } from '../lib/payment';
import { getEntryTexts } from '../locales/entry';
import { useLanguage } from '../contexts/LanguageContext';
import { trackPurchase } from '../lib/analytics';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const EDGE_BASE = SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');

/**
 * WeChat Pay / Alipay はStripeの画面へ一度出るため、戻ってきたところで
 * 支払いを確定させる必要がある（申込モーダルの状態はリダイレクトで消えている）。
 *
 * 戻り先URLの ?checkout=success&session_id=... を拾い、サーバーに確認させる。
 * 成立の判定はサーバーがStripeへ問い合わせて行い、この画面の申告は信用しない。
 */
export const CheckoutReturnNotice = ({ tournamentId }: { tournamentId: number }) => {
  const [params, setParams] = useSearchParams();
  const { lang } = useLanguage();
  const t = getEntryTexts(lang);
  const checkout = params.get('checkout');
  const sessionId = params.get('session_id');

  const [state, setState] = useState<'idle' | 'checking' | 'paid' | 'failed'>('idle');
  const [message, setMessage] = useState<string | null>(null);
  // React 18 の開発時2重実行で確認を2回走らせない
  const started = useRef(false);

  useEffect(() => {
    if (checkout === 'cancel') {
      setState('failed');
      setMessage(t.payReturnCanceled);
      return;
    }
    if (checkout !== 'success' || !sessionId || started.current) return;
    started.current = true;
    setState('checking');

    void (async () => {
      try {
        const res = await fetchWithTimeout(`${EDGE_BASE}/create-checkout-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ action: 'confirm', session_id: sessionId }),
        });
        const data = await res.json();
        if (data.success) {
          setState('paid');
          setMessage(null);
          // 再読み込みでの二重計上を避ける（already_completed のときは送らない）
          if (!data.already_completed) trackPurchase(tournamentId, data.amount ?? 0);
        } else {
          setState('failed');
          setMessage(data.error ?? t.payReturnCanceled);
        }
      } catch {
        setState('failed');
        setMessage(t.payErrPrepare);
      } finally {
        // 確認済みのパラメータはURLから外す（再読み込みで再確認しないように）
        const next = new URLSearchParams(params);
        next.delete('checkout');
        next.delete('session_id');
        next.delete('entry_id');
        setParams(next, { replace: true });
      }
    })();
    // checkout/sessionId が変わったときだけ走らせる
  }, [checkout, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'idle') return null;

  if (state === 'checking') {
    return (
      <div role="status" className="mb-6 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-t-blue-700" />
        {t.payReturnChecking}
      </div>
    );
  }

  if (state === 'paid') {
    return (
      <div role="status" className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
        <p className="font-bold">{t.payDoneTitle}</p>
        <p className="mt-1">{t.payDoneMailNote}</p>
      </div>
    );
  }

  return (
    <div role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
};
