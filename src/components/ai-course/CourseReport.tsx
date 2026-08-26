// レッスン後レポート（UX改訂）。最初に見せるのは「完了＋できたこと＋直す点1つ」だけ。
// 詳細（訂正全件・自然な言い方・定着状態・XP内訳）は「詳しく見る」に折り畳む（§10）。

import { useMemo, useRef, useState } from 'react';
import { CheckCircle2, PenLine, CalendarDays, Zap, Clock, ArrowRight, Home, Sparkles, RotateCcw, TrendingUp, BookOpen, ChevronDown, MapPin } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseMasteryState, FeedbackInput, LessonReport, Mission, MissionCategory } from '../../lib/aiLesson/course/types';
import { canDoLineForMission } from '../../lib/aiLesson/course/courseCanDo';
import type { CanDoStage } from '../../lib/aiLesson/course/courseCanDo';
import { pickRetryTarget } from '../../lib/aiLesson/course/courseRetry';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';
import { CourseRetryCard } from './CourseRetryCard';
import { CourseIllustration } from './CourseIllustration';
import { ShokoAvatar } from './ShokoAvatar';
import { LearnerAvatar } from './LearnerAvatar';

export interface CourseReportData {
  mission: Mission;
  report: LessonReport;
  masteryState: CourseMasteryState;
  nextReviewISO: string | null;
  nextMissionLabel: string | null;
  xpEarned: number;
  xpBreakdown: { key: string; xp: number }[];
  weekSessions: number;
  weeklyTarget: number;
  /** 今日のレッスンの長さ（秒）。補助情報として表示 */
  durationSeconds: number;
  fromAi: boolean; // AI生成か（falseならローカルフォールバック）
  /** 今日できるようになったこと（誠実表示・§21/§23） */
  todayCanDo: {
    category: MissionCategory;
    expression: string;
    stage: CanDoStage;
    isReview: boolean;
    reviewSucceeded: boolean;
  };
  nextAbility: { id: string; ja: string; zh: string } | null;
}

interface Props {
  t: AiCourseDict;
  data: CourseReportData;
  onFeedback: (fb: FeedbackInput) => void;
  onBackHome: () => void;
  onAgain: () => void;
  canAgain: boolean;
  /** 次の章へすぐ進む（Feature 3） */
  onNextChapter?: () => void;
  canNext?: boolean;
  /** 今回の復習ノートを開く（Feature 5） */
  onSeeReviewNote?: () => void;
  /** わたしの日本語ノートへ（§PW-V1。通常会話=DB保存済みの時だけ渡す） */
  onSeeNotebook?: () => void;
  /** 本人表示用（アバターは承認済みsigned URLを親から渡す。無ければイニシャル） */
  learnerName?: string;
  learnerAvatarUrl?: string | null;
  /** 世界の変化の一言（FOREST FIRST §12。会話がミナモ列島の物語につながる） */
  worldLineJa?: string;
  /**
   * 実時間制の体験（600円のAI体験パス）で学習しているか（2026-08-26）。
   *
   * 体験の受講権は「体験を始める」から60分の**実時間**で切れる。
   * それなのにレポートは「次の復習: 8/27」と、体験では絶対に来ない日付を
   * 約束していた（＝お金を払った人に、届かない約束を見せていた）。
   * 体験中は日付ではなく「続けたときに届く」と正直に言う。
   * 間隔をあけて再会させる学習設計そのものは変えていない。
   */
  realtimeTrial?: boolean;
}

