// わたしの表現／我的表达（§E-4 MVP）。既存 progress×mission の読み取り表示のみ。
// masteryState 8値を学習者向けCan-do文言へ変換（内部enumを露出しない・断定表現なし）。

import { ArrowLeft, BookOpen, CalendarDays, RefreshCw } from 'lucide-react';
import { missionById } from '../../lib/aiLesson/course/courseEngine';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { ItemProgress } from '../../lib/aiLesson/course/types';

interface Props {
  t: AiCourseDict;
  progress: ItemProgress[];
  practiceAgainIds: string[];
  onBack: () => void;
}

export const CourseMyExpressions = ({ t, progress, practiceAgainIds, onBack }: Props) => {
  const tb = t.bank;
  const zh = t.locale === 'zh';
  const rows = [...progress]
    .map((p) => ({ p, mission: missionById(p.itemId) }))
    .filter((r): r is { p: ItemProgress; mission: NonNullable<ReturnType<typeof missionById>> } => !!r.mission)
    .sort((a, b) => (b.p.lastPracticedAt ?? '').localeCompare(a.p.lastPracticedAt ?? ''));

  return (
    <div className="max-w-md lg:max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={t.roadmap.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700"><ArrowLeft className="w-5 h-5" /></button>
        <div>
          <h1 className="text-lg font-bold text-gray-900 leading-tight">{tb.title}</h1>
          <p className="text-[11px] text-gray-400">{tb.subtitle}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-12">
          <BookOpen className="w-8 h-8 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-gray-500">{tb.empty}</p>
        </div>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {rows.map(({ p, mission }) => (
            <div key={p.itemId} className="bg-white border border-gray-100 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-bold text-gray-900 leading-snug break-words">{mission.targetExpression}</p>
                <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                  {tb.canDo[p.masteryState] ?? tb.canDo.initial}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{mission.meaningZh}</p>
              <p className="text-[11px] text-gray-400 mt-1 truncate">{zh ? mission.titleZh : mission.titleJa}</p>
              <div className="flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-gray-400">
                {p.lastPracticedAt && <span>{tb.lastOn(p.lastPracticedAt.slice(0, 10))}</span>}
                {p.nextReviewAt && <span className="flex items-center gap-0.5"><CalendarDays className="w-3 h-3" />{tb.nextReviewOn(p.nextReviewAt)}</span>}
                {practiceAgainIds.includes(p.itemId) && (
                  <span className="flex items-center gap-0.5 text-amber-600"><RefreshCw className="w-3 h-3" />{tb.againBadge}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
