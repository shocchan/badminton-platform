// しくみラボ 決定的採点＋軸別集計＋復習候補（Phase 2A・LLM不使用・DB書き込みなし）
import type { FoundationQuestion, FoundationDimension } from './foundationTypes';

/** かな正規化: NFKC・カタカナ→ひらがな・空白（全角含む）除去。読み自体は厳密比較 */
export const normalizeKanaAnswer = (s: string): string =>
  s.normalize('NFKC').replace(/[\s\u3000]+/g, '')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

export interface AnswerInput { choiceIndex?: number; text?: string; orderIndexes?: number[]; }

export const judgeQuestion = (q: FoundationQuestion, a: AnswerInput): boolean => {
  if (q.type === 'choice') return a.choiceIndex === q.answerIndex;
  if (q.type === 'input') {
    const t = normalizeKanaAnswer(a.text ?? '');
    return !!t && (q.accepted ?? []).map(normalizeKanaAnswer).includes(t);
  }
  if (q.type === 'order') {
    const n = q.orderTokens?.length ?? 0;
    return !!a.orderIndexes && a.orderIndexes.length === n && a.orderIndexes.every((v, i) => v === i);
  }
  return false;
};

export interface QuestionResult { questionId: string; dimension: FoundationDimension; correct: boolean; errorTag: string; targetId: string; }

export const aggregateByDimension = (rs: QuestionResult[]): Record<string, { correct: number; total: number }> => {
  const out: Record<string, { correct: number; total: number }> = {};
  for (const r of rs) {
    out[r.dimension] ??= { correct: 0, total: 0 };
    out[r.dimension].total += 1;
    if (r.correct) out[r.dimension].correct += 1;
  }
  return out;
};

export interface ReviewCandidate {
  reviewTarget: string;
  reviewDimension: FoundationDimension;
  errorTag: string;
  suggestedInterval: 'day1' | 'day3' | 'day7' | null;
  reviewReason: 'incorrect' | 'hint_used' | 'confirm_retention' | 'retained';
  candidateState: 'due_day1' | 'due_day3' | 'confirm_day7' | 'retained';
}

/**
 * 復習候補の導出（保存はしない・§8修正版）:
 * 誤答=翌日／ヒント正解=3日後／自力正解=7日後の定着確認候補／
 * 後日の再確認でも自力正解（previouslyConfirmed）=retained候補。
 * 一度の自力正解だけでは定着と判定しない。
 */
export const deriveReviewCandidates = (
  rs: { questionId: string; targetId: string; dimension: FoundationDimension; correct: boolean; hintUsed?: boolean; previouslyConfirmed?: boolean; errorTag: string }[],
): ReviewCandidate[] => {
  const seen = new Set<string>();
  const out: ReviewCandidate[] = [];
  for (const r of rs) {
    const key = `${r.targetId}:${r.dimension}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!r.correct) out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day1', reviewReason: 'incorrect', candidateState: 'due_day1' });
    else if (r.hintUsed) out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day3', reviewReason: 'hint_used', candidateState: 'due_day3' });
    else if (r.previouslyConfirmed) out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: null, reviewReason: 'retained', candidateState: 'retained' });
    else out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day7', reviewReason: 'confirm_retention', candidateState: 'confirm_day7' });
  }
  return out;
};

/**
 * choice選択肢の決定的表示順（questionIdベース・毎回同じ・正解が常に先頭にならない）。
 * 判定は表示位置ではなく元配列index（=安定choice ID）で行うこと。
 */
export const shuffledChoices = (q: FoundationQuestion): number[] => {
  const n = q.choices?.length ?? 0;
  const idx = Array.from({ length: n }, (_, i) => i);
  let seed = 7; for (const ch of q.id) seed = (seed * 33 + ch.charCodeAt(0)) % 1009;
  for (let i = n - 1; i > 0; i--) { const j = seed % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; seed = (seed * 13 + 11) % 1009; }
  // 正解(answerIndex)が表示先頭に来る場合は1つずらす（"常に先頭"の偏りを避ける）
  if (n > 1 && idx[0] === q.answerIndex) [idx[0], idx[1]] = [idx[1], idx[0]];
  return idx;
};

/** orderの出題用シャッフル（questionIdから決定的・毎回同じ並び・正解順と同一なら1つずらす） */
export const shuffledOrder = (q: FoundationQuestion): number[] => {
  const n = q.orderTokens?.length ?? 0;
  const idx = Array.from({ length: n }, (_, i) => i);
  let seed = 0; for (const ch of q.id) seed = (seed * 31 + ch.charCodeAt(0)) % 997;
  for (let i = n - 1; i > 0; i--) { const j = seed % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; seed = (seed * 17 + 7) % 997; }
  if (idx.every((v, i) => v === i) && n > 1) [idx[0], idx[1]] = [idx[1], idx[0]];
  return idx;
};
