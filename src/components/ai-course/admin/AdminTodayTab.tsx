// 管理ページ タブ1「今日」。KPIチップ＋自動生成の要対応リスト。
// 値はすべて buildKpis / buildAttention（実データ集計の純関数）から受け取る（原則13）。
// このコンポーネント自身は集計しない＝表示に徹する。

import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { AdminKpis, AttentionItem } from '../../../lib/aiLesson/course/admin/adminAttention';

interface Props {
  kpis: AdminKpis;
  items: AttentionItem[];
  /** 要対応の対象者をタップ → 生徒タブの該当詳細へ */
  onOpenAccount: (userId: string) => void;
  /** 問題報告の項目をタップ → 運用タブへ */
  onOpenOps: () => void;
}

const Chip = ({ label, value, sub, warn }: {
  label: string; value: string; sub?: string; warn?: boolean;
}) => (
  <div className={`min-w-[7.5rem] shrink-0 snap-start rounded-xl border p-3 ${warn ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'}`}>
    <p className="text-[11px] text-gray-500">{label}</p>
    <p className={`text-lg font-bold tabular-nums ${warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
    {sub && <p className="text-[10px] text-gray-500 tabular-nums">{sub}</p>}
  </div>
);

export const AdminTodayTab = ({ kpis, items, onOpenAccount, onOpenOps }: Props) => {
  // warn（amber）→ info（gray）の順。同severity内は受け取った順を保つ
  const sorted = [...items].sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'warn' ? -1 : 1);

  return (
    <div>
      {/*
        朝の点検ボードへの入口（2026-08-23 CEO「今管理画面開いてるけどどこから？」）。
        ボードは毎朝7:30に作り直されて、名前を押すとこのページの該当生徒へ直接来られる。
        入口が見つからないと結局タブを回ることになるので、ここから行けるようにする
      */}
      <a href="https://claude.ai/code/artifact/e2773b9f-c7ae-4719-8fb2-3d2e6b5d9cc8"
        target="_blank" rel="noopener"
        className="mb-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 hover:border-emerald-400">
        🧭 朝の点検ボードをひらく
        <span className="text-[11px] text-emerald-700">（毎朝7:30に最新化・名前から生徒ページへ直行）</span>
      </a>

      {/* KPIチップ（1行横スクロール） */}
      <div className="flex gap-2 overflow-x-auto snap-x pb-1 -mx-1 px-1">
        <Chip label="生徒" value={`${kpis.students}人`}
          sub={kpis.notLoggedIn > 0 ? `内 未ログイン${kpis.notLoggedIn}人` : undefined}
          warn={kpis.notLoggedIn > 0} />
        <Chip label="今週学習" value={`${kpis.activeThisWeek}人`} />
        <Chip label="停滞" value={`${kpis.stalled}人`} warn={kpis.stalled > 0} />
        <Chip label="期限30日以内" value={`${kpis.expiring30}人`} />
        <Chip label="今月AIコスト（生徒）" value={`$${kpis.monthCostStudents.toFixed(2)}`}
          sub={`検証分 $${kpis.monthCostOthers.toFixed(2)}`} />
      </div>

      {/* 要対応リスト */}
      <p className="mt-5 mb-2 text-sm font-bold text-gray-800">要対応</p>
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-medium text-emerald-800">今日は対応不要です</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((it, i) => {
            const uid = it.userId;
            const onClick = it.kind === 'open_issues' ? onOpenOps
              : uid ? () => onOpenAccount(uid) : undefined;
            const warn = it.severity === 'warn';
            return (
              <li key={`${it.kind}-${uid ?? 'all'}-${i}`}>
                <button type="button" onClick={onClick} disabled={!onClick}
                  className={`w-full min-h-11 text-left rounded-xl border p-3 flex items-start gap-2.5 ${warn ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'} ${onClick ? 'active:opacity-80' : 'cursor-default'}`}>
                  {warn
                    ? <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-600 shrink-0" />
                    : <Info className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />}
                  <span className="min-w-0">
                    <span className={`block text-sm font-medium ${warn ? 'text-amber-900' : 'text-gray-900'}`}>{it.titleJa}</span>
                    {it.detailJa && <span className="block text-xs text-gray-600 mt-0.5 break-words">{it.detailJa}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
