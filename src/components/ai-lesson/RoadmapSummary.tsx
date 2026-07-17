// 目標達成ロードマップの概要カード（個別プラン画面に表示）
//
// 表示方針（実機フィードバック反映）:
// - 仮の総項目数・試算値を正式カリキュラムのように見せない。
//   大きく出すのは「現在地（公開中ミッションの進捗）・今週・次のミッション・診断状態」だけ
// - 推定残り回数は最初の数回は「診断中」、以後も週1回しか更新しない（roadmapProgress側で制御）
// - 試算領域は「試算」、未投入領域は「設計中」バッジで確度を明示する
// - N2目標では「会話だけでN2合格できる」と誤解されない注意書きを出す

import { useEffect, useMemo, useState } from 'react';
import { Map, ChevronDown, ChevronUp, Flag, CalendarDays, Stethoscope, Info } from 'lucide-react';
import { aiLessonRepository, todayISO } from '../../lib/aiLesson/repository';
import { roadmapRepository } from '../../lib/aiLesson/roadmapRepository';
import {
  calculateGoalProgress,
  countPublishedProgress,
  countSessionsThisWeek,
  estimateCompletionDate,
  getDisplayedEstimate,
  pickNextMissions,
} from '../../lib/aiLesson/roadmapProgress';
import type { AiLessonDict } from '../../locales/aiLesson';
import type { LearningPlan } from '../../lib/aiLesson/types';

interface Props {
  t: AiLessonDict;
  plan: LearningPlan;
}

const pct = (ratio: number): number => Math.round(ratio * 100);

