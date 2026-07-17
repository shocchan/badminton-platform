// レッスン終了後レポートの「今日の進捗」カード
// 全体進捗率の微増ではなく「今日何ができるようになったか」を主役にする（14節）。
// 順番: 今日の表現 → カテゴリー → 公開中の進捗 → 今日の状態 → 次の復習 → 次のミッション → 全体は試算表示
// 表示データは AiLessonDemoPage 側で計算済みのものを受け取るだけ（このUIは計算しない）

import { Map, ArrowRight, CalendarDays, CheckCircle2 } from 'lucide-react';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { EstimateDisplay } from '../../lib/aiLesson/roadmapTypes';

/** レポート表示用に整形済みの進捗データ（AiLessonDemoPage が組み立てる） */
export interface RoadmapReportData {
  /** 今日進んだ項目（ロードマップ未収載の表現なら null） */
  itemLabel: string | null;
  categoryLabel: string | null;
  categoryDone: number;
  categoryTotal: number;
  /** 公開中ミッション（実在項目のみの正式値） */
  publishedDone: number;
  publishedTotal: number;
  /** 今日の到達状態（self / hint / learned）。未収載表現なら null */
  todayUsage: 'self' | 'hint' | 'learned' | null;
  /** 次の復習日の表示文言（例: 明日） */
  nextReviewLabel: string;
  nextLabel: string | null;
  /** 全体の推定状態（診断中 or 週1更新の確定値） */
  estimate: EstimateDisplay;
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
        {/* 1-3. 今日の表現・カテゴリー・公開中進捗 */}
        {data.itemLabel && data.categoryLabel && (
          <div>
            <p className="font-bold text-gray-900 text-lg">{data.itemLabel}</p>
            <div className="flex justify-between items-center text-sm mt-1">
              <span className="text-gray-600">{data.categoryLabel}</span>
              <span className="font-bold text-blue-700 tabular-nums">
                {tr.categoryDone(data.categoryDone, data.categoryTotal)}
              </span>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100">
          <span className="text-gray-600">{tr.publishedMissions}</span>
          <span className="font-bold text-gray-900 tabular-nums">{tr.categoryDone(data.publishedDone, data.publishedTotal)}</span>
        </div>

        {/* 4. 今日の状態 */}
        {data.todayUsage && (
          <div className="bg-emerald-50 rounded-xl p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-emerald-700">{tr.todayState}</p>
              <p className="font-bold text-gray-900 text-sm">{tr.usageLabels[data.todayUsage]}</p>
            </div>
          </div>
        )}

        {/* 5. 次の復習 */}
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-600 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
            {tr.nextReview}
          </span>
          <span className="font-bold text-gray-900">{data.nextReviewLabel}</span>
        </div>

        {/* 6. 次のおすすめミッション */}
        {data.nextLabel && (
          <div className="bg-blue-50 rounded-xl p-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] text-blue-700">{tr.nextExpression}</p>
              <p className="font-bold text-gray-900 truncate">{data.nextLabel}</p>
            </div>
            <ArrowRight className="w-4 h-4 text-blue-600 shrink-0" />
          </div>
        )}

        {/* 7. 全体ロードマップは試算表示（診断中 or 範囲）。%の微増を主役にしない */}
        <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100">
          <span className="text-gray-600">{tr.overallLabel}</span>
          <span className="text-gray-500 tabular-nums">
            {data.estimate.mode === 'diagnosing'
              ? tr.diagnosing
              : `${tr.estimatedRemaining} ${tr.missionsRange(data.estimate.min, data.estimate.max)}`}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 mt-3 leading-relaxed">{tr.masteryNote}</p>
    </div>
  );
};
