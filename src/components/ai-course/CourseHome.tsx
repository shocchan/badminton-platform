// 学習ホーム（§20・UX改訂）。開いた瞬間に「今日やること・何分・始める」が分かる構成。
// 主役=今日の学習カード（CTA内蔵）。補助=前回の続き・今日の復習。詳細は右カラム/下部へ。

import { Mic, PenLine, Flame, Sparkles, RefreshCw, MapPin, TrendingUp, ArrowRight, CheckCircle2, BookOpen } from 'lucide-react';
import { GrowthJourneyMap } from './GrowthJourneyMap';
import { ShokoAvatar } from './ShokoAvatar';
import { isReviewKind } from '../../lib/aiLesson/course/courseEngine';
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
  /** 別端末で進行中のレッスン（エラーではなく復旧選択肢を出す・§B） */
  recovery?: { mode: 'voice' | 'text' } | null;
  onResumeActive?: () => void;
  onDiscardActive?: () => void;
  onCancelRecovery?: () => void;
  onStart: (mode: 'voice' | 'text') => void;
  onResume: () => void;
  onDiscardResume: () => void;
  onSeeGrowth: () => void;
  onSeePastNotes: () => void;
  /** 今日の章をテキストで予習（音声前の確認・APIなし） */
  onPreview: () => void;
}

