// 決済の観測（2026-09-09 P0-1）。
//
// 【この画面の役目】
// CEOが ¥600 を実際に買っている**その最中に**、どこまで進んだかを見る。
//   セッション作成 →（Stripeの画面）→ webhook受信 → 入金確定 → アカウント発行 → 自動ログイン
// どこで止まったかが分かれば、8/20〜9/7の「14件開始・0件完了」の原因が確定する。
//
// 更新はボタンと、必要なときだけの自動更新（5秒）。常時ポーリングはしない。
import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, RefreshCw, AlertTriangle, CheckCircle2, HelpCircle, Radio } from 'lucide-react';
import { fetchPaymentWatch } from '../../../lib/aiLesson/course/admin/paymentWatchApi';
import {
  diagnose, realSessions, byPaymentMethod, isSettled,
  type PaymentWatch, type PaymentSessionRow, type VerdictLevel,
} from '../../../lib/aiLesson/course/admin/paymentWatch';

const jst = (iso: string): string =>
  iso ? new Date(iso).toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) : '—';

const VERDICT: Record<VerdictLevel, { box: string; chip: string; Icon: typeof AlertTriangle }> = {
  blocked: { box: 'border-red-300 bg-red-50', chip: 'bg-red-600 text-white', Icon: AlertTriangle },
  watch: { box: 'border-amber-300 bg-amber-50', chip: 'bg-amber-500 text-white', Icon: AlertTriangle },
  ok: { box: 'border-green-300 bg-green-50', chip: 'bg-green-600 text-white', Icon: CheckCircle2 },
  unknown: { box: 'border-gray-200 bg-gray-50', chip: 'bg-gray-400 text-white', Icon: HelpCircle },
};

const STATUS_LABEL: Record<PaymentSessionRow['status'], string> = {
  pending: '未確定',
  awaiting_payment: '入金待ち',
  paid: '入金済み（発行前）',
  provisioned: '発行済み',
  expired: '期限切れ',
  failed: '失敗',
  refunded: '返金',
};

const statusClass = (s: PaymentSessionRow['status']): string =>
  s === 'provisioned' ? 'bg-green-100 text-green-800'
    : s === 'paid' ? 'bg-red-100 text-red-800'
      : s === 'awaiting_payment' ? 'bg-amber-100 text-amber-800'
        : s === 'failed' || s === 'refunded' ? 'bg-gray-200 text-gray-700'
          : 'bg-gray-100 text-gray-600';

