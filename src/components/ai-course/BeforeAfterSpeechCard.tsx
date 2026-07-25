// Before / After（§17）。実際の生徒発話だけを並べる。捏造しない。
// データが足りないときは比較を出さず「分析中」を表示する。

import { ArrowDown, ArrowRight } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { BeforeAfter } from '../../lib/aiLesson/course/courseBeforeAfter';

interface Props {
  t: AiCourseDict;
  data: BeforeAfter | null;
  /** あと何回で表示できるか（データ不足時） */
  sessionsUntilReady?: number;
}

const dateLabel = (iso: string) => iso.slice(0, 10);

export const BeforeAfterSpeechCard = ({ t, data, sessionsUntilReady }: Props) => {
  const tg = t.growth;
  if (!data) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 text-center">
        <p className="text-sm text-gray-500">{tg.beforeAfterInsufficient}</p>
        {sessionsUntilReady && sessionsUntilReady > 0 && (
          <p className="text-xs text-gray-400 mt-1">{tg.analyzingCount(sessionsUntilReady)}</p>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {/* スマホは上下、PCは左右で比較（実発話原文が読める幅を確保） */}
      <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
        <div className="bg-gray-50 rounded-xl p-3 lg:flex-1">
          <p className="text-[11px] text-gray-400 mb-1">{tg.beforeLabel} ・ {dateLabel(data.before.dateISO)}</p>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap break-words">「{data.before.transcript}」</p>
        </div>
        <div className="flex justify-center items-center shrink-0">
          <ArrowDown className="w-4 h-4 text-emerald-500 lg:hidden" />
          <ArrowRight className="w-4 h-4 text-emerald-500 hidden lg:block" />
        </div>
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 lg:flex-1">
          <p className="text-[11px] text-emerald-600 mb-1">
            {tg.afterLabel} ・ {dateLabel(data.after.dateISO)}
            {data.after.usedIndependently && ` ・ ${tg.selfUsed}`}
          </p>
          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words font-medium">「{data.after.transcript}」</p>
        </div>
      </div>
      <p className="text-[11px] text-gray-400 leading-relaxed">{tg.beforeAfterNote}</p>
    </div>
  );
};
