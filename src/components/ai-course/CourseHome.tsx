// 学習ホーム（§20・UX改訂）。開いた瞬間に「今日やること・何分・始める」が分かる構成。
// 主役=今日の学習カード（CTA内蔵）。補助=前回の続き・今日の復習。詳細は右カラム/下部へ。

import { useEffect, useState } from 'react';
import { CourseLoading } from './CourseLoading';
import { Mic, PenLine, Flame, Sparkles, RefreshCw, MapPin, TrendingUp, ArrowRight, CheckCircle2, BookOpen, UserRound } from 'lucide-react';
import { GrowthJourneyMap } from './GrowthJourneyMap';
import { LearnerAvatar } from './LearnerAvatar';
import { usePrivateAvatarUrl } from '../../lib/aiLesson/course/usePrivateAvatarUrl';
import { deriveCourseMemories } from '../../lib/aiLesson/course/courseMemories';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { FOUNDATION_UNIT_META } from '../../lib/aiLesson/course/foundationRegistry';
import { createFoundationProgressRepository } from '../../lib/aiLesson/course/foundationProgress';
import { recommendToday } from '../../lib/aiLesson/course/foundationRecommend';
import type { LearnerSettings } from '../../lib/aiLesson/course/types';
import type { CourseSessionRecord } from '../../lib/aiLesson/course/types';
import { currentDisplayWeek, chapterOfInternalWeek } from '../../lib/aiLesson/course/courseWeekMapping';
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
  /** 今週の学習日数（回数ではなく日数・§E-2） */
  weekLearningDays: number;
  /** 軽め学習の材料があるか（進捗ゼロでは出さない・§E-3） */
  hasLightMaterial: boolean;
  remainingToday: number;
  hasResume: boolean;
  starting: boolean;
  startError: string;
  // 成長系（§20）
  currentStageLabel: string;
  thisWeekCanDos: AchievedCanDo[];
  nextAbility: { id: string; ja: string; zh: string } | null;
  journey: JourneyPlace[];
  /**
   * AI会話が運営都合で停止中（OpenAIのクレジット切れ）。
   * true のとき会話の入口だけを「アップデート中」に差し替える。
   * 予習・日本語のしくみ・語彙・ノートなどAIを使わない導線はそのまま残す（2026-08-23）。
   */
  aiPaused?: boolean;
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
  /** 軽め2〜3分学習（API不使用）を開く */
  onStartLight: () => void;
  /** 今日の章をテキストで予習（音声前の確認・APIなし） */
  onPreview: () => void;
  /** 最近の思い出→ノートへ（§PW-V1） */
  sessions: CourseSessionRecord[];
  onOpenNotebook: () => void;
  onOpenLab: (section?: 'today' | 'units' | 'records') => void;
  onOpenVocab: (view?: 'top' | 'daily' | 'quickreview') => void;
  /** アバター承認/作り直し（settings更新・§Avatar2） */
  onUpdateAvatarSettings: (patch: Partial<LearnerSettings>) => void;
  /**
   * 実時間制の体験（600円）で学習しているか（2026-08-26）。
   * 上限到達の案内が「明日また続けましょう」になっていたが、
   * 体験は開始から60分で切れるので明日は無い。残り時間でできることを言う。
   * 会話の開始上限側は 2026-08-20 に対応済みで、こちらはホーム表示側。
   */
  realtimeTrial?: boolean;
}

