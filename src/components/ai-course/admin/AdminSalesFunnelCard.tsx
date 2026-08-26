// 販売ファネル（2026-08-26 CEO指示 Phase S8）。
//
// 【この画面が答える問い】
//   どこから来た人が、どこで止まったか。
// 実測でLP閲覧のUTMが0件だったので、いまはほぼ全部が「直接・不明」に入る。
// **その状態が見えること自体**が最初の成果で、UTMを付け始めれば埋まっていく。
//
// 0件は0件として出す。取得に失敗したときは「0件」と言わずに失敗と言う
// （数字が信じられなくなるのがいちばん困る）。
import { useEffect, useState } from 'react';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { fetchSalesFunnel } from '../../../lib/aiLesson/course/admin/salesFunnelApi';
import { DIRECT_KEY, type SalesFunnel, type SalesWindow, type SourceRow } from '../../../lib/aiLesson/course/admin/salesFunnel';

const WINDOWS: { key: SalesWindow; label: string }[] = [
  { key: 'today', label: '今日' },
  { key: '7d', label: '7日' },
  { key: '30d', label: '30日' },
  { key: 'all', label: '全期間' },
];

/** ファネルの段。上から順に落ちていくものだけを並べる（順序に意味がある） */
const STEPS: { key: keyof SalesFunnel['counts']; label: string }[] = [
  { key: 'lp_view', label: 'LPを見た' },
  { key: 'cta_click', label: 'CTAを押した' },
  { key: 'trial_checkout_start', label: '体験の決済ページへ' },
  { key: 'monthly_checkout_start', label: '月額の決済ページへ' },
  { key: 'six_month_checkout_start', label: '6か月の申込フォームへ' },
  { key: 'purchase', label: '購入完了' },
  { key: 'trial_activated', label: '体験を開始' },
  { key: 'lesson_started', label: '会話を開始' },
  { key: 'lesson_completed', label: '会話を完了' },
  { key: 'review_scheduled', label: '復習が予定に入った' },
  { key: 'review_completed', label: '復習を実施' },
  { key: 'upgrade_cta_view', label: '続きの案内を見た' },
  { key: 'upgrade_cta_click', label: '続きのプランを選んだ' },
];

const Num = ({ n }: { n: number }) => (
  <span className={`tabular-nums font-bold ${n === 0 ? 'text-gray-400' : 'text-gray-900'}`}>{n}</span>
);

const SourceTable = ({ title, rows, note }: { title: string; rows: SourceRow[]; note?: string }) => (
  <div>
    <p className="mt-3 text-xs font-bold text-gray-500">{title}</p>
    {rows.length === 0 ? (
      <p className="mt-1 text-sm text-gray-400">まだありません</p>
    ) : (
      <ul className="mt-1 space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-2 text-sm">
            <span className={r.key === DIRECT_KEY ? 'text-gray-500' : 'text-gray-800'}>{r.key}</span>
            <span className="tabular-nums text-gray-600">
              閲覧 <Num n={r.lpViews} /> ／ 購入 <Num n={r.purchases} />
            </span>
          </li>
        ))}
      </ul>
    )}
    {note && <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{note}</p>}
  </div>
);

export const AdminSalesFunnelCard = () => {
  const [window, setWindow] = useState<SalesWindow>('30d');
  const [state, setState] = useState<{ funnel: SalesFunnel; failed: string[]; truncated: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void fetchSalesFunnel(window).then((r) => { if (alive) { setState(r); setLoading(false); } });
    return () => { alive = false; };
  }, [window]);

  const f = state?.funnel ?? null;

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <p className="text-sm font-bold text-gray-800 inline-flex items-center gap-1.5">
          <TrendingUp className="w-4 h-4 text-blue-600" />販売ファネル
        </p>
        <div role="group" aria-label="期間" className="flex gap-1">
          {WINDOWS.map((w) => (
            <button key={w.key} type="button" onClick={() => setWindow(w.key)}
              aria-pressed={window === w.key}
              className={`min-h-9 rounded-lg px-2.5 text-xs font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
                window === w.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {state && state.failed.length > 0 && (
        <p role="alert" className="mb-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {state.failed.join(' / ')} を読めませんでした。下の数字は不完全です（0件という意味ではありません）。
        </p>
      )}

      {loading && <p className="text-sm text-gray-400">集計中…</p>}

      {!loading && f && !f.hasAnyData && (
        <p className="text-sm text-gray-500">
          この期間はまだ1件もありません。（計測は 2026-08-26 から。それ以前の分は入っていません）
        </p>
      )}

      {!loading && f && f.hasAnyData && (
        <>
          <ul className="space-y-1">
            {STEPS.map((s) => (
              <li key={s.key} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-gray-700">{s.label}</span>
                <Num n={f.counts[s.key]} />
              </li>
            ))}
          </ul>

          <p className="mt-3 text-xs font-bold text-gray-500">日をまたいで戻ってきた復習</p>
          <div className="mt-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="text-gray-700">初回の翌日以降に復習した回数</span>
            <Num n={f.nextDayReviews} />
          </div>

          <p className="mt-3 text-xs font-bold text-gray-500">購入（本番決済のみ）</p>
          {f.purchasesByPlan.length === 0 ? (
            <p className="mt-1 text-sm text-gray-400">この期間の購入はありません</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {f.purchasesByPlan.map((p) => (
                <li key={p.planId} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-gray-700">{p.planId}</span>
                  <Num n={p.paid} />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs font-bold text-gray-500">続きへの移行</p>
          <ul className="mt-1 space-y-1">
            <li className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-gray-700">体験 → 月額（同じ人が買った）</span>
              <Num n={f.upgrades.trialToMonth} />
            </li>
            <li className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-gray-700">6か月コースの申込（決済ではなく相談）</span>
              <Num n={f.upgrades.sixMonthApplications} />
            </li>
          </ul>

          <SourceTable title="流入元（first-touch）" rows={f.bySource}
            note="UTMを付けていないリンクから来た人は「直接・不明」に入ります。小紅書・WeChat・広告のリンクにUTMを付けると、ここが分かれます。" />
          <SourceTable title="キャンペーン別" rows={f.byCampaign} />

          {state?.truncated && (
            <p className="mt-3 text-[11px] text-amber-700">
              件数が上限に達したため、古い分は集計に入っていません。
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default AdminSalesFunnelCard;
