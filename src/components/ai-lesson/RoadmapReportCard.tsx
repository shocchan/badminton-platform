// レッスン終了後レポートの「今日の進捗」カード（12-6）
// 表示データは AiLessonDemoPage 側で計算済みのものを受け取るだけ（このUIは計算しない）

import { Map, ArrowRight } from 'lucide-react';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { MissionEstimate } from '../../lib/aiLesson/roadmapTypes';

/** レポート表示用に整形済みの進捗データ（AiLessonDemoPage が組み立てる） */
export interface RoadmapReportData {
  /** 今日進んだ項目（ロードマップ未収載の表現なら null） */
  itemLabel: string | null;
  categoryLabel: string | null;
  categoryDone: number;
  categoryTotal: number;
  domainLabel: string;
  domainDone: number;
  domainTotal: number;
  /** 全体進捗の変化（表示用に小数1桁の文字列。例 '18.0' → '18.6'） */
  overallBeforePct: string;
  overallAfterPct: string;
  remaining: MissionEstimate;
  nextLabel: string | null;
}

interface Props {
  t: AiLessonDict;
  data: RoadmapReportData;
}

export const RoadmapReportCard = ({ t, data }: Props) => {
  const tr = t.roadmap;
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-3">
        <Map className="w-4 h-4 text-blue-600" />
        {tr.todayProgress}
      </p>

      <div className="space-y-2.5">
        {data.itemLabel && data.categoryLabel && (
          <div className="flex justify-between items-center text-sm">
            <div className="min-w-0">
              <p className="font-bold text-gray-900 truncate">{data.categoryLabel}</p>
              <p className="text-xs text-gray-500 truncate">{data.itemLabel}</p>
            </div>
            <span className="font-bold text-blue-700 tabular-nums shrink-0 ml-2">
              {tr.categoryDone(data.categoryDone, data.categoryTotal)}
            </span>
          </div>
        )}

        <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100">
          <span className="text-gray-700">{data.domainLabel}</span>
          <span className="font-bold text-gray-900 tabular-nums">{tr.categoryDone(data.domainDone, data.domainTotal)}</span>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-700">{tr.overallLabel}</span>
          <span className="font-bold text-emerald-600 tabular-nums">
            {tr.percentChange(data.overallBeforePct, data.overallAfterPct)}
          </span>
        </div>

        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-700">{tr.estimatedRemaining}</span>
          <span className="font-bold text-gray-900 tabular-nums">{tr.missionsRange(data.remaining.min, data.remaining.max)}</span>
        </div>

        {data.nextLabel && (
          <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between gap-2 mt-1">
            <div className="min-w-0">
              <p className="text-[11px] text-blue-700">{tr.nextExpression}</p>
              <p className="font-bold text-gray-900 truncate">{data.nextLabel}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-blue-600 shrink-0" />
          </div>
        )}
      </div>

      <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">{tr.masteryNote}</p>
    </div>
  );
};
