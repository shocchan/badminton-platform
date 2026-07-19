// 学習ホーム。1つのおすすめミッションを大きく出し、迷わせない。

import { Flag, Mic, PenLine, Map, History, Settings, Flame, CalendarCheck, Sparkles, RefreshCw } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { Learner, LessonPlan } from '../../lib/aiLesson/course/types';
import type { LearnerStats } from '../../lib/aiLesson/course/courseStats';

interface Props {
  t: AiCourseDict;
  learner: Learner;
  plan: LessonPlan | null;
  stats: LearnerStats;
  reviewsDue: number;
  reviewsOverdue: number;
  remainingToday: number;
  hasResume: boolean;
  onStart: (mode: 'voice' | 'text') => void;
  onResume: () => void;
  onDiscardResume: () => void;
  onRoadmap: () => void;
  onHistory: () => void;
  onSettings: () => void;
}

export const CourseHome = ({
  t, learner, plan, stats, reviewsDue, reviewsOverdue, remainingToday,
  hasResume, onStart, onResume, onDiscardResume, onRoadmap, onHistory, onSettings,
}: Props) => {
  const th = t.home;
  const mission = plan?.main.mission ?? null;
  const isReview = plan?.main.kind !== 'new' && plan?.main.kind !== undefined;
  const badge = plan?.main.kind === 'new' ? th.newBadge : plan?.main.kind === 'weekly' ? th.weeklyBadge : th.reviewBadge;
  const canLearn = remainingToday > 0 && learner.isActive;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-bold text-gray-900">{th.greeting(learner.displayName)}</h1>
        <button type="button" onClick={onSettings} aria-label={th.settings}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-400 hover:text-gray-600">
          <Settings className="w-5 h-5" />
        </button>
      </div>

      {/* 中断・再開 */}
      {hasResume && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-amber-800 font-medium mb-2">{th.resumeTitle}</p>
          <div className="flex gap-2">
            <button type="button" onClick={onResume}
              className="flex-1 min-h-11 py-2 bg-amber-500 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1">
              <RefreshCw className="w-4 h-4" />{th.resumeYes}
            </button>
            <button type="button" onClick={onDiscardResume}
              className="min-h-11 px-3 py-2 text-amber-700 text-sm rounded-lg border border-amber-300">
              {th.resumeNo}
            </button>
          </div>
        </div>
      )}

      {/* 今日のおすすめミッション（大きく） */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-sm p-5 text-white mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-blue-100 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />{th.todayMission}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isReview ? 'bg-amber-400 text-amber-900' : 'bg-white/20 text-white'}`}>{badge}</span>
        </div>
        {mission ? (
          <>
            <p className="font-bold text-lg leading-snug">{t.locale === 'zh' ? mission.titleZh : mission.titleJa}</p>
            {!plan?.main.hideTarget && (
              <p className="text-sm text-blue-100 mt-1">{th.todayTarget}: {mission.targetExpression}</p>
            )}
            <p className="text-xs text-blue-100 mt-1">{th.minutes(mission.estimatedMinutes)} ・ Week {mission.week}</p>
          </>
        ) : (
          <p className="text-sm text-blue-100">{t.common.loading}</p>
        )}
      </div>

      {/* 話し方選択＋開始 */}
      {canLearn ? (
        <div className="mb-5">
          <p className="text-xs text-gray-500 mb-2">{th.chooseMode}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => onStart('voice')}
              className="min-h-11 py-4 rounded-xl bg-blue-600 text-white font-bold flex flex-col items-center gap-1 hover:bg-blue-700 transition-colors">
              <Mic className="w-5 h-5" />{th.modeVoice}
            </button>
            <button type="button" onClick={() => onStart('text')}
              className="min-h-11 py-4 rounded-xl bg-white border border-gray-300 text-gray-700 font-bold flex flex-col items-center gap-1 hover:bg-gray-50 transition-colors">
              <PenLine className="w-5 h-5" />{th.modeText}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-gray-100 rounded-xl p-4 text-center mb-5">
          <p className="text-sm text-gray-600 font-medium">{th.limitReached}</p>
        </div>
      )}

      {/* サマリー */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Stat icon={<CalendarCheck className="w-4 h-4 text-emerald-600" />} label={th.thisWeek} value={th.thisWeekValue(stats.weekSessions, learner.settings.weeklyTarget)} />
        <Stat icon={<Flame className="w-4 h-4 text-orange-500" />} label={th.streak} value={th.streakValue(stats.streak)} />
        <Stat icon={<Flag className="w-4 h-4 text-blue-600" />} label={th.currentStage} value={th.stageValue(learner.currentWeek)} />
        <Stat icon={<CalendarCheck className="w-4 h-4 text-violet-600" />} label={th.nextCheckpoint}
          value={reviewsOverdue > 0 ? th.reviewsOverdue(reviewsOverdue) : reviewsDue > 0 ? th.reviewsDue(reviewsDue) : th.noReviews} />
      </div>
      {canLearn && <p className="text-xs text-gray-400 text-center mb-4">{th.remainingToday(remainingToday)}</p>}

      {/* ナビ */}
      <div className="space-y-2">
        <NavBtn icon={<Map className="w-4 h-4" />} label={th.seeRoadmap} onClick={onRoadmap} />
        <NavBtn icon={<History className="w-4 h-4" />} label={th.seeHistory} onClick={onHistory} />
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed mt-5">{t.positioning}</p>
    </div>
  );
};

const Stat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-3">
    <p className="text-[11px] text-gray-500 flex items-center gap-1">{icon}{label}</p>
    <p className="font-bold text-gray-900 text-sm mt-0.5">{value}</p>
  </div>
);

const NavBtn = ({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) => (
  <button type="button" onClick={onClick}
    className="w-full min-h-11 py-3 px-4 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center gap-2">
    {icon}{label}
  </button>
);
