// わたしの日本語ノート（MVP・§Avatar 1B）。実データのみから決定的にページを組む。
// 完了セッションだけを対象（interrupted/error/in_progressは除外）。偽造・架空文言なし。

import { cleanTurnText } from './courseChatTurn';
import { missionById, isReviewKind } from './courseEngine';
import type { CourseSessionRecord, ItemProgress } from './types';

export interface NotebookEntry {
  dateISO: string;            // YYYY-MM-DD（startedAt由来・不正日付は除外）
  sessionId: string;
  themeJa: string; themeZh: string;
  targetExpression: string;
  usage: 'self' | 'hint' | 'none';
  isReview: boolean;
  /** 言い直した表現（correction.improved・無ければnull＝行ごと非表示） */
  retriedText: string | null;
  nextReviewISO: string | null;
  durationMin: number;
  /** 先生（復習=翔子/新規=悠斗）と決定的な一言のキー */
  teacher: 'shoko' | 'yuto';
  lineKey: 'self' | 'retried' | 'hint' | 'kept';
}

const validDate = (s: string | null | undefined): string | null => {
  const d = (s ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
};

/** 先生の一言キー（決定的: 同じデータ→同じ文言。再レンダーで変わらない） */
export const teacherLineKey = (s: { targetUsedIndependently: boolean; targetUsed: boolean; hasRetry: boolean }): NotebookEntry['lineKey'] => {
  if (s.targetUsedIndependently) return 'self';
  if (s.hasRetry) return 'retried';
  if (s.targetUsed) return 'hint';
  return 'kept';
};

export const buildNotebook = (sessions: CourseSessionRecord[], progress: ItemProgress[]): NotebookEntry[] => {
  return sessions
    .filter((s) => s.completionStatus === 'completed')      // 未完了・中断・エラーは載せない
    .map((s): NotebookEntry | null => {
      const dateISO = validDate(s.startedAt);
      const mission = missionById(s.missionId);
      if (!dateISO || !mission) return null;                 // 不正日付・不明ミッション除外
      const correction = s.report?.corrections?.[0];
      const retriedText = cleanTurnText(correction?.improved ?? null);
      const prog = progress.find((p) => p.itemId === s.missionId);
      const usage: NotebookEntry['usage'] = s.targetUsedIndependently ? 'self' : s.targetUsed ? 'hint' : 'none';
      const isReview = isReviewKind(s.lessonKind);
      return {
        dateISO, sessionId: s.id,
        themeJa: mission.titleJa, themeZh: mission.titleZh,
        targetExpression: mission.targetExpression,
        usage, isReview, retriedText,
        nextReviewISO: validDate(prog?.nextReviewAt ?? null),
        durationMin: Math.max(1, Math.round((s.durationSeconds || 0) / 60)),
        teacher: isReview ? 'shoko' : 'yuto',
        lineKey: teacherLineKey({ targetUsedIndependently: s.targetUsedIndependently, targetUsed: s.targetUsed, hasRetry: !!retriedText }),
      };
    })
    .filter((e): e is NotebookEntry => e !== null)
    .sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.sessionId.localeCompare(a.sessionId)); // 新しい順で安定
};

/** 日付ごとにまとめる（学習していない日は存在しない＝ページを作らない） */
export const groupByDate = (entries: NotebookEntry[]): { dateISO: string; entries: NotebookEntry[] }[] => {
  const map = new Map<string, NotebookEntry[]>();
  for (const e of entries) {
    if (!map.has(e.dateISO)) map.set(e.dateISO, []);
    map.get(e.dateISO)!.push(e);
  }
  return [...map.entries()].map(([dateISO, es]) => ({ dateISO, entries: es }));
};
