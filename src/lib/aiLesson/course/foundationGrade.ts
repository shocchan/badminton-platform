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

export interface ReviewCandidate { reviewTarget: string; reviewDimension: FoundationDimension; errorTag: string; suggestedInterval: 'day1' | 'day3' | 'day7'; }

/** 復習候補の導出（保存はしない・正解項目は再出題しない・§9） */
export const deriveReviewCandidates = (
  rs: { questionId: string; targetId: string; dimension: FoundationDimension; correct: boolean; hintUsed?: boolean; errorTag: string }[],
): ReviewCandidate[] => {
  const seen = new Set<string>();
  const out: ReviewCandidate[] = [];
  for (const r of rs) {
    const key = `${r.targetId}:${r.dimension}`;
    if (seen.has(key)) continue;
    if (!r.correct) { seen.add(key); out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day1' }); }
    else if (r.hintUsed) { seen.add(key); out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day3' }); }
    // 自力正解は候補にしない（不要な再出題を避ける）
  }
  return out;
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
