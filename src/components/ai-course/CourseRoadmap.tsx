// 12週間ロードマップ。各週の状態・完了/定着/復習待ち・苦手・次のミッションを表示。

import { ArrowLeft, Lock, CheckCircle2, Circle, RotateCcw, PlayCircle, Star, Stethoscope, Target } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { WeekStat } from '../../lib/aiLesson/course/courseStats';
import type { Mission } from '../../lib/aiLesson/course/types';
import { COURSE_GOAL_CANDOS } from '../../lib/aiLesson/course/courseCanDo';

interface Props {
  t: AiCourseDict;
  weeks: WeekStat[];
  currentWeek: number;
  nextMission: Mission | null;
  estimate: { mode: 'diagnosing'; remaining: number } | { mode: 'ready'; minWeeks: number; maxWeeks: number };
  onBack: () => void;
}

const stateIcon = (state: WeekStat['state']) => {
  switch (state) {
    case 'locked': return <Lock className="w-4 h-4 text-gray-300" />;
    case 'retained': return <Star className="w-4 h-4 text-amber-500" />;
    case 'reviewing': return <RotateCcw className="w-4 h-4 text-violet-500" />;
    case 'learned': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'inProgress': return <PlayCircle className="w-4 h-4 text-blue-500" />;
    default: return <Circle className="w-4 h-4 text-gray-300" />;
  }
};

export const CourseRoadmap = ({ t, weeks, currentWeek, nextMission, estimate, onBack }: Props) => {
  const tr = t.roadmap;
  return (
    <div className="max-w-md lg:max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={tr.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{tr.title}</h1>
      </div>

      {/* 12週後に目指す会話（§24。断定しない） */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-2">
          <Target className="w-4 h-4 text-amber-500" />{t.growth.goalTitle}
        </p>
        <ul className="space-y-1">
          {COURSE_GOAL_CANDOS.slice(0, 4).map((g, i) => (
            <li key={i} className="text-xs text-gray-700 flex items-start gap-1.5"><span className="text-amber-400">◇</span>{t.locale === 'zh' ? g.zh : g.ja}</li>
          ))}
        </ul>
        <p className="text-[11px] text-gray-400 mt-2 leading-relaxed">{t.growth.goalNote}</p>
      </div>

      {/* 推定修了（診断中 or 週数レンジ） */}
      <div className="bg-blue-50 rounded-xl p-4 mb-4">
        <p className="text-xs text-blue-700">{tr.estimatedCompletion}</p>
        {estimate.mode === 'diagnosing' ? (
          <p className="font-bold text-gray-900 flex items-center gap-1.5">
            <Stethoscope className="w-4 h-4 text-blue-600" />
            {tr.diagnosing.replace('{n}', String(estimate.remaining))}
          </p>
        ) : (
          <p className="font-bold text-gray-900 text-lg">{tr.completionValue(estimate.minWeeks, estimate.maxWeeks)}</p>
        )}
      </div>

      <div className="space-y-2">
        {weeks.map((w) => {
          const isCurrent = w.week === currentWeek;
          return (
            <div key={w.week}
              className={`rounded-xl border p-3 ${isCurrent ? 'border-blue-400 bg-blue-50/50' : w.state === 'locked' ? 'border-gray-100 bg-gray-50 opacity-70' : 'border-gray-200 bg-white'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  {stateIcon(w.state)}
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">
                      Week {w.week}
                      {isCurrent && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white">{tr.current}</span>}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{t.locale === 'zh' ? w.themeZh : w.themeJa}</p>
                  </div>
                </div>
                <span className="text-[11px] text-gray-500 shrink-0">{tr.weekStates[w.state]}</span>
              </div>
              {w.state !== 'locked' && w.state !== 'notStarted' && (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 text-[11px] text-gray-500">
                  <span>{tr.done(w.learned, w.total)}</span>
                  <span>{tr.retained(w.retained)}</span>
                  {w.reviewing > 0 && <span>{tr.reviewWaiting(w.reviewing)}</span>}
                </div>
              )}
              {w.weakLabels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {w.weakLabels.slice(0, 3).map((l) => (
                    <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{tr.weakExpr}: {l}</span>
                  ))}
                </div>
              )}
              {isCurrent && nextMission && (
                <p className="text-[11px] text-blue-700 mt-1.5">{tr.nextMission}: {nextMission.targetExpression}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
