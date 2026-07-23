// 管理画面: 生徒ごとの「利用とコスト（今月）」を視覚的に表示する。
// データは ai_usage_daily の当月集計（AdminUsageCost）。推定コスト＋月次上限メーター＋日次リズム。

import { Coins, ExternalLink, Gauge, CalendarClock } from 'lucide-react';
import type { AdminUsageCost } from '../../lib/aiLesson/course/courseAdminApi';

interface Props {
  data: AdminUsageCost;
  /** 推定USD→円の概算レート（表示は「約」） */
  jpyRate?: number;
}

const yen = (usd: number, rate: number) => `¥${Math.round(usd * rate).toLocaleString('ja-JP')}`;
const min1 = (sec: number) => (sec / 60).toFixed(1);

/** 使用率に応じた色（余裕=emerald / 迫る=amber / 上限近い=red） */
const meterColor = (ratio: number) =>
  ratio >= 0.85 ? { bar: 'bg-red-500', text: 'text-red-600' }
    : ratio >= 0.6 ? { bar: 'bg-amber-500', text: 'text-amber-600' }
      : { bar: 'bg-emerald-500', text: 'text-emerald-600' };

export const CourseUsageCostCard = ({ data, jpyRate = 150 }: Props) => {
  const ratio = data.monthlyMaxSessions > 0 ? Math.min(data.month.sessions / data.monthlyMaxSessions, 1) : 0;
  const remaining = Math.max(data.monthlyMaxSessions - data.month.sessions, 0);
  const c = meterColor(ratio);
  const maxDaySessions = Math.max(1, ...data.days.map((d) => d.sessions));

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Coins className="w-4 h-4 text-amber-500" />利用とコスト（今月）
        </p>
        <a href="https://platform.openai.com/usage" target="_blank" rel="noopener noreferrer"
          className="text-[11px] text-gray-400 hover:text-blue-600 flex items-center gap-1">
          OpenAI実請求<ExternalLink className="w-3 h-3" />
        </a>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* 推定コスト（今月） */}
        <div className="rounded-xl bg-gradient-to-br from-slate-50 to-blue-50 border border-blue-100 p-4">
          <p className="text-[11px] text-gray-500">今月の推定コスト</p>
          <p className="text-3xl font-bold text-gray-900 tracking-tight tabular-nums">
            ${data.month.costUsd.toFixed(2)}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">約 {yen(data.month.costUsd, jpyRate)}（推定・レート{jpyRate}）</p>
        </div>

        {/* 月次上限メーター */}
        <div className="rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-gray-500 flex items-center gap-1"><Gauge className="w-3.5 h-3.5 text-blue-500" />月次上限</p>
            <p className={`text-xs font-bold tabular-nums ${c.text}`}>{data.month.sessions} / {data.monthlyMaxSessions}回</p>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden" role="progressbar" aria-valuenow={data.month.sessions} aria-valuemax={data.monthlyMaxSessions}>
            <div className={`h-full rounded-full motion-safe:transition-[width] motion-safe:duration-700 ${c.bar}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
          <p className="text-[11px] text-gray-500 mt-1.5">
            残り <span className="font-bold text-gray-700">{remaining}回</span> ・ 利用 {min1(data.month.seconds)}分
          </p>
        </div>
      </div>

      {/* 日次リズム（当月の利用があった日） */}
      <div className="mt-4">
        <p className="text-[11px] text-gray-500 mb-2 flex items-center gap-1"><CalendarClock className="w-3.5 h-3.5 text-gray-400" />今月の利用リズム</p>
        {data.days.length === 0 ? (
          <p className="text-xs text-gray-400">今月はまだ利用がありません。</p>
        ) : (
          <div className="flex items-end gap-1 h-16">
            {data.days.map((d) => (
              <div key={d.date} className="flex-1 min-w-[6px] flex flex-col items-center justify-end group"
                title={`${d.date.slice(5)}: ${d.sessions}回 / ${min1(d.seconds)}分 / $${d.costUsd.toFixed(2)}`}>
                <div className="w-full rounded-t bg-blue-400 group-hover:bg-blue-600 motion-safe:transition-colors"
                  style={{ height: `${Math.max((d.sessions / maxDaySessions) * 100, 8)}%` }} />
                <span className="text-[9px] text-gray-400 mt-0.5">{Number(d.date.slice(8, 10))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 今日 */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-gray-100">
        <span className="text-[11px] text-gray-500">今日</span>
        <span className="text-xs font-bold text-gray-800 tabular-nums">{data.today.sessions}回</span>
        <span className="text-gray-300">・</span>
        <span className="text-xs font-bold text-gray-800 tabular-nums">{min1(data.today.seconds)}分</span>
        <span className="text-gray-300">・</span>
        <span className="text-xs text-gray-500 tabular-nums">${data.today.costUsd.toFixed(2)}</span>
      </div>

      <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">
        ※ アプリ内の利用時間から算出した推定値です。OpenAIの実請求額は上のリンクで確認してください。
      </p>
    </div>
  );
};
