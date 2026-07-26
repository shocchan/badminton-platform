// 思い出アルバム（MVP）。既存データから毎回再構築する決定的な節目判定。
// ※確定保存された記念記録ではない: 元データ修正・削除・判定変更で表示も変わる（仕様書§10で許容）。
// 未達成は出力しない（ロック実績・進捗バー・件数煽りは作らない）。

import { cleanTurnText } from './courseChatTurn';
import { missionById } from './courseEngine';
import type { CourseSessionRecord } from './types';

export type MemoryType =
  | 'firstConversation'   // はじめて会話を最後までできた日
  | 'firstSelfUse'        // はじめて自分で表現を使えた日
  | 'firstNextDayReview'  // 翌日、もう一度思い出せた日
  | 'tenthConversation'   // 10回の会話を積み重ねた日
  | 'oneMonth'            // 日本語の旅を始めて1か月（経過事実・継続断定なし）
  | 'naturalFind';        // より自然な言い方を見つけた日（言い直し完了とは言わない・§2-1 A採用）

export interface CourseMemory {
  type: MemoryType;
  achievedAtISO: string;              // YYYY-MM-DD
  targetExpression: string | null;    // 無ければ行ごと非表示
  teacher: 'shoko' | 'yuto';
  stableKey: string;                  // type固定（各typeは最大1件）
}

const validDate = (s: string | null | undefined): string | null => {
  const d = (s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/** 有効セッション: completed・日付正・既知ミッション・id重複排除・時系列（古い順）安定ソート */
const validSessions = (sessions: CourseSessionRecord[]): CourseSessionRecord[] => {
  const seen = new Set<string>();
  return sessions
    .filter((s) => s.completionStatus === 'completed' && validDate(s.startedAt) && missionById(s.missionId))
    .filter((s) => { if (seen.has(s.id)) return false; seen.add(s.id); return true; })
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id));
};

export const deriveCourseMemories = (sessions: CourseSessionRecord[], now = new Date()): CourseMemory[] => {
  const valid = validSessions(sessions);
  if (valid.length === 0) return [];
  const out: CourseMemory[] = [];
  const push = (type: MemoryType, s: CourseSessionRecord, teacher: CourseMemory['teacher'], withExpr: boolean) => {
    const d = validDate(s.startedAt)!;
    out.push({
      type, achievedAtISO: d, teacher, stableKey: type,
      targetExpression: withExpr ? (missionById(s.missionId)?.targetExpression ?? null) : null,
    });
  };

  push('firstConversation', valid[0], 'yuto', false);

  const firstSelf = valid.find((s) => s.targetUsedIndependently);
  if (firstSelf) push('firstSelfUse', firstSelf, 'yuto', true);

  const firstDay1 = valid.find((s) => s.lessonKind === 'review_day1');
  if (firstDay1) push('firstNextDayReview', firstDay1, 'shoko', true);

  if (valid.length >= 10) push('tenthConversation', valid[9], 'yuto', false); // 10件目の実日付

  // 1か月: 経過事実のみ（「続けた」と断定しない・§2-2 A採用）。未来日付は出さない
  const first = validDate(valid[0].startedAt)!;
  const monthMark = new Date(`${first}T00:00:00Z`); monthMark.setUTCDate(monthMark.getUTCDate() + 30);
  const markISO = monthMark.toISOString().slice(0, 10);
  if (markISO <= now.toISOString().slice(0, 10)) {
    out.push({ type: 'oneMonth', achievedAtISO: markISO, targetExpression: null, teacher: 'shoko', stableKey: 'oneMonth' });
  }

  // より自然な言い方を見つけた日（corrections が実在＝振り返りで見つかった事実。擬似空値は除外）
  const firstNatural = valid.find((s) =>
    (s.report?.corrections ?? []).some((c) => cleanTurnText(c.improved) !== null));
  if (firstNatural) push('naturalFind', firstNatural, 'shoko', false);

  return out.sort((a, b) => a.achievedAtISO.localeCompare(b.achievedAtISO) || a.stableKey.localeCompare(b.stableKey)).slice(0, 6);
};
