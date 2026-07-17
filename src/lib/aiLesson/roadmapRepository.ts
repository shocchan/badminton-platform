// ロードマップの保存層（repository パターン）
// MVP: カリキュラム = 静的な仮データ（roadmapData.ts）、進捗 = localStorage。
// 将来は同じ interface のまま
//   - カリキュラム → Supabase（roadmaps / roadmap_items テーブル or 管理画面編集のJSON）
//   - 進捗       → Supabase（roadmap_progress テーブル、生徒ID単位）
// へ差し替える。UI・計算関数はこの repository 経由でのみデータへ触る。

import { DAILY_ROADMAP, N2_ROADMAP } from './roadmapData';
import type { GoalRoadmap, RoadmapGoalKey, RoadmapProgressState } from './roadmapTypes';
import type { HearingAnswers } from './types';

export interface RoadmapRepository {
  /** 目標に対応するロードマップを返す（MVPは N2 / 日常会話の2本を優先） */
  getRoadmapForGoal(goal: HearingAnswers['goal']): GoalRoadmap;
  loadProgress(goal: RoadmapGoalKey): RoadmapProgressState;
  saveProgress(state: RoadmapProgressState): void;
}

/** ヒアリングの goal → ロードマップの対応（MVPの仮マッピング）
 *  - JLPT系（n1/n3）は正式ロードマップができるまで N2 の構造を仮流用
 *  - 会話系（exchange/work）は日常会話ロードマップを仮流用 */
const resolveRoadmap = (goal: HearingAnswers['goal']): GoalRoadmap => {
  switch (goal) {
    case 'n2':
    case 'n1':
    case 'n3':
      return N2_ROADMAP;
    case 'daily':
    case 'exchange':
    case 'work':
      return DAILY_ROADMAP;
  }
};

const PREFIX = 'kawabado.aiLesson.v1.roadmap.';

const emptyProgress = (goal: RoadmapGoalKey): RoadmapProgressState => ({
  goal,
  itemStates: {},
  examDateISO: null,
  weeklyTargetSessions: null,
  remainingMissionsOffset: 0,
});

const createLocalStorageRoadmapRepository = (): RoadmapRepository => ({
  getRoadmapForGoal(goal) {
    return resolveRoadmap(goal);
  },
  loadProgress(goal) {
    try {
      const raw = localStorage.getItem(PREFIX + goal);
      if (!raw) return emptyProgress(goal);
      return { ...emptyProgress(goal), ...(JSON.parse(raw) as RoadmapProgressState) };
    } catch {
      return emptyProgress(goal);
    }
  },
  saveProgress(state) {
    try {
      localStorage.setItem(PREFIX + state.goal, JSON.stringify(state));
    } catch {
      // ストレージ不可でもデモは続行
    }
  },
});

export const roadmapRepository: RoadmapRepository = createLocalStorageRoadmapRepository();
