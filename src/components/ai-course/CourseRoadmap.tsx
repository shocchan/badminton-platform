// 12週間ロードマップ。各週カードをタップで展開し、その週の5章を表示。
// 鍵付きの週もタップ可＝テキスト予習を開ける（音声のみ未解放）。

import { useState } from 'react';
import { ArrowLeft, Lock, CheckCircle2, Circle, RotateCcw, PlayCircle, Star, Stethoscope, Target, BookOpen, ArrowRight, ChevronDown, ChevronRight } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { WeekStat } from '../../lib/aiLesson/course/courseStats';
import type { ItemProgress, Mission } from '../../lib/aiLesson/course/types';
import { COURSE_GOAL_CANDOS } from '../../lib/aiLesson/course/courseCanDo';
import { COURSE_MISSIONS } from '../../lib/aiLesson/course/courseData';
import { missionAccessState } from '../../lib/aiLesson/course/coursePreview';

interface Props {
  t: AiCourseDict;
  weeks: WeekStat[];
  currentWeek: number;
  nextMission: Mission | null;
  progress: ItemProgress[];
  estimate: { mode: 'diagnosing'; remaining: number } | { mode: 'ready'; minWeeks: number; maxWeeks: number };
  /** 全ての章のテキスト予習一覧を開く（補助導線） */
  onSeeChapters: () => void;
  /** 章（ミッション）のテキスト予習を開く */
  onOpenPreview: (mission: Mission) => void;
  /** N2文法トラック（準備中/レビュー）を開く */
  onSeeN2Grammar: () => void;
  onBack: () => void;
}

const stateIcon = (state: WeekStat['state']) => {
  switch (state) {
    case 'locked': return <Lock className="w-4 h-4 text-gray-300" />;
    case 'retained': return <Star className="w-4 h-4 text-amber-500" />;
    case 'reviewing': return <RotateCcw className="w-4 h-4 text-blue-500" />;
    case 'learned': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    case 'inProgress': return <PlayCircle className="w-4 h-4 text-blue-500" />;
    default: return <Circle className="w-4 h-4 text-gray-300" />;
  }
};

export const CourseRoadmap = ({ t, weeks, currentWeek, nextMission, progress, estimate, onSeeChapters, onOpenPreview, onSeeN2Grammar, onBack }: Props) => {
  const tr = t.roadmap;
  const tp = t.preview;
  const zh = t.locale === 'zh';
  const [expanded, setExpanded] = useState<Set<number>>(new Set([currentWeek]));
  const toggle = (wk: number) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(wk)) next.delete(wk); else next.add(wk);
    return next;
  });
  return (
    <div className="max-w-md lg:max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <button type="button" onClick={onBack} aria-label={tr.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-gray-900">{tr.title}</h1>
      </div>

      {/* 全ての章をテキスト予習（鍵付き章も閲覧可） */}
      <button type="button" onClick={onSeeChapters}
        className="w-full text-left bg-white rounded-xl border border-blue-100 p-4 mb-4 hover:bg-blue-50 transition-colors flex items-center gap-2.5">
        <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{t.preview.allChaptersTitle}</p>
          <p className="text-[11px] text-gray-400 truncate">{t.preview.open} ・ {t.preview.anytime}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
      </button>

      {/* N2文法トラック（準備中・レビュー） */}
      <button type="button" onClick={onSeeN2Grammar}
        className="w-full text-left bg-white rounded-xl border border-indigo-100 p-4 mb-4 hover:bg-indigo-50 transition-colors flex items-center gap-2.5">
        <BookOpen className="w-4 h-4 text-indigo-600 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900">{t.n2grammar.navTitle}</p>
          <p className="text-[11px] text-gray-400 truncate">{t.n2grammar.subtitle}</p>
        </div>
        <ArrowRight className="w-3.5 h-3.5 text-gray-300 shrink-0" />
      </button>

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
          const isOpen = expanded.has(w.week);
          const locked = w.state === 'locked';
          const missions = COURSE_MISSIONS.filter((m) => m.week === w.week).sort((a, b) => a.order - b.order);
          return (
            <div key={w.week}
              className={`rounded-xl border overflow-hidden ${isCurrent ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'}`}>
              {/* 週カード全体をタップ＝展開（鍵付きでも押せる） */}
              <button type="button" onClick={() => toggle(w.week)} aria-expanded={isOpen}
                className="w-full text-left p-3 flex items-start gap-2 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-xl transition-colors">
                <span className="mt-0.5 shrink-0">{stateIcon(w.state)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-gray-900 truncate">
                    Week {w.week} ・ {zh ? w.themeZh : w.themeJa}
                    {isCurrent && <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-600 text-white align-middle">{tr.current}</span>}
                  </p>
                  {/* 閲覧可能だと分かる明示文言＋（鍵付きは）音声未解放の意味 */}
                  <p className="text-[11px] text-blue-600 flex items-center gap-1 mt-0.5">
                    <BookOpen className="w-3 h-3 shrink-0" />{tp.tapToPreview}
                  </p>
                  {locked && (
                    <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                      <Lock className="w-3 h-3 shrink-0" />{tp.voiceLockedShort}
                    </p>
                  )}
                  {!locked && w.state !== 'notStarted' && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-gray-500">
                      <span>{tr.done(w.learned, w.total)}</span>
                      <span>{tr.retained(w.retained)}</span>
                      {w.reviewing > 0 && <span>{tr.reviewWaiting(w.reviewing)}</span>}
                    </div>
                  )}
                </div>
                <span className="shrink-0 self-center text-gray-400">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </span>
              </button>

              {/* 展開: この週の5章。各章をタップで予習ページへ（未解放でも閲覧可） */}
              {isOpen && (
                <div className="px-3 pb-3 pt-0">
                  <p className="text-[11px] font-medium text-gray-400 mb-1.5">{tp.weekMissions}</p>
                  <div className="space-y-1.5">
                    {missions.map((m) => {
                      const access = missionAccessState(m, progress);
                      return (
                        <button key={m.id} type="button" onClick={() => onOpenPreview(m)}
                          className="w-full text-left bg-gray-50 hover:bg-blue-50 rounded-lg p-2.5 flex items-center gap-2.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 transition-colors">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                            access === 'locked' ? 'bg-gray-200' : access === 'completed' ? 'bg-emerald-100' : 'bg-blue-100'}`}>
                            {access === 'locked' ? <Lock className="w-3 h-3 text-gray-500" />
                              : access === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                : <PlayCircle className="w-3.5 h-3.5 text-blue-600" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-gray-900 truncate">{zh ? m.titleZh : m.titleJa}</span>
                            <span className="block text-[11px] text-gray-400 truncate">{m.targetExpression}</span>
                          </span>
                          <span className="text-[11px] text-blue-600 font-medium flex items-center gap-0.5 shrink-0">
                            <BookOpen className="w-3.5 h-3.5" /><ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  {w.weakLabels.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {w.weakLabels.slice(0, 3).map((l) => (
                        <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">{tr.weakExpr}: {l}</span>
                      ))}
                    </div>
                  )}
                  {isCurrent && nextMission && (
                    <p className="text-[11px] text-blue-700 mt-2">{tr.nextMission}: {nextMission.targetExpression}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
