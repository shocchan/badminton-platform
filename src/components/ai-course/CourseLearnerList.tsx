// 管理画面の生徒一覧（§8）。選択前に全員の利用状況が一目で分かるカード一覧。
// PC=グリッド / スマホ=縦一覧。コストは控えめ、上限が近い生徒だけ注意表示。

import { PauseCircle, AlertTriangle } from 'lucide-react';
import { DEFAULT_USAGE_LIMITS } from '../../lib/aiLesson/course/courseConfig';
import type { AdminLearnerRow, LearnerUsageSummary } from '../../lib/aiLesson/course/courseAdminApi';

interface Props {
  learners: AdminLearnerRow[];
  usageMap: Record<string, LearnerUsageSummary>;
  selectedId: string | null;
  emptyLabel: string;
  onSelect: (l: AdminLearnerRow) => void;
}

const monthlyCapOf = (l: AdminLearnerRow) =>
  l.adminOverrides.monthlyMaxSessions ?? DEFAULT_USAGE_LIMITS.monthly_max_sessions;

export const CourseLearnerList = ({ learners, usageMap, selectedId, emptyLabel, onSelect }: Props) => {
  if (learners.length === 0) return <p className="text-sm text-gray-500 mb-4">{emptyLabel}</p>;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-5">
      {learners.map((l) => {
        const u = usageMap[l.id] ?? { sessions: 0, costUsd: 0, lastDate: null };
        const cap = monthlyCapOf(l);
        const ratio = cap > 0 ? Math.min(u.sessions / cap, 1) : 0;
        const nearLimit = ratio >= 0.85;
        const selected = selectedId === l.id;
        return (
          <button key={l.id} type="button" onClick={() => onSelect(l)}
            aria-pressed={selected}
            className={`text-left rounded-xl border p-3 transition-colors ${
              selected ? 'border-blue-500 bg-blue-50/60 ring-1 ring-blue-200' : 'border-gray-200 bg-white hover:bg-gray-50'
            }`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-sm font-bold text-gray-900 truncate">{l.displayName || l.id.slice(0, 6)}</span>
              <span className="flex items-center gap-1 shrink-0">
                {!l.isActive && <span title="利用停止中"><PauseCircle className="w-4 h-4 text-gray-400" /></span>}
                {nearLimit && l.isActive && <span title="月次上限が近い"><AlertTriangle className="w-4 h-4 text-amber-500" /></span>}
              </span>
            </div>

            {/* 今月の使用率バー（上限に対して） */}
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full rounded-full ${nearLimit ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[11px] text-gray-500">
              <span className="tabular-nums">今月 {u.sessions}/{cap}回</span>
              <span className="tabular-nums text-gray-400">${u.costUsd.toFixed(2)}</span>
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {u.lastDate ? `最終 ${u.lastDate.slice(5)}` : '今月未利用'}
            </p>
          </button>
        );
      })}
    </div>
  );
};
