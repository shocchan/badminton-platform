// レッスン後レポート（UX改訂）。最初に見せるのは「完了＋できたこと＋直す点1つ」だけ。
// 詳細（訂正全件・自然な言い方・定着状態・XP内訳）は「詳しく見る」に折り畳む（§10）。

import { useState } from 'react';
import { CheckCircle2, PenLine, CalendarDays, Zap, Clock, ArrowRight, Home, Sparkles, RotateCcw, TrendingUp, BookOpen, ChevronDown } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseMasteryState, FeedbackInput, LessonReport, Mission, MissionCategory } from '../../lib/aiLesson/course/types';
import { canDoLineForMission } from '../../lib/aiLesson/course/courseCanDo';
import type { CanDoStage } from '../../lib/aiLesson/course/courseCanDo';
import { ShokoAvatar } from './ShokoAvatar';

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
}

export const CourseReport = ({ t, data, onFeedback, onBackHome, onAgain, canAgain, onNextChapter, canNext, onSeeReviewNote }: Props) => {
  const tr = t.report;
  const zh = t.locale === 'zh';
  const r = data.report;
  const [rated, setRated] = useState(false);
  const [open, setOpen] = useState(false); // 詳細の開閉

  const usageLine = r.targetUsage === 'self' ? tr.usageSelf : r.targetUsage === 'hint' ? tr.usageHint : tr.usageNone;
  const rate = (rating: FeedbackInput['difficultyRating']) => { setRated(true); onFeedback({ difficultyRating: rating }); };
  const durMin = Math.max(1, Math.round(data.durationSeconds / 60));

  const firstFix = r.corrections[0] ?? null;
  const restFixes = r.corrections.slice(1);
  // 折り畳みに中身があるときだけ「詳しく見る」を出す
  const hasDetails = restFixes.length > 0 || r.naturalPhrases.length > 0 || !!data.nextAbility || true; // 定着状態・XPは常にあるため常時true

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

        {/* ② 直す点は1つだけ（残りは「詳しく見る」へ・§10） */}
        {firstFix && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-2"><PenLine className="w-4 h-4 text-blue-600" />{tr.fixOneTitle}</p>
            <p className="text-sm text-gray-400 line-through decoration-red-300">{firstFix.original}</p>
            <p className="text-sm text-gray-900 font-medium mt-0.5">→ {firstFix.improved}</p>
            {firstFix.noteZh && <p className="text-xs text-gray-500 mt-0.5">{firstFix.noteZh}</p>}
          </div>
        )}

        {/* ③ 詳しく見る（訂正の残り・自然な言い方・定着・XP・次の力） */}
        {hasDetails && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
              className="w-full min-h-11 px-5 py-3.5 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50">
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
                        <li key={i} className="text-sm text-gray-700 flex gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />{a}</li>
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
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-blue-600" />{tr.nextReview}</span>
                    <span className="font-bold text-gray-900">{data.nextReviewISO ?? tr.nextReviewNone}</span>
                  </div>
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
                <button type="button" onClick={() => rate('too_easy')} className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">😌 {tr.tooEasy}</button>
                <button type="button" onClick={() => rate('just_right')} className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">👍 {tr.justRight}</button>
                <button type="button" onClick={() => rate('too_hard')} className="min-h-11 py-2 rounded-xl border border-gray-200 text-sm hover:bg-gray-50">😅 {tr.tooHard}</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {/* 学習意欲がある生徒を止めない: 次の章へすぐ進める（Feature 3） */}
        {onNextChapter && canNext && (
          <button type="button" onClick={onNextChapter}
            className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">
            {tr.nextChapter}<ArrowRight className="w-4 h-4" />
          </button>
        )}
        {/* 今回の復習ノート（音声なしで見返す・Feature 5） */}
        {onSeeReviewNote && (
          <button type="button" onClick={onSeeReviewNote}
            className="w-full min-h-11 py-3 bg-white border border-blue-200 text-blue-700 font-bold rounded-xl hover:bg-blue-50 flex items-center justify-center gap-2">
            <BookOpen className="w-4 h-4" />{tr.seeReviewNote}
          </button>
        )}
        {canAgain && (
          <button type="button" onClick={onAgain}
            className="w-full min-h-11 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-xl flex items-center justify-center gap-1.5">
            <RotateCcw className="w-3.5 h-3.5" />{tr.again}
          </button>
        )}
        <button type="button" onClick={onBackHome}
          className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2">
          <Home className="w-4 h-4" />{onNextChapter ? tr.doneForToday : tr.backHome}
        </button>
      </div>
    </div>
  );
};