const Bar = ({ ratio, color }: { ratio: number; color: string }) => (
  <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
    <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${Math.max(pct(ratio), ratio > 0 ? 2 : 0)}%` }} />
  </div>
);

export const RoadmapSummary = ({ t, plan }: Props) => {
  const tr = t.roadmap;
  const [expanded, setExpanded] = useState(false);

  const data = useMemo(() => {
    const roadmap = roadmapRepository.getRoadmapForGoal(plan.mainGoal);
    const progress = roadmapRepository.loadProgress(roadmap.goal);
    const goalProgress = calculateGoalProgress(roadmap, progress);
    const published = countPublishedProgress(roadmap, progress);
    const sessions = aiLessonRepository.listSessions();
    const estimate = getDisplayedEstimate(roadmap, progress, sessions.length, todayISO());
    const weeklyTarget = progress.weeklyTargetSessions ?? plan.weeklySessions;
    const weekDone = countSessionsThisWeek(sessions.map((s) => s.dateISO), todayISO());
    const nextMissions = pickNextMissions(roadmap, progress, 3);
    return { roadmap, progress, goalProgress, published, estimate, weeklyTarget, weekDone, nextMissions };
  }, [plan]);

  // 推定値を再計算した場合のみ保存（描画中に副作用を起こさない）
  useEffect(() => {
    if (data.estimate.progressToSave) {
      roadmapRepository.saveProgress(data.estimate.progressToSave);
    }
  }, [data]);

  const { roadmap, progress, goalProgress, published, weeklyTarget, weekDone, nextMissions } = data;
  const estimate = data.estimate.display;
  const nextMission = nextMissions[0] ?? null;
  const zhLocale = t.locale === 'zh';
  const publishedRatio = published.total > 0 ? published.done / published.total : 0;
  const retention = goalProgress.domains.length > 0 ? goalProgress.retentionRatio : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
      <p className="text-xs text-gray-500 flex items-center gap-1.5 mb-1">
        <Map className="w-4 h-4 text-blue-600" />
        {tr.title}
      </p>
      <p className="font-bold text-gray-900 mb-2">{zhLocale ? roadmap.labelZh : roadmap.labelJa}</p>

      {/* N2目標: 会話レッスンだけで合格できるとは誤解させない */}
      {roadmap.hasExamTrack && (
        <p className="text-xs text-gray-600 bg-blue-50 rounded-lg p-2.5 mb-3 leading-relaxed flex gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
          {tr.n2Note}
        </p>
      )}

      {/* 現在地: 公開中ミッションの進捗（実在する項目のみの正式値） */}
      <div className="mb-3">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-sm font-bold text-gray-800">{tr.currentPosition}</span>
          <span className="text-xs text-gray-500">{tr.publishedMissions}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-blue-700 tabular-nums shrink-0">
            {published.done} <span className="text-sm text-gray-400 font-medium">/ {published.total}</span>
          </span>
          <div className="flex-1"><Bar ratio={publishedRatio} color="bg-blue-600" /></div>
        </div>
      </div>

      {/* 会話運用と定着（公開中項目ベース）。JLPT試験進捗は正式項目未投入のため「設計中」 */}
      <div className="space-y-2 mb-4">
        {roadmap.hasExamTrack && (
          <div className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-gray-500">{tr.examTrack}</span>
            <span className="text-gray-400">{tr.designing}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-gray-500">{tr.conversationTrack}</span>
          <div className="flex-1"><Bar ratio={publishedRatio} color="bg-emerald-500" /></div>
          <span className="w-14 text-right font-bold text-gray-700 tabular-nums">{published.done}/{published.total}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-gray-500">{tr.retentionTrack}</span>
          <div className="flex-1"><Bar ratio={retention} color="bg-amber-500" /></div>
          <span className="w-14 text-right font-bold text-gray-700 tabular-nums">{pct(retention)}%</span>
        </div>
      </div>

      {/* 推定残り（診断中 or 週1更新の確定値）/ 今週 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-blue-50 rounded-xl p-3">
          <p className="text-[11px] text-blue-700">{tr.estimatedRemaining}</p>
          {estimate.mode === 'diagnosing' ? (
            <p className="font-bold text-gray-900 flex items-center gap-1">
              <Stethoscope className="w-4 h-4 text-blue-600" />
              {tr.diagnosing}
            </p>
          ) : (
            <p className="font-bold text-gray-900 text-lg tabular-nums">{tr.missionsRange(estimate.min, estimate.max)}</p>
          )}
        </div>
        <div className="bg-emerald-50 rounded-xl p-3">
          <p className="text-[11px] text-emerald-700">{tr.thisWeek}</p>
          <p className="font-bold text-gray-900 text-lg tabular-nums">{tr.thisWeekValue(weekDone, weeklyTarget)}</p>
        </div>
      </div>

      {estimate.mode === 'diagnosing' ? (
        <p className="text-xs text-gray-600 mb-3">{tr.diagnosingHint(estimate.sessionsUntilReady)}</p>
      ) : (
        <>
          <p className="text-xs text-gray-600 mb-1">
            {(() => {
              const completion = estimateCompletionDate({ min: estimate.min, max: estimate.max }, weeklyTarget);
              return tr.paceLine(weeklyTarget, completion.minMonths, completion.maxMonths);
            })()}
          </p>
          {/* 数値が更新された場合は理由を必ず添える */}
          <p className="text-[11px] text-gray-500 mb-3">
            {tr.updateReasons[estimate.reasonKey as keyof typeof tr.updateReasons] ?? ''}（{estimate.updatedISO}）
          </p>
        </>
      )}

      {/* 次のミッション */}
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
          {roadmap.domains.map((domain) => {
            const dp = goalProgress.domains.find((d) => d.key === domain.key);
            const publishedInDomain = countPublishedProgress(roadmap, progress, domain.key);
            return (
              <div key={domain.key}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-sm text-gray-800 flex items-center gap-1.5">
                    {tr.domains[domain.key]}
                    {domain.status === 'estimated' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tr.estimateBadge}</span>
                    )}
                    {domain.status === 'planned' && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{tr.plannedBadge}</span>
                    )}
                  </span>
                  {domain.status === 'published' && (
                    <span className="text-xs text-gray-500 tabular-nums">
                      {tr.countDone(publishedInDomain.done, publishedInDomain.total)}
                    </span>
                  )}
                </div>
                {/* 公開中の領域だけ実数の進捗バーを出す。設計中の領域は数値を前面に出さない */}
                {domain.status === 'published' ? (
                  <Bar
                    ratio={publishedInDomain.total > 0 ? publishedInDomain.done / publishedInDomain.total : 0}
                    color="bg-blue-500"
                  />
                ) : (
                  <p className="text-[11px] text-gray-400">{tr.designing}</p>
                )}
                {domain.status === 'published' && dp && dp.introducedCount > 0 && (
                  <p className="text-[10px] text-gray-400 mt-1">
                    {tr.domainLearned} {dp.introducedCount} ／ {tr.domainSelfUsed} {dp.selfUsedCount} ／ {tr.domainReviewPending} {dp.reviewPendingCount} ／ {tr.domainRetained} {dp.retainedCount}
                  </p>
                )}
              </div>
            );
          })}

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

          {/* 全体ロードマップは正式カリキュラム完成まで「設計中・試算中」扱い */}
          <p className="text-xs text-gray-500">
            {tr.overallLabel}: {tr.designing}
          </p>

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
