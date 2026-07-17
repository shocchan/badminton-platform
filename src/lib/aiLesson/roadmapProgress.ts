// ロードマップの進捗計算（すべて純関数）
// 推定アルゴリズムを将来変更しやすいよう、UI から独立させている。
// - calculateDomainProgress()    … 領域別進捗
// - calculateGoalProgress()      … 全体進捗（試験進捗と会話進捗を分離）
// - estimateRemainingMissions()  … 推定残りミッション数（範囲。断定しない）
// - estimateCompletionDate()     … 推定到達期間

import {
  LOW_RETENTION_PENALTY,
  MASTERY_ORDER,
  MASTERY_WEIGHTS,
  MISSION_ESTIMATE_SPREAD,
  WEEKS_PER_MONTH,
} from './roadmapConfig';
import type {
  CompletionEstimate,
  DomainKey,
  DomainProgress,
  GoalProgress,
  GoalRoadmap,
  MasteryState,
  MissionEstimate,
  RoadmapItem,
  RoadmapProgressState,
} from './roadmapTypes';
import type { ExpressionRecord } from './types';

const stateOf = (progress: RoadmapProgressState, itemId: string): MasteryState =>
  progress.itemStates[itemId]?.state ?? 'untouched';

const atLeast = (state: MasteryState, min: MasteryState): boolean =>
  MASTERY_ORDER.indexOf(state) >= MASTERY_ORDER.indexOf(min);

/** 領域別進捗。totalItems には未定義の残り項目も含まれる（進捗0扱い） */
export const calculateDomainProgress = (
  roadmap: GoalRoadmap,
  progress: RoadmapProgressState,
  domainKey: DomainKey,
): DomainProgress => {
  const domain = roadmap.domains.find((d) => d.key === domainKey);
  const items = roadmap.items.filter((i) => i.domain === domainKey);
  const totalItems = Math.max(domain?.totalItems ?? items.length, items.length);

  let weightSum = 0;
  let introducedCount = 0;
  let understoodCount = 0;
  let selfUsedCount = 0;
  let reviewPendingCount = 0;
  let retainedCount = 0;
  let stuckCount = 0;

  for (const item of items) {
    const state = stateOf(progress, item.id);
    weightSum += MASTERY_WEIGHTS[state];
    if (atLeast(state, 'introduced')) introducedCount += 1;
    if (atLeast(state, 'understood')) understoodCount += 1;
    if (atLeast(state, 'usedSelf')) selfUsedCount += 1;
    if (atLeast(state, 'retainedDay7')) retainedCount += 1;
    // 復習待ち: 学習済みだが翌日復習が済んでいない
    if (atLeast(state, 'introduced') && !atLeast(state, 'reviewedDay1')) reviewPendingCount += 1;
    // 苦手: 学習済みだが自力使用に届いていない
    if (atLeast(state, 'introduced') && !atLeast(state, 'usedSelf')) stuckCount += 1;
  }

  const nextItemIds = pickNextItems(items, progress, 3).map((i) => i.id);

  return {
    key: domainKey,
    totalItems,
    introducedCount,
    understoodCount,
    selfUsedCount,
    reviewPendingCount,
    retainedCount,
    progressRatio: totalItems > 0 ? weightSum / totalItems : 0,
    weaknessRatio: introducedCount > 0 ? stuckCount / introducedCount : 0,
    nextItemIds,
  };
};

/** 試験系領域（JLPT試験進捗の対象）。会話運用は含めない（12-8） */
const EXAM_DOMAINS: DomainKey[] = ['vocab', 'kanji', 'grammar', 'reading', 'listening', 'mockExam'];

/** 全体進捗。JLPT試験進捗と会話運用進捗を別々に計算する */
export const calculateGoalProgress = (
  roadmap: GoalRoadmap,
  progress: RoadmapProgressState,
): GoalProgress => {
  const domains = roadmap.domains.map((d) => calculateDomainProgress(roadmap, progress, d.key));

  const ratioOver = (keys: DomainKey[]): number | null => {
    const target = domains.filter((d) => keys.includes(d.key));
    const total = target.reduce((s, d) => s + d.totalItems, 0);
    if (total === 0) return null;
    return target.reduce((s, d) => s + d.progressRatio * d.totalItems, 0) / total;
  };

  const overallTotal = domains.reduce((s, d) => s + d.totalItems, 0);
  const overallRatio = overallTotal > 0
    ? domains.reduce((s, d) => s + d.progressRatio * d.totalItems, 0) / overallTotal
    : 0;

  // 定着進捗: 学習済み項目のうち翌日復習成功以上まで進んだ割合
  const introduced = Object.values(progress.itemStates).filter((s) => atLeast(s.state, 'introduced'));
  const retentionRatio = introduced.length > 0
    ? introduced.filter((s) => atLeast(s.state, 'reviewedDay1')).length / introduced.length
    : 0;

  return {
    overallRatio,
    // 試験トラックを持たない目標（日常会話等）では試験進捗を出さない（12-8）
    examRatio: roadmap.hasExamTrack ? ratioOver(EXAM_DOMAINS) : null,
    conversationRatio: ratioOver(['conversation']) ?? 0,
    retentionRatio,
    domains,
  };
};

