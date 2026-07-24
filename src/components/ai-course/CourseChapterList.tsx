// 全ての章（60ミッション）一覧。週ごとにまとめ、状態（未解放/今の章/学習済み）を表示。
// どの章もタップでテキスト予習を開ける（鍵付き章も閲覧可能）。

import { ArrowLeft, Lock, BookOpen, CheckCircle2, PlayCircle, ChevronRight } from 'lucide-react';
import { COURSE_MISSIONS, COURSE_WEEKS } from '../../lib/aiLesson/course/courseData';
import { missionAccessState } from '../../lib/aiLesson/course/coursePreview';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { ItemProgress, Mission } from '../../lib/aiLesson/course/types';

interface Props {
  t: AiCourseDict;
  progress: ItemProgress[];
  onOpenPreview: (mission: Mission) => void;
  onBack: () => void;
}

export const CourseChapterList = ({ t, progress, onOpenPreview, onBack }: Props) => {
  const tp = t.preview;
  const zh = t.locale === 'zh';
  return (
    <div className="max-w-md lg:max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-2">
        <button type="button" onClick={onBack} aria-label={tp.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{tp.allChaptersTitle}</h1>
      </div>
      <p className="text-xs text-gray-400 mb-4 pl-1">{tp.allChaptersHint}</p>

      <div className="space-y-5">
        {COURSE_WEEKS.map((w) => {
          const missions = COURSE_MISSIONS.filter((m) => m.week === w.week).sort((a, b) => a.order - b.order);
          if (missions.length === 0) return null;
          return (
            <div key={w.week}>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1.5 pl-1">
                Week {w.week} ・ {zh ? w.themeZh : w.themeJa}
              </p>
              <div className="space-y-1.5">
                {missions.map((m) => {
                  const access = missionAccessState(m, progress);
                  return (
                    <button key={m.id} type="button" onClick={() => onOpenPreview(m)}
                      className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 hover:bg-gray-50 hover:border-blue-100 transition-colors flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                        access === 'locked' ? 'bg-gray-100' : access === 'completed' ? 'bg-emerald-50' : 'bg-blue-50'}`}>
                        {access === 'locked' ? <Lock className="w-3.5 h-3.5 text-gray-400" />
                          : access === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            : <PlayCircle className="w-4 h-4 text-blue-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{zh ? m.titleZh : m.titleJa}</p>
                        <p className="text-[11px] text-gray-400 truncate">{m.targetExpression}</p>
                      </div>
                      <span className="text-[11px] text-blue-600 font-medium flex items-center gap-0.5 shrink-0">
                        <BookOpen className="w-3.5 h-3.5" /><ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
