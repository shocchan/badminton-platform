// 体験（600円）が終わった人に見せる「あなたの現在地」（2026-08-26）。
//
// 【なぜ要るか】
// 体験終了画面は、いきなり3つの値段が並ぶ価格表だった。
// 体験をやり切った直後の人が見たいのは値段ではなく、**自分が何をしたか**で、
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
  /**
   * AIに直された言い方（2026-08-26 Phase S6）。
   * レポートの corrections から、直したあとの自然な言い方だけを取る。
   * **生徒が実際に言った文（original）は出さない**（本人の失敗を並べない）。
   */
  correctedPhrases: string[];
  /** 実際に復習まで進んだ回数（予定に入っただけの数と区別する） */
  reviewsDone: number;
  /**
   * いま、いちばん練習の余地がある表現（Phase S6）。
   * 「定着しやすい」ではなく**実測で弱いところ**。判定は
   * 復習に失敗した回数 → 定着スコアの低さ の順。無ければ null。
   */
  weakestExpression: string | null;
  /** 何か1つでも見せられる中身があるか */
  hasAnything: boolean;
}

const EMPTY: TrialSummary = {
  conversations: 0, spokenSeconds: 0, saidIndependently: 0,
  expressions: [], scheduledForReview: 0, nextExpression: null,
  correctedPhrases: [], reviewsDone: 0, weakestExpression: null, hasAnything: false,
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

  /*
   * AIに直された言い方。improved（直したあと）だけを出す。
   * original（生徒が実際に言った文）は出さない。買うかどうかを決める場所で
   * 本人の失敗を並べても、続ける理由にはならない。
   */
  const correctedPhrases: string[] = [];
  for (const s2 of sessions) {
    for (const c of s2.report?.corrections ?? []) {
      const v = (c.improved || '').trim();
      if (v && !correctedPhrases.includes(v)) correctedPhrases.push(v);
    }
  }

  // 予定に入っただけの数と、実際に復習まで進んだ回数は別のもの
  const reviewsDone = sessions.filter(
    (s2) => s2.lessonKind.startsWith('review') && s2.completionStatus === 'completed',
  ).length;

  const scheduled = progress.filter((p) => p.nextReviewAt);

  /*
   * いちばん練習の余地があるところ。
   * 「定着しやすい」と言うと測っていないことを言うことになるので、
   * 実測で弱い順（復習の失敗回数 → 定着スコアの低さ）に取る。
   */
  const weakest = [...progress]
    .filter((p) => sessions.some((s2) => s2.missionId === p.itemId))
    .sort((a, b) => (b.failedReviews - a.failedReviews) || (a.masteryScore - b.masteryScore))[0] ?? null;
  const weakestExpression = weakest && (weakest.failedReviews > 0 || progress.length > 1)
    ? (sessions.find((s2) => s2.missionId === weakest.itemId)?.targetExpression ?? null)
    : null;
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
    correctedPhrases,
    reviewsDone,
    weakestExpression: weakestExpression?.trim() || null,
    hasAnything: conversations > 0 || spokenSeconds > 0 || expressions.length > 0,
  };
};

/** 「7分」のように出す。60秒未満でも0分にはしない（やったことを0にしない） */
export const spokenMinutesLabel = (seconds: number): number =>
  seconds <= 0 ? 0 : Math.max(1, Math.round(seconds / 60));
