// 個別学習プランの表示
// ヒアリング回答からルールベース生成された LearningPlan を可視化する

import { Target, TrendingUp, MessageCircle, CalendarClock, PieChart, Languages, Wand2 } from 'lucide-react';
import { RoadmapSummary } from './RoadmapSummary';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { LearningPlan } from '../../lib/aiLesson/types';

interface Props {
  t: AiLessonDict;
  plan: LearningPlan;
  onNext: () => void;
}

const AllocationBar = ({ label, percent, color }: { label: string; percent: number; color: string }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500 w-10 shrink-0">{label}</span>
    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} />
    </div>
    <span className="text-xs font-bold text-gray-700 w-9 text-right shrink-0">{percent}%</span>
  </div>
);

export const PlanView = ({ t, plan, onNext }: Props) => {
  const tp = t.plan;
  const goalLabel = t.hearing.q1.options[plan.mainGoal];
  const isJlpt = plan.mainGoal === 'n1' || plan.mainGoal === 'n2' || plan.mainGoal === 'n3';
  const themeLabel = tp.themes[plan.themeKey as keyof typeof tp.themes] ?? plan.themeKey;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
          <Wand2 className="w-5 h-5 text-blue-600" />
          {tp.title}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{tp.subtitle}</p>
      </div>

      <div className="space-y-3">
        {/* 主目標・レベル */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start gap-3">
            <Target className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs text-gray-500">{tp.mainGoal}</p>
              <p className="font-bold text-gray-900">{goalLabel}</p>
              <p className="text-xs text-gray-500 mt-2">{tp.estimatedLevel}</p>
              <p className="font-bold text-gray-900">{plan.estimatedLevel}</p>
            </div>
          </div>
        </div>

        {/* 目標達成ロードマップ（全体進捗・推定残り・次のミッション。詳細はタップで展開） */}
        <RoadmapSummary t={t} plan={plan} />

        {/* 優先課題 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-3">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            {tp.priorities}
          </p>
          <ol className="space-y-2">
            {plan.priorityIssueKeys.map((key, i) => (
              <li key={key} className="flex items-start gap-2 text-sm text-gray-800">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {tp.priorityKeys[key as keyof typeof tp.priorityKeys] ?? key}
              </li>
            ))}
          </ol>
        </div>

        {/* 頻度・時間 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-2">
            <CalendarClock className="w-4 h-4 text-blue-600" />
            {tp.weekly} / {tp.perSession}
          </p>
          <p className="font-bold text-gray-900">
            {tp.weeklyValue(plan.weeklySessions)} × {tp.perSessionValue(plan.sessionMinutes)}
          </p>
        </div>

        {/* 学習配分 */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-3">
            <PieChart className="w-4 h-4 text-blue-600" />
            {tp.allocation}
          </p>
          <div className="space-y-2">
            <AllocationBar label={tp.allocConversation} percent={plan.allocation.conversation} color="bg-blue-600" />
            <AllocationBar label={tp.allocGrammar} percent={plan.allocation.grammar} color="bg-emerald-500" />
            <AllocationBar label={tp.allocVocab} percent={plan.allocation.vocab} color="bg-amber-500" />
            <AllocationBar label={tp.allocReview} percent={plan.allocation.review} color="bg-violet-500" />
          </div>
          {isJlpt && <p className="text-xs text-gray-500 mt-3 leading-relaxed">{tp.jlptNote}</p>}
        </div>

        {/* 訂正・中国語サポート */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-2">
            <Languages className="w-4 h-4 text-blue-600" />
            {tp.correction} / {tp.zhSupport}
          </p>
          <p className="text-sm text-gray-800">{tp.correctionLabels[plan.correction]}</p>
          <p className="text-sm text-gray-800 mt-1">{tp.zhSupportLabels[plan.zhSupport]}</p>
        </div>

        {/* 今日のテーマ・目標表現 */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl shadow-sm p-5 text-white">
          <p className="text-xs text-blue-100 flex items-center gap-1.5 mb-2">
            <MessageCircle className="w-4 h-4" />
            {tp.firstTheme}
          </p>
          <p className="font-bold text-lg">{themeLabel}</p>
          <p className="text-xs text-blue-100 mt-3">{tp.todayTarget}</p>
          <p className="font-bold text-lg">{plan.target.label}</p>
          <p className="text-sm text-blue-100 mt-1">{plan.target.example}</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onNext}
        className="w-full min-h-11 mt-5 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
      >
        {tp.toMission}
      </button>
    </div>
  );
};
