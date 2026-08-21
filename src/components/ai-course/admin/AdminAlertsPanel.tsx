// 運用タブ: 未解決アラート一覧（Task 1・2026-08-21）。
//
// 「入金済みなのに学習を始められない人がいる」ような障害に運営が気づけるようにする。
// 検知は毎日9:00(JST)の監視ジョブ。ここは表示と「解決済み」の切り替えだけ。
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldCheck } from 'lucide-react';
import { adminListAlerts, adminResolveAlert, type AdminAlert } from '../../../lib/aiLesson/course/admin/adminAlertsApi';

const jst = (iso: string): string =>
  new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const STYLE: Record<AdminAlert['severity'], { box: string; chip: string; label: string }> = {
  critical: { box: 'border-red-200 bg-red-50', chip: 'bg-red-600 text-white', label: '重大' },
  warning: { box: 'border-amber-200 bg-amber-50', chip: 'bg-amber-500 text-white', label: '注意' },
  info: { box: 'border-gray-200 bg-white', chip: 'bg-gray-400 text-white', label: '情報' },
};

export const AdminAlertsPanel = ({ onOpenAccount }: { onOpenAccount?: (userId: string) => void }) => {
  const [alerts, setAlerts] = useState<AdminAlert[] | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminListAlerts(showResolved)
      .then(setAlerts)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '取得に失敗しました'));
  }, [showResolved]);

  useEffect(load, [load]);

  const toggle = async (a: AdminAlert) => {
    setBusy(a.id);
    try {
      await adminResolveAlert(a.id, !a.resolved);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '更新に失敗しました');
    } finally {
      setBusy(null);
    }
  };

  const open = (alerts ?? []).filter((a) => !a.resolved);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <p className="text-sm font-bold text-gray-800 inline-flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-600" />運用アラート
        </p>
        <button type="button" onClick={() => setShowResolved((v) => !v)}
          className="text-xs text-gray-500 underline underline-offset-2 min-h-11 sm:min-h-0">
          {showResolved ? '未解決だけ表示' : '解決済みも表示'}
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">毎日9:00に自動チェック。重大は即メール通知されます。</p>

      {error && <p className="text-sm text-red-700">取得エラー: {error}</p>}
      {!alerts && !error && <p className="text-sm text-gray-400">読み込み中…</p>}

      {alerts && alerts.length === 0 && (
        <p className="text-sm text-gray-600 inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          {showResolved ? 'アラートはありません' : '未解決のアラートはありません'}
        </p>
      )}

      {alerts && alerts.length > 0 && (
        <>
          {!showResolved && open.length > 0 && (
            <p className="text-xs font-bold text-gray-700 mb-2">未解決 {open.length}件</p>
          )}
          <ul className="space-y-2">
            {alerts.map((a) => {
              const s = STYLE[a.severity];
              return (
                <li key={a.id} className={`rounded-xl border p-3 ${a.resolved ? 'border-gray-200 bg-gray-50 opacity-70' : s.box}`}>
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-gray-900 break-words">
                        <span className={`inline-block mr-1.5 rounded px-1.5 py-0.5 text-[11px] align-middle ${s.chip}`}>{s.label}</span>
                        {a.title}
                      </p>
                      <p className="mt-1 text-xs text-gray-700 break-words">{a.detail}</p>
                      <p className="mt-1 text-[11px] text-gray-500 tabular-nums">
                        {a.occurrences}回 / 初回 {jst(a.firstSeenISO)} / 最終 {jst(a.lastSeenISO)}
                        {a.resolved && a.resolvedBy && <> / 解決 {a.resolvedBy}</>}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {a.subjectUserId && onOpenAccount && (
                        <button type="button" onClick={() => onOpenAccount(a.subjectUserId as string)}
                          className="min-h-11 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-700">
                          対象を開く
                        </button>
                      )}
                      <button type="button" disabled={busy === a.id} onClick={() => toggle(a)}
                        className="min-h-11 px-2.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-700 disabled:opacity-50 inline-flex items-center gap-1">
                        {a.resolved ? <><RotateCcw className="w-3.5 h-3.5" />未解決に戻す</> : <><CheckCircle2 className="w-3.5 h-3.5" />解決済み</>}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-3 text-[11px] text-gray-400">
        <AlertTriangle className="w-3 h-3 inline mr-0.5" />
        アラートに会話内容・氏名・メールアドレスは含まれません（件数とエラーコードのみ）。
      </p>
    </div>
  );
};
