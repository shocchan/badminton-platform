import { useEffect, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { calcCreditRefundAmount } from '../lib/payment';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const EDGE_BASE = SUPABASE_URL.replace('supabase.co', 'supabase.co/functions/v1');

interface EntryInfo {
  name: string;
  tournament_title: string;
  tournament_date: string;
  cancel_deadline: string;
  status: string;
  entry_fee: number;
  payment_required: boolean;
  payment_method: 'credit' | 'paypay' | 'bank' | null;
  payment_status: 'pending' | 'completed' | 'failed' | 'refunded' | null;
}

type PageState = 'loading' | 'found' | 'cancelled' | 'error' | 'past_deadline' | 'already_cancelled';

export const CancelEntryPage = () => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  const [state, setState] = useState<PageState>('loading');
  const [entry, setEntry] = useState<EntryInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [processing, setProcessing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [wasRefunded, setWasRefunded] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!token) {
      setState('error');
      setErrorMsg('キャンセルトークンが見つかりません。');
      return;
    }
    fetchEntryInfo();
  }, [token]);

  const fetchEntryInfo = async () => {
    setState('loading');
    try {
      const res = await fetch(`${EDGE_BASE}/process-cancel?token=${token}&action=info`, {
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'not_found') {
          setState('error');
          setErrorMsg('申し込み情報が見つかりません。URLをご確認ください。');
        } else if (data.error === 'already_cancelled') {
          setState('already_cancelled');
        } else {
          setState('error');
          setErrorMsg(data.error || '情報の取得に失敗しました。');
        }
        return;
      }

      // キャンセル期限チェック
      const deadline = new Date(data.cancel_deadline);
      deadline.setHours(23, 59, 59);
      if (new Date() > deadline) {
        setEntry(data);
        setState('past_deadline');
        return;
      }

      setEntry(data);
      setState('found');
    } catch {
      setState('error');
      setErrorMsg('通信エラーが発生しました。');
    }
  };

  const handleCancel = async () => {
    setConfirmOpen(false);
    setProcessing(true);
    try {
      const res = await fetch(`${EDGE_BASE}/process-cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ token, action: 'cancel' }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'キャンセルに失敗しました。');
      } else {
        setWasRefunded(!!data.refunded);
        setState('cancelled');
      }
    } catch {
      toast.error('通信エラーが発生しました。');
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
    });
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 max-w-md w-full p-8">

        {/* ローディング */}
        {state === 'loading' && (
          <div className="text-center py-8">
            <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 text-sm">情報を取得しています...</p>
          </div>
        )}

        {/* 申し込み情報表示（キャンセル確認） */}
        {state === 'found' && entry && (
          <>
            <div className="text-center mb-6">
              <div className="text-4xl mb-3">🏸</div>
              <h1 className="text-xl font-bold text-gray-900 mb-1">申し込みキャンセル</h1>
              <p className="text-sm text-gray-500">以下の申し込みをキャンセルします</p>
            </div>

            <div className="bg-gray-50 rounded-xl p-5 mb-5 space-y-3">
              <div>
                <p className="text-xs text-gray-500">大会名</p>
                <p className="font-bold text-gray-900">{entry.tournament_title}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">開催日</p>
                <p className="font-medium text-gray-800">{formatDate(entry.tournament_date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">申込者名</p>
                <p className="font-medium text-gray-800">{entry.name} 様</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">キャンセル期限</p>
                <p className="font-medium text-gray-800">{formatDate(entry.cancel_deadline)}</p>
              </div>
            </div>

            {entry.payment_required && entry.payment_status === 'completed' && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-5 text-sm">
                <p className="font-bold text-yellow-800 mb-1">💰 参加費の返金について</p>
                <p className="text-yellow-700 text-xs">
                  {entry.payment_method === 'credit'
                    ? `参加費の90%（¥${calcCreditRefundAmount(entry.entry_fee).toLocaleString()}）をお支払いいただいたクレジットカードに自動返金します（キャンセル手数料として10%を差し引きます。カード明細への反映まで数日かかる場合があります）。`
                    : '主催者より銀行振込またはPayPayにて返金します。返金まで数日かかる場合があります。'}
                </p>
              </div>
            )}

            <button
              onClick={() => setConfirmOpen(true)}
              disabled={processing}
              className="w-full bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors mb-3"
            >
              {processing ? 'キャンセル処理中...' : 'キャンセルする'}
            </button>
            <ConfirmDialog
              open={confirmOpen}
              title="申し込みをキャンセルしますか？"
              message="キャンセル後に再度参加したい場合は、あらためてお申し込みが必要です。"
              confirmLabel="キャンセルする"
              cancelLabel="やめる"
              danger
              onConfirm={handleCancel}
              onCancel={() => setConfirmOpen(false)}
            />
            <a
              href="/ja/"
              className="block w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2"
            >
              ← トップページへ戻る
            </a>
          </>
        )}

        {/* キャンセル完了 */}
        {state === 'cancelled' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">キャンセル完了</h1>
            <p className="text-sm text-gray-600 mb-6">
              申し込みをキャンセルしました。<br />
              {wasRefunded && entry
                ? `参加費の90%（¥${calcCreditRefundAmount(entry.entry_fee).toLocaleString()}）をクレジットカードへ返金しました（キャンセル手数料10%差引）。`
                : '参加費をお支払い済みの場合は、主催者より返金の連絡をいたします。'}
            </p>
            <a
              href="/ja/"
              className="inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
            >
              トップページへ
            </a>
          </div>
        )}

        {/* キャンセル期限超過 */}
        {state === 'past_deadline' && entry && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">⏰</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">キャンセル期限が過ぎています</h1>
            <p className="text-sm text-gray-600 mb-4">
              キャンセル期限（{formatDate(entry.cancel_deadline)}）を過ぎているため、
              オンラインでのキャンセルはできません。
            </p>
            <p className="text-sm text-gray-500 mb-6">
              ご事情がある場合は、参加費支払い案内メールへの返信でご連絡ください。
            </p>
            <a
              href="/ja/"
              className="inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
            >
              トップページへ
            </a>
          </div>
        )}

        {/* すでにキャンセル済み */}
        {state === 'already_cancelled' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">ℹ️</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">すでにキャンセル済みです</h1>
            <p className="text-sm text-gray-600 mb-6">
              この申し込みはすでにキャンセルされています。
            </p>
            <a
              href="/ja/"
              className="inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
            >
              トップページへ
            </a>
          </div>
        )}

        {/* エラー */}
        {state === 'error' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">❌</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">エラーが発生しました</h1>
            <p className="text-sm text-gray-600 mb-6">{errorMsg}</p>
            <a
              href="/ja/"
              className="inline-block bg-blue-600 text-white font-bold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors"
            >
              トップページへ
            </a>
          </div>
        )}
      </div>
    </main>
  );
};
