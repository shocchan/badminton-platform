// 「今回の復習」ノート（Feature 5）の純ロジック。
// 音声を使わず、既存の保存データ（Mission静的データ＋保存済みLessonReport＋本人の実発話）
// だけから組み立てる。新しいDB・発話の捏造はしない。
//
// データ源:
//  - Mission: テーマ/目標表現/読み方/中国語意味/使う場面/間違えやすい点/例文（静的）
//  - LessonReport（ai_learning_sessions.report に保存済み）: 今日のまとめ/自然な言い方/訂正/励まし
//  - 本人の実発話（ai_session_utterances）: 「自分が実際に話した例」（低信頼は除外）

import type { LessonReport, Mission } from './types';

export interface ReviewNoteExpression {
  /** 目標表現 */
  targetExpression: string;
  reading: string;
  meaningZh: string;
  /** 例文（学習者向けの簡単な例＋自然な言い方） */
  simpleExample: string;
  naturalExample: string;
  /** 使う場面 */
  usageJa: string;
  usageZh: string;
  /** 間違えやすいポイント */
  commonMistakes: string[];
  /** 本人が実際に話した例（実発話のみ。無ければ空配列） */
  myUtterances: string[];
  /** より自然な言い方（report.corrections[].improved ＋ naturalPhrases） */
  betterPhrasings: { original?: string; improved: string; noteZh?: string }[];
}

export interface ReviewNote {
  sessionId: string;
  missionId: string;
  dateISO: string;
  themeJa: string;
  themeZh: string;
  isReview: boolean;
  /** 翔子先生から一言（report 由来。無ければ既定の励まし） */
  encouragementJa: string;
  encouragementZh: string;
  /** 今日の達成（report.achievements） */
  achievements: string[];
  expression: ReviewNoteExpression;
  /** 次の復習予定（YYYY-MM-DD or null） */
  nextReviewISO: string | null;
}

const DEFAULT_ENCOURAGE_JA = '今日もよく頑張りました。';
const DEFAULT_ENCOURAGE_ZH = '今天也学得很认真！';

/** 実発話として使える最小条件（低信頼・断片・中国語のみを除外） */
const usableUtterance = (s: string): boolean => {
  const t = s.trim();
  return t.length >= 4 && /[ぁ-んァ-ヶー一-龥]/.test(t);
};

export interface BuildReviewNoteInput {
  sessionId: string;
  dateISO: string;
  mission: Mission;
  /** 保存済みレポート（AI生成 or ローカル）。無ければ最小限で組む */
  report: LessonReport | null;
  /** このセッションの本人の実発話（transcript 配列。tutor発話は含めない） */
  myUtterances: string[];
  isReview: boolean;
  nextReviewISO: string | null;
}

/**
 * 復習ノートを組み立てる（純関数・冪等）。
 * - 同じ入力からは常に同じノート（二重生成しても内容は一致）
 * - 実発話が無ければ myUtterances は空（捏造しない）
 * - report が無くても Mission 静的データで最低限成立する
 */
export const buildReviewNote = (input: BuildReviewNoteInput): ReviewNote => {
  const { mission, report } = input;
  const myUtterances = input.myUtterances.filter(usableUtterance).slice(0, 5);

  const betterPhrasings: ReviewNoteExpression['betterPhrasings'] = [];
  if (report) {
    for (const c of report.corrections) {
      if (c.improved?.trim()) betterPhrasings.push({ original: c.original, improved: c.improved, noteZh: c.noteZh });
    }
    for (const p of report.naturalPhrases) {
      if (p?.trim()) betterPhrasings.push({ improved: p });
    }
  }

  return {
    sessionId: input.sessionId,
    missionId: mission.id,
    dateISO: input.dateISO,
    themeJa: mission.titleJa,
    themeZh: mission.titleZh,
    isReview: input.isReview,
    encouragementJa: report?.encouragementJa?.trim() || report?.todaySummaryJa?.trim() || DEFAULT_ENCOURAGE_JA,
    encouragementZh: report?.todaySummaryZh?.trim() || DEFAULT_ENCOURAGE_ZH,
    achievements: report?.achievements?.filter((a) => a?.trim()) ?? [],
    expression: {
      targetExpression: mission.targetExpression,
      reading: mission.targetExpressionReading,
      meaningZh: mission.meaningZh,
      simpleExample: mission.simpleExample,
      naturalExample: mission.naturalExample,
      usageJa: mission.usageNotesJa,
      usageZh: mission.usageNotesZh,
      commonMistakes: mission.commonMistakes ?? [],
      myUtterances,
      betterPhrasings,
    },
    nextReviewISO: input.nextReviewISO,
  };
};