export const CourseReport = ({ t, data, onFeedback, onBackHome, onAgain, canAgain, onNextChapter, canNext, onSeeReviewNote, onSeeNotebook, learnerName = '', learnerAvatarUrl = null, worldLineJa, realtimeTrial = false }: Props) => {
  const tr = t.report;
  const zh = t.locale === 'zh';
  const r = data.report;
  const [rated, setRated] = useState(false);
  const [open, setOpen] = useState(false); // 詳細の開閉

  const usageLine = r.targetUsage === 'self' ? tr.usageSelf : r.targetUsage === 'hint' ? tr.usageHint : tr.usageNone;
  /*
   * 次の復習が明日なら、日付ではなく「明日」と言う（2026-08-26）。
   * 「次の復習: 2026-08-27」は事実だが、**明日また開く理由**にはなっていない。
   * 何を練習するのかまで言う。日付は現地時間で比べる（保存はYYYY-MM-DD）。
   */
  const reviewIsTomorrow = (() => {
    if (!data.nextReviewISO) return false;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const p2 = (n: number) => String(n).padStart(2, '0');
    return data.nextReviewISO.startsWith(`${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`);
  })();
  const rate = (rating: FeedbackInput['difficultyRating']) => { setRated(true); onFeedback({ difficultyRating: rating }); };
  const durMin = Math.max(1, Math.round(data.durationSeconds / 60));

  // 言い直し対象（最重要の1件のみ・無ければカードを出さない）
  const retryTarget = useMemo(() => pickRetryTarget(r, data.mission.targetExpression), [r, data.mission.targetExpression]);
  const [retryDone, setRetryDone] = useState(!retryTarget); // 対象なし＝最初から完了扱い
  const dailyDoneSent = useRef(false);
  const markDailyDone = () => {
    setRetryDone(true);
    if (!dailyDoneSent.current) { dailyDoneSent.current = true; trackCourse('complete_ai_course_daily'); }
  };
  // 詳細折り畳みには言い直し対象以外の訂正を出す（重複表示しない）
  const restFixes = r.corrections.filter((c) => !(retryTarget && c.original === retryTarget.original && c.improved === retryTarget.improved));
  const hasDetails = true; // 定着状態・XPは常にあるため常時true

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-6">
      {/* 完了（最初に「終えたこと」を見せる・§10） */}
      <div className="text-center mb-5 motion-safe:animate-[report-in_0.5s_ease-out]">
        <p className="text-xs font-medium text-emerald-600 mb-2 tracking-wide">{tr.todayStep} ・ {tr.minutesValue(durMin)}</p>
        <ShokoAvatar size={64} expression="smile" className="mx-auto mb-2 ring-4 ring-emerald-50 check-pop" />
        <h1 className="text-lg font-bold text-gray-900">{zh ? r.todaySummaryZh : r.todaySummaryJa}</h1>
      </div>

      <div className="space-y-3">
        {/* ① 今日できるようになったこと（良かった点・主役） */}
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl border border-emerald-100 p-5 motion-safe:animate-[report-in_0.5s_ease-out]">
          <p className="text-xs font-medium text-emerald-700 mb-2">{tr.canDoTitle}</p>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-bold text-gray-900 leading-snug">{tr.canDoStages[data.todayCanDo.stage]}</p>
              <p className="text-sm text-gray-700 mt-1">「{data.todayCanDo.expression}」</p>
              <p className="text-xs text-gray-500 mt-1">{canDoLineForMission(data.todayCanDo.category, data.todayCanDo.expression, zh ? 'zh' : 'ja')}</p>
            </div>
          </div>
          <div className="mt-3 bg-white/70 rounded-xl p-2.5 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-sm font-medium text-gray-800">{usageLine}</p>
          </div>
        </div>

        {/* ② 言い直しフロー: 最重要の1文だけ、その場で1回言い直す（スキップ可・失敗扱いなし） */}
        {retryTarget && !retryDone && (
          <CourseRetryCard t={t} target={retryTarget} onFinished={() => markDailyDone()} />
        )}
        {retryTarget && retryDone && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-1"><PenLine className="w-3.5 h-3.5 text-blue-600" />{tr.fixOneTitle}</p>
            <p className="text-sm text-gray-400 line-through decoration-red-300">{retryTarget.original}</p>
            <p className="text-sm text-gray-900 font-medium mt-0.5">→ {retryTarget.improved}</p>
          </div>
        )}

        {/* ③ 今日の学習完了（言い直し後の締め・次の復習日と先生の一言） */}
        {retryDone && (
          <div className="bg-gradient-to-br from-blue-50 to-emerald-50 rounded-2xl border border-blue-100 p-5 motion-safe:animate-[report-in_0.5s_ease-out]" aria-live="polite">
            <div className="flex items-center gap-3">
              {/* 本人が主役・先生は補助（同等以下のサイズ・§PW-V1） */}
              <div className="flex items-center shrink-0 -space-x-2">
                <LearnerAvatar displayName={learnerName} imageSrc={learnerAvatarUrl} size={56} decorative className="ring-2 ring-white z-10" />
                <CourseIllustration slot="complete" width={48} lang={zh ? 'zh' : 'ja'} decorative className="rounded-2xl" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />{tr.doneTitle}
                </p>
                <p className="text-xs text-gray-600 mt-1">{tr.doneCoachLine}</p>
                {worldLineJa && <p className="text-xs text-indigo-600 mt-1">{worldLineJa}</p>}
                {data.nextReviewISO && !realtimeTrial && (
                  reviewIsTomorrow ? (
                    <p className="text-xs text-blue-800 mt-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 flex items-start gap-1.5 leading-relaxed">
                      <CalendarDays className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-px" />
                      {tr.reviewTomorrow(data.todayCanDo.expression)}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <CalendarDays className="w-3 h-3 text-blue-500" />{tr.nextReview}: <span className="font-bold text-gray-700">{data.nextReviewISO}</span>
                    </p>
                  )
                )}
                {/* ノートへ残った事実（通常会話=DB保存済みの時だけ表示・軽め学習では出さない） */}
                {onSeeNotebook && (
                  <>
                    <p className="text-xs text-amber-700 mt-1.5">{tr.savedToNotebook}</p>
                    <button type="button" onClick={onSeeNotebook}
                      className="min-h-9 mt-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition-colors active:bg-gray-100 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">{tr.seeNotebook} →</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ③ 詳しく見る（訂正の残り・自然な言い方・定着・XP・次の力） */}
        {hasDetails && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="w-full min-h-11 px-5 py-3.5 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
              {open ? tr.hideDetails : tr.seeDetails}
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <div className="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
                {/* 今日の表現＋できたこと */}
                <div>
                  <p className="text-xs text-gray-500">{tr.todayExpression}</p>
                  <p className="font-bold text-gray-900">{data.mission.targetExpression}</p>
                  {r.achievements.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {r.achievements.map((a, i) => (
                        <li key={i} className="text-sm text-gray-700 flex gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                          <span>
                            {a}
                            {/* 中国語補助（UX-004）: 旧sessionはachievementsZhが無いためja表示のみ */}
                            {t.locale === 'zh' && !!r.achievementsZh?.[i] && (
                              <span className="block text-xs text-gray-500">{r.achievementsZh[i]}</span>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {/* 自然な言い方 */}
                {r.naturalPhrases.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1">{tr.naturalPhrase}</p>
                    <ul className="space-y-1">
                      {r.naturalPhrases.map((p, i) => <li key={i} className="text-sm text-gray-800">💬 {p}</li>)}
                    </ul>
                  </div>
                )}
                {/* 日本で使える場面（2026-08-26）。学習を生活につなぐ一文。無ければ出さない */}
                {(zh ? r.usableSceneZh || r.usableSceneJa : r.usableSceneJa) && (
                  <div className="rounded-xl bg-blue-50/70 border border-blue-100 px-3 py-2.5">
                    <p className="text-xs text-blue-700 flex items-center gap-1.5 mb-0.5">
                      <MapPin className="w-3.5 h-3.5" />{tr.usableScene}
                    </p>
                    <p className="text-sm text-gray-800 leading-relaxed">
                      {zh ? r.usableSceneZh || r.usableSceneJa : r.usableSceneJa}
                    </p>
                  </div>
                )}
                {/* 訂正の残り */}
                {restFixes.length > 0 && (
                  <div>
                    <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-1"><PenLine className="w-3.5 h-3.5 text-blue-600" />{tr.corrections}</p>
                    <ul className="space-y-3">
                      {restFixes.map((c, i) => (
                        <li key={i} className="text-sm">
                          <p className="text-gray-400 line-through decoration-red-300">{c.original}</p>
                          <p className="text-gray-900 font-medium mt-0.5">→ {c.improved}</p>
                          {c.noteZh && <p className="text-xs text-gray-500 mt-0.5">{c.noteZh}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {/* 次にできるようになること */}
                {data.nextAbility && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-gray-500">{tr.nextAbilityTitle}</p>
                      <p className="text-sm font-medium text-gray-800 truncate">{zh ? data.nextAbility.zh : data.nextAbility.ja}</p>
                    </div>
                  </div>
                )}
                {/* 定着状態＋次の復習 */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">{tr.masteryNow}</span>
                    <span className="font-bold text-blue-700">{tr.masteryLabels[data.masteryState]}</span>
                  </div>
                  {realtimeTrial ? (
                    /* 体験中は届かない日付を約束しない。学習設計そのものは同じ */
                    <div className="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2.5">
                      <p className="text-xs text-amber-900 leading-relaxed flex items-start gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.nextReviewTrial}
                      </p>
                    </div>
                  ) : (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-blue-600" />{tr.nextReview}</span>
                      <span className="font-bold text-gray-900">{data.nextReviewISO ?? tr.nextReviewNone}</span>
                    </div>
                  )}
                  {data.nextMissionLabel && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">{tr.nextMission}</span>
                      <span className="font-bold text-gray-900 flex items-center gap-1">{data.nextMissionLabel}<ArrowRight className="w-3.5 h-3.5 text-blue-500" /></span>
                    </div>
                  )}
                </div>
                {/* 補助情報（時間・XP・週間進捗） */}
                <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 pt-1">
                  <p className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />{tr.todayTime} <span className="font-bold text-gray-700">{tr.minutesValue(durMin)}</span></p>
                  <p className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-400" />{tr.xp} <span className="font-bold text-gray-700">+{data.xpEarned}</span></p>
                  <p>{tr.weeklyProgress}: <span className="font-bold text-gray-700">{data.weekSessions}/{data.weeklyTarget}</span></p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 1タップ評価（コンパクト） */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          {rated ? (
            <p className="text-sm text-emerald-600 font-medium text-center">{tr.thanks}</p>
          ) : (
            <>
              <p className="text-sm text-gray-700 text-center mb-3">{tr.feedbackQ}</p>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => rate('too_easy')} className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">😌 {tr.tooEasy}</button>
                <button type="button" onClick={() => rate('just_right')} className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">👍 {tr.justRight}</button>
                <button type="button" onClick={() => rate('too_hard')} className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">😅 {tr.tooHard}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {/* 学習意欲がある生徒を止めない: 次の章へすぐ進める（Feature 3） */}
        {onNextChapter && canNext && (
          <button type="button" onClick={onNextChapter}
            className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2 action-raised action-primary-blue touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            {tr.nextChapter}<ArrowRight className="w-4 h-4" />
          </button>
        )}
        {/* 今回の復習ノート（音声なしで見返す・Feature 5） */}
        {onSeeReviewNote && (
          <button type="button" onClick={onSeeReviewNote}
            className="w-full min-h-11 py-3 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-50 flex items-center justify-center gap-2 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <BookOpen className="w-4 h-4" />{tr.seeReviewNote}
          </button>
        )}
        {canAgain && (
          <button type="button" onClick={onAgain}
            className="w-full min-h-11 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl flex items-center justify-center gap-1.5 transition-colors active:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            <RotateCcw className="w-3.5 h-3.5" />{tr.again}
          </button>
        )}
        <button type="button" onClick={onBackHome}
          className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2 action-raised action-secondary touch-manipulation [-webkit-tap-highlight-color:transparent] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
          <Home className="w-4 h-4" />{onNextChapter ? tr.doneForToday : tr.backHome}
        </button>
      </div>
    </div>
  );
};