export const AdminPaymentWatchPanel = () => {
  const [watch, setWatch] = useState<PaymentWatch | null>(null);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string>('');
  const timer = useRef<number | null>(null);

  const load = useCallback(async () => {
    const w = await fetchPaymentWatch(30);
    if (w) { setWatch(w); setFailed(false); setLoadedAt(new Date().toISOString()); }
    else setFailed(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 実決済テスト中だけ5秒ごとに取り直す。押している間だけ動く（放置で回り続けない）
  useEffect(() => {
    if (!live) return;
    timer.current = window.setInterval(() => { void load(); }, 5000);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [live, load]);

  if (failed) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="text-sm font-bold text-gray-800 inline-flex items-center gap-1.5 mb-1">
          <CreditCard className="w-4 h-4 text-blue-600" />決済の観測
        </p>
        <p className="text-sm text-gray-700">
          読み込めませんでした。管理者アカウントでログインしているかを確認して、もう一度開いてください。
        </p>
        <button type="button" onClick={() => { setFailed(false); void load(); }}
          className="mt-3 min-h-11 rounded-xl border border-gray-300 px-4 text-sm font-bold text-gray-700">
          もう一度読み込む
        </button>
      </div>
    );
  }

  if (!watch) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-4">
        <p className="text-sm text-gray-400">決済の観測を読み込み中…</p>
      </div>
    );
  }

  const v = diagnose(watch);
  const S = VERDICT[v.level];
  const rows = realSessions(watch.sessions);
  const methods = byPaymentMethod(watch.sessions);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <p className="text-sm font-bold text-gray-800 inline-flex items-center gap-1.5">
          <CreditCard className="w-4 h-4 text-blue-600" />決済の観測（直近30日）
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLive((x) => !x)}
            aria-pressed={live}
            className={`min-h-11 sm:min-h-9 inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-bold ${
              live ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-700'}`}>
            <Radio className={`w-3.5 h-3.5 ${live ? 'animate-pulse' : ''}`} />
            {live ? '実決済テスト中（5秒ごと更新）' : '実決済テストを見る'}
          </button>
          <button type="button" onClick={() => void load()}
            className="min-h-11 sm:min-h-9 inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-3 text-xs font-bold text-gray-700">
            <RefreshCw className="w-3.5 h-3.5" />更新
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        最終取得 {jst(loadedAt)}。テスト行とテストモードは判断から除いています。
      </p>

      {/* 判定 */}
      <div className={`rounded-xl border p-3 ${S.box}`}>
        <p className="text-sm font-bold text-gray-900 inline-flex items-center gap-1.5">
          <S.Icon className="w-4 h-4" />{v.headline}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-700">{v.because}</p>
        <p className="mt-1.5 text-xs leading-relaxed text-gray-900"><b>次にやること：</b>{v.next}</p>
      </div>

      {/* 集計 */}
      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([
          ['本番セッション', String(rows.length)],
          ['発行まで完了', String(rows.filter((r) => r.status === 'provisioned').length)],
          ['webhook受信（30日）', String(watch.totals.webhookEvents)],
          ['webhook受信（通算）', String(watch.totals.webhookEventsEver)],
        ] as const).map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
            <p className="text-[11px] text-gray-500">{label}</p>
            <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      {/* 支払い手段ごと */}
      {methods.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold text-gray-600 mb-1">支払い手段ごと（成立 / 開始）</p>
          <div className="flex flex-wrap gap-1.5">
            {methods.map((m) => (
              <span key={m.method}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                  m.settled > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                {m.method}：{m.settled} / {m.total}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* セッション一覧 */}
      <div className="mt-4">
        <p className="text-xs font-bold text-gray-600 mb-1">決済セッション（新しい順）</p>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-600">
            この30日に本番の決済セッションはありません。¥600の体験パスを1回買うと、ここに行が出ます。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[620px] text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">開始</th>
                  <th className="px-3 py-2 text-left font-medium">プラン</th>
                  <th className="px-3 py-2 text-left font-medium">状態</th>
                  <th className="px-3 py-2 text-left font-medium">手段</th>
                  <th className="px-3 py-2 text-right font-medium">webhook</th>
                  <th className="px-3 py-2 text-left font-medium">session</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.sessionRef} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{jst(r.createdAtISO)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{r.planId}<span className="ml-1 text-gray-400">{r.locale}</span></td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${statusClass(r.status)}`}>
                        {STATUS_LABEL[r.status]}
                      </span>
                      {r.error && <span className="ml-1 text-red-700">{r.error.slice(0, 60)}</span>}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-600">{r.paymentMethod ?? '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.webhookCount === 0 ? 'font-bold text-red-700' : 'text-gray-700'}`}>
                      {r.webhookCount}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono text-gray-400">…{r.sessionRef}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 受信ログ */}
      <div className="mt-4">
        <p className="text-xs font-bold text-gray-600 mb-1">Stripeからの通知（新しい順・最大200件）</p>
        {watch.events.length === 0 ? (
          <p className="text-sm text-gray-700">
            通知を1件も受け取っていません。<b>この空欄そのものが証拠です</b>——
            決済が行われたのに行が増えなければ、Stripe側のWebhook設定を確認してください。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">受信</th>
                  <th className="px-3 py-2 text-left font-medium">種類</th>
                  <th className="px-3 py-2 text-left font-medium">結果</th>
                  <th className="px-3 py-2 text-left font-medium">内容</th>
                </tr>
              </thead>
              <tbody>
                {watch.events.slice(0, 60).map((e, i) => (
                  <tr key={`${e.receivedAtISO}-${i}`} className="border-t border-gray-100">
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{jst(e.receivedAtISO)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700">{e.eventType}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`rounded-full px-2 py-0.5 font-medium ${
                        e.outcome === 'error' || e.outcome === 'signature_failed' ? 'bg-red-100 text-red-800'
                          : e.outcome === 'handled' ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-600'}`}>
                        {e.outcome}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">
                      {e.sessionRef && <span className="font-mono text-gray-400">…{e.sessionRef} </span>}
                      {e.detail}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 実決済テストの手順 */}
      <details className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
        <summary className="cursor-pointer text-sm font-bold text-blue-900">実決済テストのやり方（¥600）</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-gray-800">
          <li>この画面で「実決済テストを見る」を押す（5秒ごとに更新されます）。</li>
          <li>別の端末で <b>普段のスマホのブラウザ</b> から <code>/zh/ai-course</code> を開き、¥600の体験パスを購入する。</li>
          <li>上の表に「開始」の行が出るか → 出なければ checkout 関数まで届いていない。</li>
          <li>支払い後、通知の表に <code>checkout.session.completed</code> が出るか → 出なければ Stripe の Webhook 設定を疑う。</li>
          <li>状態が「発行済み」になり、購入完了ページで自動ログインまで進むか。</li>
          <li>同じことを <b>WeChat内蔵ブラウザ</b>（WeChatでURLを自分に送って開く）でもう一度行う。どちらで止まるかで原因が切り分けられます。</li>
        </ol>
        <p className="mt-2 text-xs text-gray-600">
          支払い手段は決済画面に出るものをそのまま選んでください（card / 支付宝 / 微信支付）。
          どれが表示されたかも記録に残ります。
        </p>
      </details>

      {rows.some((r) => isSettled(r.status) && !r.provisioned) && (
        <p className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-900">
          入金済みなのに発行できていない行があります。お金を受け取って商品を渡せていない状態なので、最優先で対応してください。
        </p>
      )}
    </div>
  );
};

export default AdminPaymentWatchPanel;
