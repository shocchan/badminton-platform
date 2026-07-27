// 学習者向けの結果モデル（Phase 2E-1.15 §2-§3）。
//
// 背景: Step4が「今日確認したことば 3／自分でできた 0／ヒントがあった 0／もう一度確認する 0」と
// 表示される例があった。クイズを間違えつつ自己評価は「覚えたと思う」だった場合で、
// 内部的には正しい。原因は **クイズ正誤と自己評価という別々の軸を、
// ひとつの合計の内訳のように並べていた** こと。
//
// そこで内部の値は一切変えずに、表示のためだけの派生モデルをここで作る。分ける軸は3つ:
//
//   軸A クイズの結果   correct / incorrect / notAnswered  … これだけが checked の完全な内訳
//   軸B 本人の感じ方   feltConfident / feltUnsure         … 別の軸（正解の代わりにしない）
//   軸C これからの予定 scheduledForReview / nextReviewDate … 別の軸
//
// 分からない値は 0 と断定せず null にする。
import type { VocabProgressRepository } from './vocabProgress';
import type { VocabSpacedReviewRepository } from './vocabSpacedReview';

export interface LearnerResult {
  /** 今日確認したことばの数 */
  checkedCount: number;
  /** 軸A: 最後の問題に正しく答えられた語 */
  correctCount: number;
  /** 軸A: 最後の問題を間違えた語 */
  incorrectCount: number;
  /** 軸A: 問題に答えていない語（カードだけ見た等） */
  notAnsweredCount: number;
  /**
   * 軸A: ヒントを使って答えた語。
   * **現在の保存データには「ヒントを使ったか」が記録されていないため常に null。**
   * 0 と書くと「ヒントを使わなかった」という別の意味になるので、断定しない。
   */
  answeredWithSupportCount: number | null;
  /** 軸B: 本人が「覚えたと思う」を選んだ語 */
  feltConfidentCount: number;
  /** 軸B: 本人が「まだ不安」を選んだ語 */
  feltUnsureCount: number;
  /** 軸C: これからの復習予定に入った語 */
  scheduledForReviewCount: number;
  /** 軸C: いちばん近い復習日（ローカル日付キー）。予定が無ければ null */
  nextReviewDate: string | null;
  /** 一部の結果を取得できなかった */
  partial: boolean;
}

/**
 * 実際に保存された値だけから結果を作る（推測しない・副作用なし）。
 * itemIds が空なら partial として返し、0件を「全部できなかった」と見せない。
 */
export const buildLearnerResult = (
  itemIds: string[],
  progress: VocabProgressRepository,
  schedule: VocabSpacedReviewRepository,
): LearnerResult => {
  if (itemIds.length === 0) {
    return {
      checkedCount: 0, correctCount: 0, incorrectCount: 0, notAnsweredCount: 0,
      answeredWithSupportCount: null, feltConfidentCount: 0, feltUnsureCount: 0,
      scheduledForReviewCount: 0, nextReviewDate: null, partial: true,
    };
  }
  let correct = 0; let incorrect = 0; let notAnswered = 0;
  let confident = 0; let unsure = 0; let scheduled = 0;
  let nextDate: string | null = null;

  for (const id of itemIds) {
    const entry = progress.getEntry(id);
    const last = entry.tests[entry.tests.length - 1];
    if (!last) notAnswered += 1;
    else if (last.correct) correct += 1;
    else incorrect += 1;

    if (entry.selfAssessment === 'self_known') confident += 1;
    if (entry.selfAssessment === 'needs_review') unsure += 1;

    const plan = schedule.get(id);
    if (plan) {
      scheduled += 1;
      if (!nextDate || plan.nextReviewAt < nextDate) nextDate = plan.nextReviewAt;
    }
  }

  return {
    checkedCount: itemIds.length,
    correctCount: correct,
    incorrectCount: incorrect,
    notAnsweredCount: notAnswered,
    answeredWithSupportCount: null,   // 保存データに無い（§3・0と断定しない）
    feltConfidentCount: confident,
    feltUnsureCount: unsure,
    scheduledForReviewCount: scheduled,
    nextReviewDate: nextDate,
    partial: false,
  };
};

/**
 * 軸Aだけが checked の完全な内訳になっていることを確かめる。
 * 表示側はこれが true のときだけ、正誤を「合計の分解」として見せてよい。
 */
export const isQuizBreakdownComplete = (r: LearnerResult): boolean =>
  r.correctCount + r.incorrectCount + r.notAnsweredCount === r.checkedCount;
