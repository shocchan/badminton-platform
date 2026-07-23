// レッスン後レポート。実発話ログ由来の内容（AI生成 or ローカルフォールバック）＋1タップ評価。
// 全体%の微増ではなく「今日できたこと」を主役にする。

import { useState } from 'react';
import { CheckCircle2, PenLine, CalendarDays, Zap, Clock, ArrowRight, Home, Sparkles, RotateCcw, TrendingUp } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import type { CourseMasteryState, FeedbackInput, LessonReport, Mission, MissionCategory } from '../../lib/aiLesson/course/types';
import { canDoLineForMission } from '../../lib/aiLesson/course/courseCanDo';
import type { CanDoStage } from '../../lib/aiLesson/course/courseCanDo';

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
}

export const CourseReport = ({ t, data, onFeedback, onBackHome, onAgain, canAgain }: Props) => {
  const tr = t.report;
  const zh = t.locale === 'zh';
  const r = data.report;
  const [rated, setRated] = useState(false);

  const usageLine = r.targetUsage === 'self' ? tr.usageSelf : r.targetUsage === 'hint' ? tr.usageHint : tr.usageNone;

  const rate = (rating: FeedbackInput['difficultyRating']) => { setRated(true); onFeedback({ difficultyRating: rating }); };

  const durMin = Math.max(1, Math.round(data.durationSeconds / 60));

  return (
    <div className="max-w-md lg:max-w-2xl mx-auto px-4 py-6">
      <div className="text-center mb-5 motion-safe:animate-[report-in_0.5s_ease-out]">
        <p className="text-xs font-medium text-emerald-600 mb-1.5 tracking-wide">{tr.todayStep}</p>
        <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h1 className="text-lg font-bold text-gray-900">{zh ? r.todaySummaryZh : r.todaySummaryJa}</h1>
      </div>

      <div className="space-y-3">
        {/* 【最初に】今日できるようになったこと（数値ではなく成果を主役に・§21） */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-100 p-5 motion-safe:animate-[report-in_0.5s_ease-out]">
          <p className="text-xs font-medium text-emerald-700 mb-2">{tr.canDoTitle}</p>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-base font-bold text-gray-900 leading-snug">{tr.canDoStages[data.todayCanDo.stage]}</p>
              <p className="text-sm text-gray-700 mt-1">「{data.todayCanDo.expression}」</p>
              <p className="text-xs text-gray-500 mt-1">{canDoLineForMission(data.todayCanDo.category, data.todayCanDo.expression, zh ? 'zh' : 'ja')}</p>
            </div>
          </div>
        </div>

        {/* 次にできるようになること */}
        {data.nextAbility && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-600 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] text-gray-500">{tr.nextAbilityTitle}</p>
              <p className="text-sm font-medium text-gray-800 truncate">{zh ? data.nextAbility.zh : data.nextAbility.ja}</p>
            </div>
          </div>
        )}

        {/* 今日の表現＋できたこと */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-xs text-gray-500">{tr.todayExpression}</p>
          <p className="font-bold text-gray-900 text-lg">{data.mission.targetExpression}</p>
          <div className="mt-2 bg-emerald-50 rounded-xl p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm font-medium text-gray-800">{usageLine}</p>
          </div>
          {r.achievements.length > 0 && (
            <ul className="mt-3 space-y-1">
              {r.achievements.map((a, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-1.5"><Sparkles className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />{a}</li>
              ))}
            </ul>
          )}
        </div>

        {/* 自然な言い方 */}
        {r.naturalPhrases.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-500 mb-2">{tr.naturalPhrase}</p>
            <ul className="space-y-1">
              {r.naturalPhrases.map((p, i) => <li key={i} className="text-sm text-gray-800">💬 {p}</li>)}
            </ul>
          </div>
        )}

        {/* 訂正（生徒の実発話→改善例） */}
        {r.corrections.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-2"><PenLine className="w-4 h-4 text-violet-600" />{tr.corrections}</p>
            <ul className="space-y-3">
              {r.corrections.map((c, i) => (
                <li key={i} className="text-sm">
                  <p className="text-gray-400 line-through decoration-red-300">{c.original}</p>
                  <p className="text-gray-900 font-medium mt-0.5">→ {c.improved}</p>
                  {c.noteZh && <p className="text-xs text-gray-500 mt-0.5">{c.noteZh}</p>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 定着状態＋次の復習 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-2">
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

        {/* 補助情報（学習時間・XP・週間進捗。主役にしない・§22） */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-center justify-between flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <p className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-gray-400" />{tr.todayTime} <span className="font-bold text-gray-700">{tr.minutesValue(durMin)}</span></p>
            <p className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-400" />{tr.xp} <span className="font-bold text-gray-700">+{data.xpEarned}</span></p>
            <p>{tr.weeklyProgress}: <span className="font-bold text-gray-700">{data.weekSessions}/{data.weeklyTarget}</span></p>
          </div>
        </div>

        {/* 1タップ評価 */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
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
        {canAgain && (
          <button type="button" onClick={onAgain}
            className="w-full min-h-11 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 flex items-center justify-center gap-2">
            <RotateCcw className="w-4 h-4" />{tr.again}
          </button>
        )}
        <button type="button" onClick={onBackHome}
          className="w-full min-h-11 py-3 bg-white border border-gray-300 text-gray-700 font-bold rounded-xl hover:bg-gray-50 flex items-center justify-center gap-2">
          <Home className="w-4 h-4" />{tr.backHome}
        </button>
      </div>
    </div>
  );
};
