// 学習レポート: 実施結果 + XP + 習慣/成長/定着ゲージ + エビングハウス型復習予定

import { Award, BookOpen, CheckCircle2, Lightbulb, PenLine, CalendarDays, Zap, RotateCcw } from 'lucide-react';
import { RoadmapReportCard } from './RoadmapReportCard';
import type { RoadmapReportData } from './RoadmapReportCard';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { LearningPlan, ReviewScheduleItem, SessionRecord } from '../../lib/aiLesson/types';
import type { Gauges } from '../../lib/aiLesson/xp';

interface Props {
  t: AiLessonDict;
  plan: LearningPlan;
  session: SessionRecord;
  totalXp: number;
  gauges: Gauges;
  streakDays: number;
  reviewSchedule: ReviewScheduleItem[];
  /** 今日のロードマップ進捗（ページ側で計算済み） */
  roadmapData?: RoadmapReportData;
  onAgain: () => void;
  onBackToPlan: () => void;
}

const Gauge = ({ label, desc, ratio, color }: { label: string; desc: string; ratio: number; color: string }) => (
  <div>
    <div className="flex justify-between items-baseline mb-1">
      <span className="text-sm font-bold text-gray-800">{label}</span>
      <span className="text-xs text-gray-500">{desc}</span>
    </div>
    <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ${color}`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  </div>
);

const ExpressionList = ({ items, zhMeaningLabel, noneLabel }: {
  items: { label: string; zhMeaning: string; usage: string }[];
  zhMeaningLabel: string;
  noneLabel: string;
}) =>
  items.length === 0 ? (
    <p className="text-sm text-gray-400">{noneLabel}</p>
  ) : (
    <ul className="space-y-2">
      {items.map((e) => (
        <li key={e.label + e.usage} className="text-sm">
          <span className="font-bold text-gray-900">{e.label}</span>
          <span className="block text-xs text-gray-500 mt-0.5">{zhMeaningLabel}: {e.zhMeaning}</span>
        </li>
      ))}
    </ul>
  );

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
    <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-3">
      {icon}
      {title}
    </p>
    {children}
  </div>
);

export const ReportView = ({
  t, plan, session, totalXp, gauges, streakDays, reviewSchedule, roadmapData, onAgain, onBackToPlan,
}: Props) => {
  const tr = t.report;
  const minutes = Math.floor(session.elapsedSeconds / 60);
  const seconds = session.elapsedSeconds % 60;

  const learned = session.expressions.filter((e) => e.usage === 'learned');
  const selfUsed = session.expressions.filter((e) => e.usage === 'self');
  const hintUsed = session.expressions.filter((e) => e.usage === 'hint');

  const nextFocusKey = session.missionAchieved ? plan.priorityIssueKeys[0] : undefined;
  const nextFocus = session.missionAchieved
    ? (t.plan.priorityKeys[nextFocusKey as keyof typeof t.plan.priorityKeys] ?? nextFocusKey)
    : `${plan.target.label}（${tr.notAchieved}）`;

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-xl font-bold text-gray-900 flex items-center justify-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          {tr.title}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{tr.subtitle}</p>
      </div>

      <div className="space-y-3">
        {/* 実施時間・ミッション */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex justify-between items-center">
            <div>
              <p className="text-xs text-gray-500">{tr.duration}</p>
              <p className="font-bold text-gray-900">{tr.durationValue(minutes, seconds)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">{tr.missionResult}</p>
              <p className={`font-bold ${session.missionAchieved ? 'text-emerald-600' : 'text-amber-600'}`}>
                {session.missionAchieved ? tr.achieved : tr.notAchieved}
              </p>
            </div>
          </div>
          <p className="text-xs text-gray-600 mt-3 pt-3 border-t border-gray-100">
            🎯 {session.missionLabel}
          </p>
        </div>

        {/* XP */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl shadow-sm p-5 text-white">
          <p className="text-xs text-blue-100 flex items-center gap-1.5 mb-2">
            <Zap className="w-4 h-4" />
            {tr.xpTitle}
          </p>
          <div className="flex items-end justify-between">
            <div>
              <p className="text-3xl font-bold">+{session.earnedXp} <span className="text-base font-medium">XP</span></p>
              <p className="text-xs text-blue-100 mt-0.5">{tr.xpThisTime}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold">{totalXp} XP</p>
              <p className="text-xs text-blue-100">{tr.xpTotal}</p>
            </div>
          </div>
          <ul className="mt-3 pt-3 border-t border-white/20 space-y-1">
            {session.xpBreakdown.map((b) => (
              <li key={b.key} className="flex justify-between text-xs text-blue-50">
                <span>
                  {tr.xpBreakdown[b.key as keyof typeof tr.xpBreakdown] ?? b.key}
                  {b.count > 1 ? ` ×${b.count}` : ''}
                </span>
                <span className="font-bold">+{b.xp}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ゲージ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
          <p className="text-xs text-gray-500">{tr.gauges}</p>
          <Gauge label={tr.gaugeHabit} desc={tr.gaugeHabitDesc(streakDays)} ratio={gauges.habit} color="bg-amber-500" />
          <Gauge label={tr.gaugeGrowth} desc={tr.gaugeGrowthDesc(gauges.growthLevel)} ratio={gauges.growth} color="bg-blue-600" />
          <Gauge label={tr.gaugeRetention} desc={tr.gaugeRetentionDesc} ratio={gauges.retention} color="bg-emerald-500" />
        </div>

        {/* 今日のロードマップ進捗 */}
        {roadmapData && <RoadmapReportCard t={t} data={roadmapData} />}

        {/* 表現の記録 */}
        <Section icon={<BookOpen className="w-4 h-4 text-blue-600" />} title={tr.newExpressions}>
          <ExpressionList items={learned} zhMeaningLabel={tr.zhMeaningLabel} noneLabel={tr.none} />
        </Section>
        <Section icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} title={tr.selfUsed}>
          <ExpressionList items={selfUsed} zhMeaningLabel={tr.zhMeaningLabel} noneLabel={tr.none} />
        </Section>
        <Section icon={<Lightbulb className="w-4 h-4 text-amber-500" />} title={tr.hintUsed}>
          <ExpressionList items={hintUsed} zhMeaningLabel={tr.zhMeaningLabel} noneLabel={tr.none} />
        </Section>

        {/* 修正された日本語 */}
        <Section icon={<PenLine className="w-4 h-4 text-violet-600" />} title={tr.corrections}>
          {session.corrections.length === 0 ? (
            <p className="text-sm text-gray-400">{tr.none}</p>
          ) : (
            <ul className="space-y-3">
              {session.corrections.map((c, i) => (
                <li key={i} className="text-sm">
                  <p className="text-gray-500 line-through decoration-red-300">{c.original}</p>
                  <p className="text-gray-900 font-medium mt-0.5">{tr.correctionArrow} {c.corrected}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{c.zhNote}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 次回の重点課題 */}
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5">
          <p className="text-xs text-blue-700 font-bold mb-1">{tr.nextFocus}</p>
          <p className="text-sm text-gray-800">{nextFocus}</p>
        </div>

        {/* 復習予定（エビングハウス: 翌日・3日後・7日後） */}
        <Section icon={<CalendarDays className="w-4 h-4 text-blue-600" />} title={tr.review}>
          <ul className="space-y-2">
            {reviewSchedule.map((r) => (
              <li key={r.offsetDays} className="flex items-center gap-3 text-sm">
                <span className="w-16 shrink-0 text-center text-xs font-bold px-2 py-1.5 rounded-lg bg-blue-50 text-blue-700">
                  {tr.reviewDay(r.offsetDays)}
                </span>
                <div className="min-w-0">
                  <p className="text-gray-800 font-medium truncate">{r.expressions.join('、')}</p>
                  <p className="text-[10px] text-gray-400">{r.dateISO}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {/* アクション */}
      <div className="mt-5 space-y-2">
        <button
          type="button"
          onClick={onAgain}
          className="w-full min-h-11 py-3.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition-colors shadow-sm flex items-center justify-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          {tr.again}
        </button>
        <button
          type="button"
          onClick={onBackToPlan}
          className="w-full min-h-11 py-3 text-gray-600 text-sm font-medium rounded-xl hover:bg-gray-100 transition-colors"
        >
          {tr.backToPlan}
        </button>
      </div>
      <p className="text-[10px] text-gray-400 text-center mt-4">{tr.demoNote}</p>
    </div>
  );
};
