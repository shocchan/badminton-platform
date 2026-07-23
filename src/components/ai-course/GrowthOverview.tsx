// 成長画面（§19）。旅マップ＋会話力スキル＋Before/After＋スナップショット＋12週後の姿。
// 1画面1目的（成長を実感する）。情報過多にせず、セクションごとに余白をとる。

import { ArrowLeft, Map, BarChart3, GitCompare, Camera, Target, Info } from 'lucide-react';
import { GrowthJourneyMap } from './GrowthJourneyMap';
import { SpeakingSkillSummary } from './SpeakingSkillSummary';
import { BeforeAfterSpeechCard } from './BeforeAfterSpeechCard';
import { CanDoAchievementCard } from './CanDoAchievementCard';
import { GrowthSnapshotCard } from './GrowthSnapshotCard';
import { COURSE_GOAL_CANDOS } from '../../lib/aiLesson/course/courseCanDo';
import type { AchievedCanDo } from '../../lib/aiLesson/course/courseCanDo';
import type { GrowthMetrics, GrowthSnapshot } from '../../lib/aiLesson/course/courseGrowth';
import type { JourneyPlace } from '../../lib/aiLesson/course/courseJourney';
import type { BeforeAfter } from '../../lib/aiLesson/course/courseBeforeAfter';
import type { AiCourseDict } from '../../locales/aiCourse';

interface Props {
  t: AiCourseDict;
  metrics: GrowthMetrics;
  journey: JourneyPlace[];
  currentWeek: number;
  canDos: AchievedCanDo[];
  beforeAfter: BeforeAfter | null;
  snapshots: GrowthSnapshot[];
  onBack: () => void;
}

const Section = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
  <section className="mb-6">
    <h2 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 mb-3">{icon}{title}</h2>
    {children}
  </section>
);

export const GrowthOverview = ({ t, metrics, journey, currentWeek, canDos, beforeAfter, snapshots, onBack }: Props) => {
  const tg = t.growth;
  const zh = t.locale === 'zh';

  return (
    <div className="max-w-md lg:max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-5">
        <button type="button" onClick={onBack} aria-label={t.roadmap.back}
          className="min-h-11 min-w-11 flex items-center justify-center text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg lg:text-xl font-bold text-gray-900">{tg.title}</h1>
      </div>

      {/* データ不足時は断定せず「分析中」（§26） */}
      {!metrics.sufficient && (
        <div className="bg-blue-50 rounded-xl p-4 mb-6 flex items-start gap-2">
          <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-gray-800">{tg.analyzing}</p>
            {metrics.sessionsUntilReady > 0 && (
              <p className="text-xs text-gray-500 mt-0.5">{tg.analyzingCount(metrics.sessionsUntilReady)}</p>
            )}
          </div>
        </div>
      )}

      {/* ① 現在地＝旅マップ（主役級。PCでも大きく） */}
      <Section icon={<Map className="w-4 h-4 text-blue-600" />} title={tg.journeyTitle}>
        <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:p-6">
          <GrowthJourneyMap t={t} places={journey} currentWeek={currentWeek} />
        </div>
      </Section>

      {/* ②以降は読み物幅（PCで広がりすぎない）で優先順に縦に */}
      <div className="lg:max-w-3xl lg:mx-auto">

        {/* ② できるようになったこと */}
        <Section icon={<Target className="w-4 h-4 text-emerald-600" />} title={tg.canDoNowTitle}>
          <CanDoAchievementCard t={t} title={tg.canDoNowTitle} canDos={canDos} />
        </Section>

        {/* ③ Before / After（PCは左右比較・スマホは上下） */}
        <Section icon={<GitCompare className="w-4 h-4 text-blue-600" />} title={tg.beforeAfterTitle}>
          <BeforeAfterSpeechCard t={t} data={beforeAfter} sessionsUntilReady={metrics.sessionsUntilReady} />
        </Section>

        {/* ④ 会話力6スキル（スコア競争にしない） */}
        {metrics.sufficient && (
          <Section icon={<BarChart3 className="w-4 h-4 text-blue-600" />} title={tg.skillTitle}>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <SpeakingSkillSummary t={t} skills={metrics.skills} />
            </div>
          </Section>
        )}

        {/* ⑤ 成長スナップショット（時系列） */}
        {snapshots.length > 0 && (
          <Section icon={<Camera className="w-4 h-4 text-blue-500" />} title={tg.snapshotTitle}>
            <div className="space-y-3">
              {snapshots.map((s) => <GrowthSnapshotCard key={s.triggerKind} t={t} snapshot={s} />)}
            </div>
          </Section>
        )}

        {/* ⑥ 12週後に目指す姿（断定しない注記つき） */}
        <Section icon={<Target className="w-4 h-4 text-amber-500" />} title={tg.goalTitle}>
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <ul className="space-y-2">
              {COURSE_GOAL_CANDOS.map((g, i) => (
                <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                  <span className="text-amber-400 mt-0.5">◇</span>{zh ? g.zh : g.ja}
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">{tg.goalNote}</p>
          </div>
        </Section>

      </div>
    </div>
  );
};