export const CourseHome = ({
  t, learner, plan, stats, reviewsDue, reviewsOverdue, remainingToday,
  weekLearningDays, hasLightMaterial,
  hasResume, starting, startError, currentStageLabel, thisWeekCanDos, nextAbility, journey,
  aiPaused = false,
  recovery = null, onResumeActive, onDiscardActive, onCancelRecovery,
  onStart, onResume, onDiscardResume, onSeeGrowth, onSeePastNotes, onPreview, onStartLight,
  sessions, onOpenNotebook, onUpdateAvatarSettings, onOpenLab, onOpenVocab,
  realtimeTrial = false,
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
      {/* 先生の一言（あいさつ＋今日の行動案内。途切れ後は「おかえりなさい」で責めない・§B-3） */}
      <div className="flex items-center gap-2.5 mb-4">
        {/* 本人が主人公: 承認済みアバター（signed URL・失敗時イニシャル）を先生より大きく（§PW-V1） */}
        <LearnerAvatar displayName={learner.displayName} size={72} decorative className="shrink-0 ring-4 ring-amber-100"
          imageSrc={usePrivateAvatarUrl(learner.settings.avatarReviewStatus === 'approved' ? learner.settings.avatarObjectPath : null)} />
        <div className="min-w-0">
          <h1 className="text-lg lg:text-xl font-bold text-gray-900 leading-tight">{th.profileTitle(learner.displayName)}</h1>
          <p className="text-[11px] text-gray-500 mt-0.5 truncate">{tg.currentLevelLabel}: {currentStageLabel} ・ {t.roadmap.weekOf24(currentDisplayWeek(learner.currentWeek, 0))}〜 ・ {t.roadmap.chapters[chapterOfInternalWeek(learner.currentWeek) - 1]?.title}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {stats.streak === 0 && stats.totalSessions > 0
              ? th.welcomeBack
              : isReview ? th.coachLineReview : th.coachLineNew}
          </p>
        </div>
      </div>

      {/* アバタープレビュー（pending時のみ・強制モーダル禁止・§Avatar2） */}
      {learner.settings.avatarReviewStatus === 'pending' && learner.settings.pendingAvatarObjectPath && (
        <AvatarReviewCard t={t} learner={learner} onUpdate={onUpdateAvatarSettings} />
      )}

      {/* 別端末で進行中のレッスン → 復旧選択肢（警告色・データは消えていない・主CTA=再開） */}
      {recovery && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4" role="status">
          <p className="text-sm font-bold text-amber-900 mb-1">{th.activeElsewhereTitle}</p>
          <p className="text-xs text-amber-800 leading-relaxed mb-3">{th.activeElsewhereBody}</p>
          <div className="space-y-2">
            <button type="button" onClick={onResumeActive} disabled={starting}
              className="w-full min-h-11 py-2.5 bg-amber-500 text-white text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 action-raised action-amber touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              <RefreshCw className="w-4 h-4" />{th.activeResumeHere}
            </button>
            <button type="button" onClick={onDiscardActive} disabled={starting}
              className="w-full min-h-11 py-2.5 bg-white border border-amber-300 text-amber-800 text-sm font-medium rounded-xl disabled:opacity-50 action-raised action-amber touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              {th.activeStartNew}
            </button>
            <button type="button" onClick={onCancelRecovery}
              className="w-full min-h-9 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
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
              className="flex-1 min-h-11 py-2 bg-amber-500 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1 action-raised action-amber touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              <RefreshCw className="w-4 h-4" />{th.resumeYes}
            </button>
            <button type="button" onClick={onDiscardResume}
              className="min-h-11 px-3 py-2 text-amber-700 text-sm rounded-lg border border-amber-300 action-raised action-amber touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              {th.resumeNo}
            </button>
          </div>
        </div>
      )}

      {/* PC は 左（今日の学習）／右（成長・記録）の2カラム */}
      <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-start">
      <div className="lg:space-y-4 lg:[&>*]:mb-0">

      {/* ── 今日の学習カード（主役・CTA内蔵。今日やること＋何分＋始める） ── */}
      {/* id: ヘッダーの「AI会話」ナビから直接ここへ来る（Phase 2E-1 §19の会話入口） */}
      <div id="ai-course-conversation-entry" className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-sm p-5 text-white mb-4 scroll-mt-32">
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
            <p className="text-xs text-blue-100 mt-1">
              {th.minutes(mission.estimatedMinutes)}
              {/* なぜ今日これなのか（決定的・reasonKey・不正キーはgenericへ・§E-1） */}
              <span className="block mt-0.5 text-blue-200">{(plan && th.planReasons[plan.reasonKey]) ?? th.planReasons.generic}</span>
            </p>
          </>
        ) : (
          <CourseLoading t={t} scene="step" minHeightClass="min-h-[40px]" textClass="text-blue-100" className="!py-2" />
        )}
        {/* 主CTA（カード内。視線移動ゼロで開始） */}
        {aiPaused ? (
          /* AI会話だけが止まっている。エラー色にせず「お知らせ」として置く */
          <div className="bg-white/15 rounded-xl p-3 text-center mt-4">
            <p className="text-sm text-white font-bold">{t.limits.ai_paused_title}</p>
            <p className="text-xs text-blue-100 mt-1 leading-relaxed">{t.limits.ai_paused_body}</p>
            <p className="text-[11px] text-blue-200 mt-1.5 leading-relaxed">{t.limits.ai_paused_other}</p>
          </div>
        ) : canLearn ? (
          <>
            <button type="button" onClick={() => onStart('voice')} disabled={starting || !mission}
              className="w-full min-h-11 py-3.5 mt-4 rounded-xl bg-white text-blue-700 font-bold text-base flex items-center justify-center gap-2 hover:bg-blue-50 disabled:opacity-50 transition-colors action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              <Mic className="w-5 h-5" />{starting ? t.common.loading : (isReview ? th.startReview : th.startLesson)}
            </button>
            <p className="text-[11px] text-blue-200 text-center mt-2">{th.remainingToday(remainingToday)}</p>
          </>
        ) : (
          <div className="bg-white/15 rounded-xl p-3 text-center mt-4">
            {learner.isActive ? (
              <>
                {/* 上限到達＝「完了」として前向きに（§B-4） */}
                <p className="text-sm text-white font-bold">
                  {realtimeTrial ? th.doneForNowTitle : th.doneForTodayTitle}
                </p>
                <p className="text-xs text-blue-100 mt-1">
                  {realtimeTrial ? th.limitReachedTrial : th.limitReached}
                </p>
              </>
            ) : (
              <p className="text-sm text-blue-50 font-medium">{t.limits.learner_suspended}</p>
            )}
          </div>
        )}
      </div>
      {startError && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mb-4">{startError}</p>}

      {/* 補助導線: テキストで話す・予習（小さく1行ずつ） */}
      {canLearn && !aiPaused && (
        <button type="button" onClick={() => onStart('text')} disabled={starting || !mission}
          className="w-full min-h-11 py-2 -mt-1 mb-1 text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          <PenLine className="w-3.5 h-3.5" />{th.modeText}
        </button>
      )}
      <button type="button" onClick={onPreview}
        className="w-full min-h-11 py-2 mb-1 text-sm text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1.5 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
        <BookOpen className="w-4 h-4" />{t.preview.open}
      </button>
      {/* 日本語のしくみ: AI会話と並ぶ主要学習メニュー（FOREST FIRST: 全learnerへ開放） */}
      <PlatformLearningMenu t={t} onOpenLab={onOpenLab} onOpenVocab={onOpenVocab}
        onStartConversation={() => onStart('voice')} canLearn={canLearn && !aiPaused}
        missionTitle={mission ? (zh ? mission.titleZh : mission.titleJa) : null} />


      {/* 軽め2〜3分（API不使用・会話しない日の入口・§E-3） */}
      {hasLightMaterial && (
        <button type="button" onClick={onStartLight}
          className="w-full min-h-11 py-2 mb-3 text-sm text-emerald-700 hover:text-emerald-800 flex items-center justify-center gap-1.5 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          <Sparkles className="w-4 h-4" />{th.lightStart}
          <span className="text-[11px] text-gray-400">{th.lightNote}</span>
        </button>
      )}

      {/* 今日の復習（あるときだけ・1行で件数と入口） */}
      {reviewsDue > 0 && (
        <button type="button" onClick={onSeePastNotes}
          className="w-full text-left bg-amber-50 border border-amber-200 rounded-xl p-3.5 mb-4 hover:bg-amber-100 transition-colors flex items-center gap-2.5 card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          <RefreshCw className="w-4 h-4 text-amber-600 shrink-0" />
          <span className="text-sm font-bold text-amber-900 flex-1 min-w-0">{th.reviewsDue(reviewsDue)}</span>
          <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
        </button>
      )}


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
        className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 mb-4 hover:bg-gray-50 transition-colors card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-gray-500 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-blue-600" />{tg.journeyTitle}</p>
          <span className="text-xs text-blue-600 flex items-center gap-0.5">{tg.seeGrowth}<ArrowRight className="w-3 h-3" /></span>
        </div>
        <GrowthJourneyMap t={t} places={journey} currentWeek={learner.currentWeek} compact />
      </button>

      {/* 過去の復習ノート（音声なしで見返す・Feature 5） */}
      <button type="button" onClick={onSeePastNotes}
        className="w-full text-left bg-white rounded-2xl border border-gray-100 p-4 mb-4 hover:bg-gray-50 transition-colors flex items-center gap-2.5 card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
        <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="text-sm font-medium text-gray-800 flex-1 min-w-0">{t.reviewNote.seeAll}</span>
        <ArrowRight className="w-3.5 h-3.5 text-gray-300" />
      </button>

      {/* 今週の学習リズム（日数ベース・責めない・比較なし・§E-2） */}
      {stats.totalSessions > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-3">
          <p className="text-xs font-medium text-gray-500 mb-1">{th.rhythmTitle}</p>
          <p className="text-sm font-bold text-gray-900">{th.rhythmDays(weekLearningDays)}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {weekLearningDays >= 3 ? th.rhythmGood : weekLearningDays >= 1 ? th.rhythmStart : th.rhythmFresh}
          </p>
        </div>
      )}

      {/* 最近の思い出（最新1件のみ・未達成非表示・§PW-V1） */}
      {(() => {
        const latest = deriveCourseMemories(sessions).slice(-1)[0];
        if (!latest) return null;
        return (
          <button type="button" onClick={() => { trackCourse('view_latest_memory'); onOpenNotebook(); }}
            className="w-full text-left bg-amber-50 border border-amber-100 rounded-2xl p-4 mb-3 hover:bg-amber-100 transition-colors card-interactive touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <p className="text-[11px] font-medium text-amber-700 mb-0.5">{t.memories.latestLabel}</p>
            <p className="text-sm font-bold text-gray-900">{t.memories.titles[latest.type]}</p>
            <p className="text-[11px] text-gray-500 mt-0.5 flex items-center justify-between">
              <time dateTime={latest.achievedAtISO}>{latest.achievedAtISO}</time>
              <span className="text-amber-700">{t.memories.sectionTitle} →</span>
            </p>
          </button>
        );
      })()}

      {/* 人間コーチの存在（静的文言＋メール窓口。主CTAより控えめ・§B-1） */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 mb-4">
        <p className="text-xs font-bold text-gray-700 flex items-center gap-1.5 mb-1">
          <UserRound className="w-3.5 h-3.5 text-emerald-600" />{th.coachCardTitle}
        </p>
        <p className="text-xs text-gray-500 leading-relaxed">{th.coachCardBody}</p>
        <a href={`mailto:${t.support.email}`} className="inline-block text-[11px] text-emerald-700 underline mt-1.5 select-all transition-colors active:bg-gray-100 rounded">{th.coachCardContact}</a>
      </div>

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


/** アバタープレビュー（承認/作り直し/あとで・二重操作防止・URL非ログ） */
const AvatarReviewCard = ({ t, learner, onUpdate }: {
  t: AiCourseDict; learner: Learner; onUpdate: (patch: Partial<LearnerSettings>) => void;
}) => {
  const ta = t.avatarReview;
  const [hidden, setHidden] = useState(false);   // あとで確認する（この画面のみ）
  const [busy, setBusy] = useState(false);
  const url = usePrivateAvatarUrl(learner.settings.pendingAvatarObjectPath ?? null);
  if (hidden) return null;
  const approve = () => {
    if (busy) return; setBusy(true);
    trackCourse('approve_ai_course_avatar');
    onUpdate({
      avatarObjectPath: learner.settings.pendingAvatarObjectPath,
      pendingAvatarObjectPath: undefined,
      avatarReviewStatus: 'approved',
      avatarUpdatedAt: new Date().toISOString(),
    });
  };
  const revise = () => {
    if (busy) return; setBusy(true);
    trackCourse('request_ai_course_avatar_revision');
    onUpdate({ avatarReviewStatus: 'revision_requested' });
  };
  return (
    <div className="bg-white border-2 border-amber-200 rounded-2xl p-4 mb-4">
      <p className="text-sm font-bold text-gray-900">{ta.title}</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">{ta.body}</p>
      <div className="flex justify-center mb-3">
        <LearnerAvatar displayName={learner.displayName} imageSrc={url} size={112} altSuffix={ta.altSuffix} />
      </div>
      <div className="space-y-2">
        <button type="button" onClick={approve} disabled={busy || !url}
          className="w-full min-h-11 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl disabled:opacity-50 action-raised action-primary-blue touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{ta.approve}</button>
        <button type="button" onClick={revise} disabled={busy}
          className="w-full min-h-11 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-xl disabled:opacity-50 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] disabled:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{ta.revise}</button>
        <button type="button" onClick={() => setHidden(true)}
          className="w-full min-h-9 py-1.5 text-xs text-gray-400 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{ta.later}</button>
      </div>
      {learner.settings.avatarReviewStatus === 'revision_requested' && (
        <p className="text-[11px] text-gray-500 mt-2">{ta.reviseHint}</p>
      )}
    </div>
  );
};

/**
 * 統合「今日の学習」ヒーロー＋3つの学習入口（Phase 2C+ §4-§5・labPreviewのみ）。
 * 第一CTAは状態から決定的に一つ: 復習期限→途中の文法→今日の会話→今日の3語→次の単元。
 * 3カードは色・アイコン・レイアウトで役割を区別（会話=対話／ことば=視覚記憶／しくみ=構造）。
 */
const PlatformLearningMenu = ({ t, onOpenLab, onOpenVocab, onStartConversation, canLearn, missionTitle }: {
  t: AiCourseDict;
  onOpenLab: (section?: 'today' | 'units' | 'records') => void;
  onOpenVocab: (view?: 'top' | 'daily' | 'quickreview') => void;
  onStartConversation: () => void;
  canLearn: boolean;
  missionTitle: string | null;
}) => {
  const tm = t.homeMenu; const tl = t.lab; const zh = t.locale === 'zh';
  // ことば/しくみの実進捗（canonical・端末保存のsessionStorage previewから読み取り専用で導出）
  const GUIDE_KEY = 'kawabado.aiCourse.v1.hubGuideClosed';
  const [guideOpen] = useState(() => { try { return localStorage.getItem(GUIDE_KEY) !== '1'; } catch { return true; } });
  const rememberGuideClosed = (open: boolean) => { try { if (open) localStorage.removeItem(GUIDE_KEY); else localStorage.setItem(GUIDE_KEY, '1'); } catch { /* private mode */ } };
  const labProgressLine = (() => {
    try {
      const repo = createFoundationProgressRepository(window.sessionStorage);
      const done = FOUNDATION_UNIT_META.filter((m) => repo.getUnitSummary(m.id).completedCount > 0).length;
      return done > 0 ? t.hubRoles.labProgress(done, FOUNDATION_UNIT_META.length) : t.hubRoles.labProgressNone(FOUNDATION_UNIT_META.length);
    } catch { return t.hubRoles.labProgressNone(FOUNDATION_UNIT_META.length); }
  })();
  const [vocabProgressLine, setVocabProgressLine] = useState('');
  useEffect(() => {
    let alive = true;
    // canonical集計は語彙chunkにあるため動的import（メインbundleへ含めない方針を維持）
    void Promise.all([
      import('../../lib/aiLesson/course/vocabCanonical'),
      import('../../lib/aiLesson/course/vocabProgress'),
      import('../../lib/aiLesson/course/foundationVocabBank'),
    ]).then(([canon, prog, bank]) => {
      if (!alive) return;
      const stats = canon.vocabCanonicalStats();
      try {
        const repo = prog.createVocabProgressRepository(window.sessionStorage);
        const started = bank.allVocabularyItems().filter((i) => {
          const e = repo.getEntry(i.id);
          return e.firstSeenAt !== null || e.selfAssessment !== 'unseen' || e.tests.length > 0;
        }).length;
        setVocabProgressLine(started > 0 ? t.hubRoles.vocabProgress(started, stats.total) : t.hubRoles.vocabProgressNone(stats.total));
      } catch { setVocabProgressLine(t.hubRoles.vocabProgressNone(stats.total)); }
    }).catch(() => { /* 表示なしでもカードは成立 */ });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 初回のみ（tはlocale切替で再マウント）
  }, []);
  // 語彙サマリー（現在の目標・パック・カバー）は動的import（語彙データをメインbundleへ入れない・§31）
  const [vocabSummary, setVocabSummary] = useState<import('../../lib/aiLesson/course/vocabHomeSummary').VocabHomeSummary | null>(null);
  useEffect(() => {
    let alive = true;
    void import('../../lib/aiLesson/course/vocabHomeSummary')
      .then((m) => { if (alive) setVocabSummary(m.getVocabHomeSummary()); })
      .catch(() => { /* サマリー無しでもHeroは成立する */ });
    return () => { alive = false; };
  }, []);
  const rec = (() => {
    try {
      const repo = createFoundationProgressRepository(window.sessionStorage);
      const summaries = Object.fromEntries(FOUNDATION_UNIT_META.map((m) => [m.id, repo.getUnitSummary(m.id)]));
      const dueCount = repo.getReviewQueue(new Date().toISOString()).filter((e) => e.isDue).length;
      return { r: recommendToday(FOUNDATION_UNIT_META, summaries, dueCount), dueCount };
    } catch { return null; }
  })();
  const recUnit = rec?.r.unitId ? FOUNDATION_UNIT_META.find((m) => m.id === rec.r.unitId) : null;
  // 決定的な第一アクション（§4: 復習期限→途中→今日の会話→次の単元→今日の3語）
  const hero = (() => {
    // ①-0 語彙の期限復習を最優先（2E-1.10 §15・翌日/3日後/7日後の予定が来ている）
    if (vocabSummary && vocabSummary.dueReviewCount > 0) {
      return {
        reason: vocabSummary.overdueReviewCount > 0 ? t.vocab.reasonOverdue : t.vocab.reasonDueToday,
        body: t.vocab.dueReviewCount(vocabSummary.dueReviewCount, Math.max(1, Math.round(vocabSummary.dueReviewCount * 0.5))),
        cta: t.vocab.dueReviewStart,
        action: () => onOpenVocab('quickreview'),
        minutes: null as number | null,
      };
    }
    if (rec && rec.dueCount > 0) return { reason: tm.reasonReview, body: tl.recReview(rec.dueCount), cta: tl.ctaReview, action: () => onOpenLab('records'), minutes: rec.r.estimatedMinutes as number | null };
    if (rec && rec.r.kind === 'resume_unit' && recUnit) return { reason: tm.reasonResumeLab, body: tl.todayBody(zh ? recUnit.titleZh : recUnit.titleJa), cta: tl.ctaResume, action: () => onOpenLab('today'), minutes: rec.r.estimatedMinutes as number | null };
    if (canLearn && missionTitle) return { reason: tm.reasonConversation, body: missionTitle, cta: tl.ctaStart, action: onStartConversation, minutes: null };
    if (rec && (rec.r.kind === 'next_unit' || rec.r.kind === 'first_unit') && recUnit) return { reason: tm.reasonNextUnit, body: tl.todayBody(zh ? recUnit.titleZh : recUnit.titleJa), cta: tl.ctaStart, action: () => onOpenLab('today'), minutes: rec.r.estimatedMinutes as number | null };
    return { reason: tm.reasonDaily, body: tm.vocabBody, cta: tl.ctaStart, action: () => onOpenVocab('daily'), minutes: 3 as number | null };
  })();
  const { reason: heroReason, body: heroBody, cta: heroCta, action: heroAction, minutes: heroMinutes } = hero;
  return (
    <div className="mb-4">
      {/* ① 今日の学習（Premium Hero・第一CTAは一つ・§18。PCは2カラム、モバイルはテキスト優先） */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl overflow-hidden mb-3">
        <div className="lg:grid lg:grid-cols-[1fr,190px]">
          <div className="p-5">
            <p className="text-xs font-bold text-indigo-200 mb-1">{tm.todayHeading}</p>
            <p className="text-base font-bold leading-snug">{heroBody}</p>
            <p className="text-[11px] text-indigo-200 mt-1">{heroReason}{heroMinutes ? `・${tl.aboutMinutes(heroMinutes)}` : ''}</p>
            {vocabSummary && (
              <p className="text-[11px] text-indigo-200 mt-1.5">
                {tm.heroGoalLabel}: {t.vocab.tracks[vocabSummary.track] ?? t.vocab.tracks.life_basic}
                ・{tm.heroPackLabel}: {zh ? vocabSummary.packTitleZh : vocabSummary.packTitleJa}
                （{t.vocab.packProgress(vocabSummary.seenCount, vocabSummary.totalCount)}）
              </p>
            )}
            <button type="button" onClick={heroAction}
              className="action-raised w-full min-h-12 py-3 mt-3 bg-white text-indigo-700 font-bold rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">{heroCta}</button>
          </div>
          {/* パックカバー（装飾・学習情報をここに依存させない→alt空・§32。実ファイルがある時のみ） */}
          {vocabSummary?.coverPath && (
            <div className="hidden lg:block relative">
              <img src={vocabSummary.coverThumbPath ?? vocabSummary.coverPath} alt="" aria-hidden loading="lazy"
                width={320} height={240} className="absolute inset-0 w-full h-full object-cover opacity-90" />
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/70 to-transparent" aria-hidden />
            </div>
          )}
        </div>
      </div>
      {/* ② 3つの学習入口（役割で見た目を区別・§5） */}
      <p className="text-xs font-bold text-gray-500 mb-2">{tm.menuHeading}</p>
      <div className="space-y-2">
        <button type="button" onClick={onStartConversation} disabled={!canLearn}
          className="card-interactive w-full text-left rounded-2xl p-4 min-h-11 bg-gradient-to-r from-blue-600 to-blue-500 text-white disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2">
          <p className="text-sm font-bold flex items-center gap-1.5"><Mic className="w-4 h-4" aria-hidden />{tm.convTitle}</p>
          <p className="text-xs text-blue-100 mt-0.5">{tm.convBody}</p>
        </button>
        {/* ことば vs しくみ: 「材料」と「ルール」が3秒で分かる比較カード（2026-07-30 CEO UX指示） */}
        <div className="grid sm:grid-cols-2 gap-2">
          <button type="button" onClick={() => onOpenVocab('top')} aria-label={t.hubRoles.vocabNavAria}
            className="card-interactive text-left rounded-2xl p-4 min-h-11 bg-white border-2 border-teal-100 hover:border-teal-300 active:scale-[0.99] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><BookOpen className="w-4 h-4 text-teal-600" aria-hidden />{tm.vocabTitle}<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-normal">{tl.betaBadge}</span></p>
            <p className="text-xs font-bold text-teal-700 mt-1">{t.hubRoles.vocabCardRole}</p>
            <p className="text-[11px] text-gray-600">{t.hubRoles.vocabCardItems}</p>
            <p className="text-[11px] text-gray-400 mt-1">{vocabProgressLine}</p>
            <p className="text-[10px] text-gray-400 mt-1">{t.world.facilities.lib.name}・{t.hubRoles.vocabExample}</p>
            <p className="text-xs font-bold text-teal-700 mt-2">{t.hubRoles.vocabCardCta} →</p>
          </button>
          <button type="button" onClick={() => onOpenLab('today')} aria-label={t.hubRoles.labNavAria}
            className="card-interactive text-left rounded-2xl p-4 min-h-11 bg-indigo-50 border-2 border-indigo-100 hover:border-indigo-300 active:scale-[0.99] motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5"><PenLine className="w-4 h-4 text-indigo-600" aria-hidden />{tm.labTitle}<span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-normal">{tl.betaBadge}</span></p>
            <p className="text-xs font-bold text-indigo-700 mt-1">{t.hubRoles.labCardRole}</p>
            <p className="text-[11px] text-gray-600">{t.hubRoles.labCardItems}</p>
            <p className="text-[11px] text-gray-400 mt-1">{labProgressLine}</p>
            <p className="text-[10px] text-gray-400 mt-1">{t.world.facilities.workshop.name}・{t.hubRoles.labExample}</p>
            <p className="text-xs font-bold text-indigo-700 mt-2">{t.hubRoles.labCardCta} →</p>
          </button>
        </div>

        {/* どちらを学ぶ？（初回は展開・閉じた状態をlocalStorageへ・閉じなくても学習開始可能） */}
        <details className="bg-white border border-gray-100 rounded-2xl px-4 py-2.5" open={guideOpen}
          onToggle={(e) => rememberGuideClosed((e.target as HTMLDetailsElement).open)}>
          <summary className="text-xs font-bold text-gray-700 cursor-pointer min-h-8 flex items-center gap-1">
            {t.hubRoles.guideTitle}<span className="text-[10px] font-normal text-gray-400">（{t.hubRoles.guideShow}）</span>
          </summary>
          <ul className="mt-1 mb-1 space-y-1">
            {t.hubRoles.guideRows.map((r) => (
              <li key={r.q} className="text-[11px] text-gray-600 leading-snug">
                {r.q} <span className="font-bold text-gray-800">→ {r.a}</span>
              </li>
            ))}
          </ul>
        </details>
      </div>
    </div>
  );
};