/** 推定残りミッション数。「必ず合格」と断定せず範囲で返す（12-4） */
export const estimateRemainingMissions = (
  roadmap: GoalRoadmap,
  progress: RoadmapProgressState,
): MissionEstimate => {
  const goal = calculateGoalProgress(roadmap, progress);
  // 基本: 総ミッション数 ×(1 - 進捗) + 生徒ごとの補正
  const base = roadmap.estimatedTotalMissions * (1 - goal.overallRatio) + progress.remainingMissionsOffset;
  let maxFactor: number = MISSION_ESTIMATE_SPREAD.maxFactor;
  // 定着率が低いと復習のやり直しが増えるため上限を広げる
  if (goal.retentionRatio < LOW_RETENTION_PENALTY.threshold && Object.keys(progress.itemStates).length > 0) {
    maxFactor *= LOW_RETENTION_PENALTY.maxFactorBoost;
  }
  return {
    min: Math.max(Math.round(base * MISSION_ESTIMATE_SPREAD.minFactor), 0),
    max: Math.max(Math.round(base * maxFactor), 0),
  };
};

/** 推定到達期間（週あたりの学習回数から換算） */
export const estimateCompletionDate = (
  estimate: MissionEstimate,
  weeklySessions: number,
): CompletionEstimate => {
  const weekly = Math.max(weeklySessions, 1);
  const minWeeks = Math.ceil(estimate.min / weekly);
  const maxWeeks = Math.ceil(estimate.max / weekly);
  return {
    minWeeks,
    maxWeeks,
    minMonths: Math.max(Math.round(minWeeks / WEEKS_PER_MONTH), 1),
    maxMonths: Math.max(Math.round(maxWeeks / WEEKS_PER_MONTH), 1),
  };
};

// ── レッスンとの紐付け ──

const normalizeLabel = (label: string): string => label.replace(/[「」〜\s]/g, '');

/** 今日の目標表現に対応するロードマップ項目を探す */
export const findRoadmapItemForTarget = (
  roadmap: GoalRoadmap,
  targetLabel: string,
): RoadmapItem | null => {
  const normalized = normalizeLabel(targetLabel);
  return roadmap.items.find((i) => normalizeLabel(i.label) === normalized) ?? null;
};

/** レッスン結果の usage → 学習状態（初回学習でも最低 introduced にする） */
export const masteryFromUsage = (usage: ExpressionRecord['usage']): MasteryState => {
  switch (usage) {
    case 'self': return 'usedSelf';
    case 'hint': return 'usedWithHint';
    case 'learned': return 'understood';
  }
};

/** 状態は昇格のみ（既により高い定着度なら維持する） */
export const upgradeState = (current: MasteryState, candidate: MasteryState): MasteryState =>
  MASTERY_ORDER.indexOf(candidate) > MASTERY_ORDER.indexOf(current) ? candidate : current;

/** レッスン結果をロードマップ進捗へ反映した新しい状態を返す（保存は呼び出し側） */
export const applyLessonToRoadmap = (
  roadmap: GoalRoadmap,
  progress: RoadmapProgressState,
  expressions: ExpressionRecord[],
  nowISO: string,
): RoadmapProgressState => {
  const itemStates = { ...progress.itemStates };
  for (const exp of expressions) {
    const item = findRoadmapItemForTarget(roadmap, exp.label);
    if (!item) continue; // ロードマップ未収載の表現（例: 派生表現）は今回は対象外
    const prev = itemStates[item.id];
    const next = upgradeState(prev?.state ?? 'untouched', masteryFromUsage(exp.usage));
    itemStates[item.id] = {
      itemId: item.id,
      state: next,
      firstLearnedISO: prev?.firstLearnedISO ?? nowISO,
      lastUpdatedISO: nowISO,
    };
  }
  return { ...progress, itemStates };
};

/** 次に優先する項目（必須優先 → priority順。自力使用に届いていないものから） */
export const pickNextItems = (
  items: RoadmapItem[],
  progress: RoadmapProgressState,
  count: number,
): RoadmapItem[] =>
  items
    .filter((i) => !atLeast(stateOf(progress, i.id), 'usedSelf'))
    .sort((a, b) => (Number(b.required) - Number(a.required)) || (a.priority - b.priority))
    .slice(0, count);

/** 次のおすすめミッション（会話運用領域から優先的に選ぶ） */
export const pickNextMissions = (
  roadmap: GoalRoadmap,
  progress: RoadmapProgressState,
  count = 3,
): RoadmapItem[] => {
  const conv = pickNextItems(roadmap.items.filter((i) => i.domain === 'conversation'), progress, count);
  if (conv.length >= count) return conv;
  const rest = pickNextItems(roadmap.items.filter((i) => i.domain !== 'conversation'), progress, count - conv.length);
  return [...conv, ...rest];
};

/** カテゴリー内の完了数（理解以上を「完了」として数える） */
export const countCategoryProgress = (
  roadmap: GoalRoadmap,
  progress: RoadmapProgressState,
  categoryId: string,
): { done: number; total: number } => {
  const items = roadmap.items.filter((i) => i.categoryId === categoryId);
  return {
    done: items.filter((i) => atLeast(stateOf(progress, i.id), 'understood')).length,
    total: items.length,
  };
};

/** 今週（月曜はじまり）のレッスン実施数 */
export const countSessionsThisWeek = (sessionDateISOs: string[], todayISO: string): number => {
  const today = new Date(todayISO + 'T00:00:00');
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  return sessionDateISOs.filter((d) => {
    const dt = new Date(d + 'T00:00:00');
    return dt >= monday && dt <= today;
  }).length;
};
