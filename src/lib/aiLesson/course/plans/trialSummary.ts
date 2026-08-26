// 体験（600円・60分）が終わった人に見せる「あなたの現在地」（2026-08-26）。
//
// 【なぜ要るか】
// 体験終了画面は、いきなり3つの値段が並ぶ価格表だった。
// 60分やり切った直後の人が見たいのは値段ではなく、**自分が何をしたか**で、
// 続きを買う理由もそこにしかない。「もっと機能があります」ではなく
// 「あなたはここまで来た。この続きがある」に変える。
//
// 【作り話をしない】
// 数はすべて実データから数える。0件の項目は出さない。
// 「上達しました」のような評価は書かない（測っていないものを言わない）。
import type { CourseSessionRecord, ItemProgress } from '../types';

export interface TrialSummary {
  /** 完了した会話の回数 */
  conversations: number;
  /** 実際に声に出した秒数の合計 */
  spokenSeconds: number;
  /** 目標表現を自分から使えた回数（ヒント無し） */
  saidIndependently: number;
  /** 練習した表現（重複なし・出た順） */
  expressions: string[];
  /** 復習の予定に入った表現の数（間隔をあけて再会する分） */
  scheduledForReview: number;
  /** 次に再会する予定だった表現（1つだけ。無ければ null） */
  nextExpression: string | null;
  /** 何か1つでも見せられる中身があるか */
  hasAnything: boolean;
}

const EMPTY: TrialSummary = {
  conversations: 0, spokenSeconds: 0, saidIndependently: 0,
  expressions: [], scheduledForReview: 0, nextExpression: null, hasAnything: false,
};

/**
 * 体験中にやったことをまとめる。
 * 途中で切れた会話（interrupted）も「話した時間」には数える。
 * 実際に口を動かした事実は残っているため。回数だけ completed で数える。
 */
export const buildTrialSummary = (
  sessions: CourseSessionRecord[],
  progress: ItemProgress[],
): TrialSummary => {
  if (sessions.length === 0 && progress.length === 0) return EMPTY;

  const conversations = sessions.filter((s) => s.completionStatus === 'completed').length;
  const spokenSeconds = sessions.reduce((n, s) => n + Math.max(0, s.durationSeconds || 0), 0);
  const saidIndependently = sessions.filter((s) => s.targetUsedIndependently).length;

  const expressions: string[] = [];
  for (const s of sessions) {
    const e = (s.targetExpression || '').trim();
    if (e && !expressions.includes(e)) expressions.push(e);
  }

  const scheduled = progress.filter((p) => p.nextReviewAt);
  // 「次に再会する予定だった表現」は日付が最も早いもの。表現名はセッション側にしか無い
  const soonest = [...scheduled].sort((a, b) => (a.nextReviewAt! < b.nextReviewAt! ? -1 : 1))[0] ?? null;
  const nextExpression = soonest
    ? (sessions.find((s) => s.missionId === soonest.itemId)?.targetExpression ?? null)
    : null;

  return {
    conversations,
    spokenSeconds,
    saidIndependently,
    expressions,
    scheduledForReview: scheduled.length,
    nextExpression: nextExpression?.trim() || null,
    hasAnything: conversations > 0 || spokenSeconds > 0 || expressions.length > 0,
  };
};

/** 「7分」のように出す。60秒未満でも0分にはしない（やったことを0にしない） */
export const spokenMinutesLabel = (seconds: number): number =>
  seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60));
