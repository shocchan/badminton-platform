// 軽め2〜3分学習（§E-3）。API・LLM・Realtime・セッションRPCを一切使わない。
// 既存の進捗・ミッションデータから決定的に最大3問を組む。
// XP・session上限・復習登録・masteryStateには触れない（触れた気になる偽装もしない）。

import { COURSE_MISSIONS } from './courseMissionIndex.generated';
import { missionById } from './courseEngine';
import type { ItemProgress, Mission } from './types';

export interface LightItem {
  kind: 'recall' | 'meaning';           // recall=一文想起（入力） / meaning=意味3択
  missionId: string;
  source: 'review' | 'again' | 'recent';
}

/**
 * 出題を決定的に選ぶ（同じ状態→同じ出題）:
 *  1. 期日の来ている復習 最大2件（recall）
 *  2. 「もう一度」に入れた表現 1件（recall）
 *  3. 最近練習した表現 1件（meaning 3択）
 * 合計最大3問。材料が無ければ空配列（ホーム側で導線を出さない）。
 */
export const buildLightSession = (
  progress: ItemProgress[], practiceAgainIds: string[], todayISO: string,
): LightItem[] => {
  const items: LightItem[] = [];
  const used = new Set<string>();
  const add = (missionId: string, kind: LightItem['kind'], source: LightItem['source']) => {
    if (used.has(missionId) || !missionById(missionId)) return;
    used.add(missionId);
    items.push({ kind, missionId, source });
  };

  [...progress]
    .filter((p) => p.nextReviewAt && p.nextReviewAt <= todayISO && p.reviewStage !== 'none')
    .sort((a, b) => (a.nextReviewAt ?? '').localeCompare(b.nextReviewAt ?? ''))
    .slice(0, 2)
    .forEach((p) => add(p.itemId, 'recall', 'review'));

  if (practiceAgainIds[0]) add(practiceAgainIds[0], 'recall', 'again');

  [...progress]
    .filter((p) => p.lastPracticedAt)
    .sort((a, b) => (b.lastPracticedAt ?? '').localeCompare(a.lastPracticedAt ?? ''))
    .slice(0, 3)
    .forEach((p) => { if (items.length < 3) add(p.itemId, 'meaning', 'recent'); });

  return items.slice(0, 3);
};

/** 意味3択の選択肢（正解＋別ミッションの意味2つ・決定的並び） */
export const buildMeaningChoices = (mission: Mission): { choices: string[]; correctIndex: number } => {
  const others = COURSE_MISSIONS
    .filter((m) => m.id !== mission.id && m.meaningZh && m.meaningZh !== mission.meaningZh)
    .slice(0, 60);
  // ミッション番号から決定的にオフセット（ランダムなし・毎回同じ）
  const seed = mission.week * 5 + mission.order;
  const d1 = others[seed % others.length]?.meaningZh ?? '（別の意味）';
  const d2 = others[(seed + 7) % others.length]?.meaningZh ?? '（別の意味）';
  const correctIndex = seed % 3;
  const choices = [d1, d2];
  choices.splice(correctIndex, 0, mission.meaningZh);
  return { choices, correctIndex };
};

/** 一文想起の判定: 目標表現の検出regex（既存detect）にヒットすれば正解 */
export const judgeRecall = (input: string, mission: Mission): boolean => {
  const tr = input.trim();
  if (!tr) return false;
  try { return new RegExp(mission.detect).test(tr); } catch {
    return tr.includes(mission.targetExpression.replace(/[〜～]/g, ''));
  }
};
