// 学習ホーム（§20）。主役は「今日のレッスンを始める」＋「できるようになったこと」。
// 詳細な統計は出さず、成長は「成長を見る」から専用画面へ。

import { Mic, PenLine, Flame, Sparkles, RefreshCw, MapPin, TrendingUp, ArrowRight, CheckCircle2 } from 'lucide-react';
import { GrowthJourneyMap } from './GrowthJourneyMap';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { Learner, LessonPlan } from '../../lib/aiLesson/course/types';
import type { LearnerStats } from '../../lib/aiLesson/course/courseStats';
import type { AchievedCanDo } from '../../lib/aiLesson/course/courseCanDo';
import type { JourneyPlace } from '../../lib/aiLesson/course/courseJourney';

interface Props {
  t: AiCourseDict;
  learner: Learner;
  plan: LessonPlan | null;
  stats: LearnerStats;
  reviewsDue: number;
  reviewsOverdue: number;
  remainingToday: number;
  hasResume: boolean;
  starting: boolean;
  startError: string;
  // 成長系（§20）
  currentStageLabel: string;
  thisWeekCanDos: AchievedCanDo[];
  nextAbility: { id: string; ja: string; zh: string } | null;
  journey: JourneyPlace[];
  onStart: (mode: 'voice' | 'text') => void;
  onResume: () => void;
  onDiscardResume: () => void;
  onSeeGrowth: () => void;
}

export const CourseHome = ({
  t, learner, plan, stats, reviewsOverdue, remainingToday,
  hasResume, starting, startError, currentStageLabel, thisWeekCanDos, nextAbility, journey,
  onStart, onResume, onDiscardResume, onSeeGrowth,
}: Props) => {
  const th = t.home; const tg = t.growth;
  const zh = t.locale === 'zh';
  const mission = plan?.main.mission ?? null;
  const isReview = !!plan && (plan.main.kind.startsWith('review') || plan.main.kind === 'extra');
  const badge = plan?.main.kind === 'new' ? th.newBadge
    : plan?.main.kind === 'weekly_practice' ? th.weeklyBadge
      : th.reviewBadge;
  const canLearn = remainingToday > 0 && learner.isActive;

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-lg font-bold text-gray-900 mb-4">{th.greeting(learner.displayName)}</h1>

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

      {/* 現在地カード（Week番号より「今どんな力をつける段階か」） */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <MapPin className="w-4 h-4 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500">{tg.currentLocation} ・ Week {learner.currentWeek}</p>
          <p className="text-sm font-bold text-gray-900 truncate">{currentStageLabel}</p>
        </div>
      </div>

      {/* 今日のおすすめミッション */}
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-sm p-5 text-white mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-blue-100 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" />{th.todayMission}</span>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isReview ? 'bg-amber-400 text-amber-900' : 'bg-white/20 text-white'}`}>{badge}</span>
        </div>
        {mission ? (
          <>
            <p className="font-bold text-lg leading-snug">{zh ? mission.titleZh : mission.titleJa}</p>
            {!plan?.main.hideTarget && (
              <p className="text-sm text-blue-100 mt-1">{th.todayTarget}: {mission.targetExpression}</p>
            )}
            <p className="text-xs text-blue-100 mt-1">{th.minutes(mission.estimatedMinutes)} ・ Week {mission.week}</p>
          </>
        ) : (
          <p className="text-sm text-blue-100">{t.common.loading}</p>
        )}
      </div>

      {/* 開始（主要CTAは1つ） */}
      {canLearn ? (
        <div className="mb-5">
          <button type="button" onClick={() => onStart('voice')} disabled={starting || !mission}
            className="w-full min-h-11 py-4 rounded-xl bg-blue-600 text-white font-bold text-base flex items-center justify-center gap-2 hover:bg-blue-700 disabled:opacity-50 transition-colors">
            <Mic className="w-5 h-5" />{starting ? t.common.loading : th.startLesson}
          </button>
          <button type="button" onClick={() => onStart('text')} disabled={starting || !mission}
            className="w-full min-h-11 py-2 mt-2 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
            <PenLine className="w-3.5 h-3.5" />{th.modeText}
          </button>
          {startError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mt-2">{startError}</p>}
          <p className="text-xs text-gray-400 text-center mt-2">{th.remainingToday(remainingToday)}</p>
        </div>
      ) : (
        <div className="bg-gray-100 rounded-xl p-4 text-center mb-5">
          <p className="text-sm text-gray-600 font-medium">
            {learner.isActive ? th.limitReached : t.limits.learner_suspended}
          </p>
        </div>
      )}

      {/* 今週できるようになったこと（最大3） */}
      {thisWeekCanDos.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />{tg.thisWeekCanDo}
          </p>
          <ul className="space-y-1.5">
            {thisWeekCanDos.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span className="text-sm text-gray-800 leading-snug">{zh ? c.zh : c.ja}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 次にできるようになること */}
      {nextAbility && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3 flex items-center gap-2.5">
          <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">{tg.nextAbilityTitle}</p>
            <p className="text-sm font-medium text-gray-800 truncate">{zh ? nextAbility.zh : nextAbility.ja}</p>
          </div>
        </div>
      )}

      {/* 小さな旅マップ＋成長を見る */}
      <button type="button" onClick={onSeeGrowth}
        className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 mb-4 hover:bg-gray-50 transition-colors">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-blue-600" />{tg.journeyTitle}</p>
          <span className="text-xs text-blue-600 flex items-center gap-0.5">{tg.seeGrowth}<ArrowRight className="w-3 h-3" /></span>
        </div>
        <GrowthJourneyMap t={t} places={journey} currentWeek={learner.currentWeek} compact />
      </button>

      {/* 補助情報（連続日数など。主役にしない・§22） */}
      <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
        <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" />{th.streakValue(stats.streak)}</span>
        <span>{th.thisWeekValue(stats.weekSessions, learner.settings.weeklyTarget)}</span>
        {reviewsOverdue > 0 && <span className="text-red-500">{th.reviewsOverdue(reviewsOverdue)}</span>}
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed mt-5">{t.positioning}</p>
    </div>
  );
};