export const CourseHome = ({
  t, learner, plan, stats, reviewsDue, reviewsOverdue, remainingToday,
  hasResume, starting, startError, currentStageLabel, thisWeekCanDos, nextAbility, journey,
  recovery = null, onResumeActive, onDiscardActive, onCancelRecovery,
  onStart, onResume, onDiscardResume, onSeeGrowth, onSeePastNotes, onPreview,
}: Props) => {
  const th = t.home; const tg = t.growth;
  const zh = t.locale === 'zh';
  const mission = plan?.main.mission ?? null;
  const isReview = !!plan && isReviewKind(plan.main.kind);
  const badge = plan?.main.kind === 'new' ? th.newBadge
    : plan?.main.kind === 'weekly_practice' ? th.weeklyBadge
      : th.reviewBadge;
  const canLearn = remainingToday > 0 && learner.isActive;

  return (
    <div className="max-w-md lg:max-w-5xl mx-auto px-4 py-6">
      {/* 先生の一言（あいさつ＋今日の行動案内。1〜2文だけ） */}
      <div className="flex items-center gap-2.5 mb-4">
        <ShokoAvatar size={40} className="shrink-0" />
        <div className="min-w-0">
          <h1 className="text-base lg:text-lg font-bold text-gray-900 leading-tight">{th.greeting(learner.displayName)}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{isReview ? th.coachLineReview : th.coachLineNew}</p>
        </div>
      </div>

      {/* 別端末で進行中のレッスン → 復旧選択肢（警告色・データは消えていない・主CTA=再開） */}
      {recovery && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4" role="status">
          <p className="text-sm font-bold text-amber-900 mb-1">{th.activeElsewhereTitle}</p>
          <p className="text-xs text-amber-800 leading-relaxed mb-3">{th.activeElsewhereBody}</p>
          <div className="space-y-2">
            <button type="button" onClick={onResumeActive} disabled={starting}
              className="w-full min-h-11 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50">
              <RefreshCw className="w-4 h-4" />{th.activeResumeHere}
            </button>
            <button type="button" onClick={onDiscardActive} disabled={starting}
              className="w-full min-h-11 py-2.5 bg-white border border-amber-300 text-amber-800 text-sm font-medium rounded-xl disabled:opacity-50">
              {th.activeStartNew}
            </button>
            <button type="button" onClick={onCancelRecovery}
              className="w-full min-h-9 py-1.5 text-xs text-gray-500 hover:text-gray-700">
              {th.activeCancel}
            </button>
          </div>
        </div>
      )}

      {/* 中断・再開（あれば最優先の補助導線） */}
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

      {/* PC は 左（今日の学習）／右（成長・記録）の2カラム */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <div className="lg:space-y-4 lg:[&>*]:mb-0">

      {/* ── 今日の学習カード（主役・CTA内蔵。今日やること＋何分＋始める） ── */}
      <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-sm p-5 text-white mb-4">
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
            <p className="text-xs text-blue-100 mt-1">{th.minutes(mission.estimatedMinutes)}</p>
          </>
        ) : (
          <p className="text-sm text-blue-100">{t.common.loading}</p>
        )}
        {/* 主CTA（カード内。視線移動ゼロで開始） */}
        {canLearn ? (
          <>
            <button type="button" onClick={() => onStart('voice')} disabled={starting || !mission}
              className="w-full min-h-11 py-3.5 mt-4 rounded-xl bg-white text-blue-700 font-bold text-base flex items-center justify-center gap-2 hover:bg-blue-50 disabled:opacity-50 transition-colors">
              <Mic className="w-5 h-5" />{starting ? t.common.loading : (isReview ? th.startReview : th.startLesson)}
            </button>
            <p className="text-[11px] text-blue-200 text-center mt-2">{th.remainingToday(remainingToday)}</p>
          </>
        ) : (
          <div className="bg-white/15 rounded-xl p-3 text-center mt-4">
            <p className="text-sm text-blue-50 font-medium">
              {learner.isActive ? th.limitReached : t.limits.learner_suspended}
            </p>
          </div>
        )}
      </div>
      {startError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{startError}</p>}

      {/* 補助導線: テキストで話す・予習（小さく1行ずつ） */}
      {canLearn && (
        <button type="button" onClick={() => onStart('text')} disabled={starting || !mission}
          className="w-full min-h-11 py-2 -mt-1 mb-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
          <PenLine className="w-3.5 h-3.5" />{th.modeText}
        </button>
      )}
      <button type="button" onClick={onPreview}
        className="w-full min-h-11 py-2 mb-3 text-sm text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5">
        <BookOpen className="w-4 h-4" />{t.preview.open}
      </button>

      {/* 今日の復習（あるときだけ・1行で件数と入口） */}
      {reviewsDue > 0 && (
        <button type="button" onClick={onSeePastNotes}
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 hover:bg-amber-100 transition-colors flex items-center gap-2.5">
          <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm font-bold text-amber-900 flex-1 min-w-0">{th.reviewsDue(reviewsDue)}</span>
          <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
        </button>
      )}

      {/* 現在地（補助情報へ降格・1行） */}
      <div className="flex items-center gap-2 px-1 mb-4 text-xs text-gray-500">
        <MapPin className="w-3.5 h-3.5 text-blue-500 shrink-0" />
        <span className="min-w-0 truncate">{tg.currentLevelLabel}: <span className="font-medium text-gray-700">{currentStageLabel}</span> ・ Week {learner.currentWeek}/12</span>
      </div>

      </div>{/* /左カラム */}
      <div className="lg:space-y-3 lg:[&>*]:mb-0">

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

      {/* 過去の復習ノート（音声なしで見返す・Feature 5） */}
      <button type="button" onClick={onSeePastNotes}
        className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 mb-4 hover:bg-gray-50 transition-colors flex items-center gap-2.5">
        <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-sm font-medium text-gray-800 flex-1 min-w-0">{t.reviewNote.seeAll}</span>
        <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
      </button>

      {/* 補助情報（連続日数など。主役にしない・§22） */}
      <div className="flex items-center justify-center lg:justify-start gap-4 text-xs text-gray-400 mt-4 lg:mt-0">
        <span className="flex items-center gap-1"><Flame className="w-3.5 h-3.5 text-orange-400" />{th.streakValue(stats.streak)}</span>
        <span>{th.thisWeekValue(stats.weekSessions, learner.settings.weeklyTarget)}</span>
        {reviewsOverdue > 0 && <span className="text-red-500">{th.reviewsOverdue(reviewsOverdue)}</span>}
      </div>

      </div>{/* /右カラム */}
      </div>{/* /2カラムグリッド */}
      {/* コース説明文（positioning）は設定画面に集約（学習ホームでは繰り返さない） */}
    </div>
  );
};
