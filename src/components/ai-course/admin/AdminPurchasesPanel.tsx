// 購入台帳（セルフサービス決済・2026-08-20）。
//
// 目的は「初回の実顧客の購入を目視で確認する」こと。見たいのは3つだけ:
//   ① 決済が入ったか ② アカウントが自動発行されたか ③ 失敗していないか
// なので、発行されたログインIDと状態を主役にし、Stripeのsession IDは補助に落とす。
//
// 注意: **要対応（failed）を先頭に出す**。自動発行が落ちた購入は、
// 気づかないと「お金を払ったのに入れない人」を放置することになる。
import { useEffect, useState } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Clock, RotateCcw } from 'lucide-react';
import { adminListPurchases, type AdminPurchaseRow } from '../../../lib/aiLesson/course/admin/adminAccountsApi';
import { planById, planView } from '../../../lib/aiLesson/course/plans/planCatalog';

const jst = (iso: string | null): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—'
    : d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const STATUS: Record<string, { label: string; cls: string }> = {
  provisioned: { label: '発行済み', cls: 'bg-emerald-50 text-emerald-700' },
  paid: { label: '決済済み・発行中', cls: 'bg-blue-50 text-blue-700' },
  pending: { label: '未完了（離脱）', cls: 'bg-gray-100 text-gray-500' },
  failed: { label: '要対応', cls: 'bg-red-50 text-red-700' },
  refunded: { label: '返金済み', cls: 'bg-amber-50 text-amber-800' },
};

export function AdminPurchasesPanel() {
  const [rows, setRows] = useState<AdminPurchaseRow[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setRows(await adminListPurchases());
    setBusy(false);
  };
  useEffect(() => { void load(); }, []);

  // 要対応を最上部へ（見落とすと入金済みの人が入れないまま放置される）
  const sorted = [...(rows ?? [])].sort((a, b) => {
    const rank = (s: string) => (s === 'failed' ? 0 : s === 'paid' ? 1 : 2);
    return rank(a.status) - rank(b.status)
      || (b.createdAtISO < a.createdAtISO ? -1 : b.createdAtISO > a.createdAtISO ? 1 : 0);
  });
  const live = sorted.filter((r) => r.livemode && r.status === 'provisioned');
  const sales = live.reduce((n, r) => n + r.amountJpy, 0);
  const failed = sorted.filter((r) => r.status === 'failed').length;

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-gray-900">購入台帳（クレジット決済）</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            LPから買われた600円・2,980円プランの記録。発行まで自動で進みます
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy}
          className="inline-flex items-center gap-1.5 min-h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden="true" />更新
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-gray-50 py-2">
          <p className="text-[11px] text-gray-500">発行済み（本番）</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">{live.length}</p>
        </div>
        <div className="rounded-xl bg-gray-50 py-2">
          <p className="text-[11px] text-gray-500">売上（本番のみ）</p>
          <p className="text-lg font-bold text-gray-900 tabular-nums">¥{sales.toLocaleString('ja-JP')}</p>
        </div>
        <div className={`rounded-xl py-2 ${failed > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
          <p className="text-[11px] text-gray-500">要対応</p>
          <p className={`text-lg font-bold tabular-nums ${failed > 0 ? 'text-red-700' : 'text-gray-900'}`}>{failed}</p>
        </div>
      </div>

      {failed > 0 && (
        <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-800">
          <AlertTriangle className="mt-0.5 w-4 h-4 shrink-0" aria-hidden="true" />
          <span>
            自動発行に失敗した購入があります。<b>お金を受け取ったのに学習を始められない人</b>がいる状態です。
            下の「理由」を確認し、必要なら手動でIDを発行してください。
          </span>
        </p>
      )}

      {rows === null ? (
        <p className="mt-4 text-xs text-gray-400">読み込んでいます…</p>
      ) : sorted.length === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 px-3 py-4 text-center text-xs text-gray-500">
          まだ購入はありません。最初の1件が入るとここに出ます。
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {sorted.map((r) => {
            const cfg = planById(r.planId);
            const name = cfg ? planView(cfg, 'ja').name : r.planId;
            const st = STATUS[r.status] ?? { label: r.status, cls: 'bg-gray-100 text-gray-600' };
            return (
              <li key={r.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${st.cls}`}>
                    {r.status === 'provisioned' && <CheckCircle2 className="mr-1 inline w-3 h-3" aria-hidden="true" />}
                    {r.status === 'paid' && <Clock className="mr-1 inline w-3 h-3" aria-hidden="true" />}
                    {r.status === 'refunded' && <RotateCcw className="mr-1 inline w-3 h-3" aria-hidden="true" />}
                    {st.label}
                  </span>
                  <span className="text-sm font-bold text-gray-900">{name}</span>
                  <span className="text-sm text-gray-700 tabular-nums">¥{r.amountJpy.toLocaleString('ja-JP')}</span>
                  {!r.livemode && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">テスト決済</span>
                  )}
                  <span className="ml-auto text-[11px] text-gray-400 tabular-nums">{jst(r.createdAtISO)}</span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-600">
                  <span>ログインID: <b className="font-mono">{r.loginId ?? '—'}</b></span>
                  <span>購入者: {r.buyerEmail ?? '—'}</span>
                  {r.provisionedAtISO && <span>発行: {jst(r.provisionedAtISO)}</span>}
                </div>
                {r.error && (
                  <p className="mt-1.5 rounded-lg bg-red-50 px-2 py-1 text-[11px] leading-relaxed text-red-700 break-all">
                    理由: {r.error}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default AdminPurchasesPanel;
