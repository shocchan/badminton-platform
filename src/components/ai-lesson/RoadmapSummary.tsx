// 目標達成ロードマップの概要カード（個別プラン画面に表示）
// スマホで情報過多にならないよう、最初は「全体進捗・推定残り・今週・次のミッション」だけを
// 大きく表示し、領域別の詳細はタップで開く（12-5）。
// データはすべて roadmapRepository / roadmapProgress 経由（UIに項目数をハードコードしない）。

import { useMemo, useState } from 'react';
import { Map, ChevronDown, ChevronUp, Flag, CalendarDays } from 'lucide-react';
import { aiLessonRepository, todayISO } from '../../lib/aiLesson/repository';
import { roadmapRepository } from '../../lib/aiLesson/roadmapRepository';
import {
  calculateGoalProgress,
  countSessionsThisWeek,
  estimateCompletionDate,
  estimateRemainingMissions,
  pickNextMissions,
} from '../../lib/aiLesson/roadmapProgress';
import { WEAKNESS_BADGE_THRESHOLD } from '../../lib/aiLesson/roadmapConfig';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { LearningPlan } from '../../lib/aiLesson/types';

interface Props {
  t: AiLessonDict;
  plan: LearningPlan;
}

const pct = (ratio: number): number => Math.round(ratio * 100);

const Bar = ({ ratio, color }: { ratio: number; color: string }) => (
  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
    <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.max(pct(ratio), 1)}%` }} />
  </div>
);

export const RoadmapSummary = ({ t, plan }: Props) => {
  const tr = t.roadmap;
  const [expanded, setExpanded] = useState(false);

  const data = useMemo(() => {
    const roadmap = roadmapRepository.getRoadmapForGoal(plan.mainGoal);
    const progress = roadmapRepository.loadProgress(roadmap.goal);
    const goalProgress = calculateGoalProgress(roadmap, progress);
    const remaining = estimateRemainingMissions(roadmap, progress);
    const weeklyTarget = progress.weeklyTargetSessions ?? plan.weeklySessions;
    const completion = estimateCompletionDate(remaining, weeklyTarget);
    const weekDone = countSessionsThisWeek(
      aiLessonRepository.listSessions().map((s) => s.dateISO),
      todayISO(),
    );
    const nextMissions = pickNextMissions(roadmap, progress, 3);
    return { roadmap, progress, goalProgress, remaining, completion, weeklyTarget, weekDone, nextMissions };
  }, [plan]);

  const { roadmap, progress, goalProgress, remaining, completion, weeklyTarget, weekDone, nextMissions } = data;
  const roadmapLabel = tr.title;
  const nextMission = nextMissions[0] ?? null;
  const zhLocale = t.locale === 'zh';

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-1">
        <Map className="w-4 h-4 text-blue-600" />
        {roadmapLabel}
      </p>
      <p className="font-bold text-gray-900 mb-3">{zhLocale ? roadmap.labelZh : roadmap.labelJa}</p>

      {/* 全体進捗（大きく表示） */}
      <div className="mb-3">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm font-bold text-gray-800">{tr.overall}</span>
          <span className="text-2xl font-bold text-blue-700 tabular-nums">{pct(goalProgress.overallRatio)}%</span>
        </div>
        <Bar ratio={goalProgress.overallRatio} color="bg-blue-600" />
      </div>

      {/* 試験進捗と会話進捗は分離して表示（12-8） */}
      <div className="space-y-2 mb-4">
        {goalProgress.examRatio !== null && (
          <div className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-gray-500">{tr.examTrack}</span>
            <div className="flex-1"><Bar ratio={goalProgress.examRatio} color="bg-indigo-500" /></div>
            <span className="w-9 text-right font-bold text-gray-700 tabular-nums">{pct(goalProgress.examRatio)}%</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-gray-500">{tr.conversationTrack}</span>
          <div className="flex-1"><Bar ratio={goalProgress.conversationRatio} color="bg-emerald-500" /></div>
          <span className="w-9 text-right font-bold text-gray-700 tabular-nums">{pct(goalProgress.conversationRatio)}%</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-gray-500">{tr.retentionTrack}</span>
          <div className="flex-1"><Bar ratio={goalProgress.retentionRatio} color="bg-amber-500" /></div>
          <span className="w-9 text-right font-bold text-gray-700 tabular-nums">{pct(goalProgress.retentionRatio)}%</span>
        </div>
      </div>

      {/* 推定残り / 今週（大きく表示） */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-[11px] text-blue-700">{tr.estimatedRemaining}</p>
          <p className="font-bold text-gray-900 text-lg tabular-nums">{tr.missionsRange(remaining.min, remaining.max)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <p className="text-[11px] text-emerald-700">{tr.thisWeek}</p>
          <p className="font-bold text-gray-900 text-lg tabular-nums">{tr.thisWeekValue(weekDone, weeklyTarget)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-600 mb-3">{tr.paceLine(weeklyTarget, completion.minMonths, completion.maxMonths)}</p>

      {/* 次のミッション（大きく表示） */}
      {nextMission && (
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl p-3 text-white mb-3">
          <p className="text-[11px] text-amber-50 flex items-center gap-1">
            <Flag className="w-3.5 h-3.5" />
            {tr.nextMission}
          </p>
          <p className="font-bold">{nextMission.label}</p>
          {zhLocale && nextMission.zhMeaning && (
            <p className="text-xs text-amber-50 mt-0.5">{nextMission.zhMeaning}</p>
          )}
        </div>
      )}

      <p className="text-[10px] text-gray-400 mb-2">{tr.estimateNote}</p>

      {/* 領域別の詳細（タップで開閉） */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full min-h-11 py-2 text-sm font-medium text-blue-700 rounded-xl hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"
      >
        {expanded ? tr.hideDomains : tr.showDomains}
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="mt-2 pt-3 border-t border-gray-100 space-y-3">
          {goalProgress.domains.map((d) => (
            <div key={d.key}>
              <div className="flex justify-between items-baseline mb-1">
                <span className="text-sm text-gray-800 flex items-center gap-1.5">
                  {tr.domains[d.key]}
                  {d.introducedCount > 0 && d.weaknessRatio >= WEAKNESS_BADGE_THRESHOLD && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-600">{tr.weakBadge}</span>
                  )}
                </span>
                <span className="text-xs text-gray-500 tabular-nums">
                  {tr.countDone(d.introducedCount, d.totalItems)}（{pct(d.progressRatio)}%）
                </span>
              </div>
              <Bar ratio={d.progressRatio} color="bg-blue-500" />
              {d.introducedCount > 0 && (
                <p className="text-[10px] text-gray-400 mt-1">
                  {tr.domainLearned} {d.introducedCount} ／ {tr.domainSelfUsed} {d.selfUsedCount} ／ {tr.domainReviewPending} {d.reviewPendingCount} ／ {tr.domainRetained} {d.retainedCount}
                </p>
              )}
            </div>
          ))}

          {/* 次の3ミッション */}
          {nextMissions.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1.5">{tr.next3}</p>
              <ol className="space-y-1">
                {nextMissions.map((m, i) => (
                  <li key={m.id} className="text-sm text-gray-800 flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                      {i + 1}
                    </span>
                    {m.label}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* 試験予定日（未設定なら「未設定」。将来管理画面/設定から変更） */}
          <p className="text-xs text-gray-500 flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {tr.examDate}: {progress.examDateISO ?? tr.examDateNotSet}
          </p>
        </div>
      )}
    </div>
  );
};
