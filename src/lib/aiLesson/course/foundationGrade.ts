// しくみラボ 決定的採点＋軸別集計＋復習候補（Phase 2A・LLM不使用・DB書き込みなし）
import type { FoundationQuestion, FoundationDimension, FoundationSourceRef, FoundationMasteryState } from './foundationTypes';
import { mechanicOf } from './foundationTypes';

/** かな正規化: NFKC・カタカナ→ひらがな・空白（全角含む）除去。読み自体は厳密比較 */
export const normalizeKanaAnswer = (s: string): string =>
  s.normalize('NFKC').replace(/[\s\u3000]+/g, '')
    .replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

/**
 * 日本語入力の一般正規化: NFKC（全角/半角の数字・英字・記号統一）＋空白除去＋文末句読点等の除去。
 * 意味が変わる差（に/で、は/が、漢字語の別語）は正規化しない。許容回答はacceptedで問題ごとに明示する。
 */
export const normalizeJaAnswer = (s: string): string =>
  s.normalize('NFKC').replace(/[\s\u3000]+/g, '').replace(/[。、．，,.!！?？「」]/g, '');

export interface AnswerInput { choiceIndex?: number; text?: string; orderIndexes?: number[]; matchingIndexes?: number[]; }

export const judgeQuestion = (q: FoundationQuestion, a: AnswerInput): boolean => {
  const mech = mechanicOf(q.type);
  if (mech === 'choice') return a.choiceIndex === q.answerIndex;
  if (mech === 'input') {
    const norm = q.type === 'kana_input' ? normalizeKanaAnswer : normalizeJaAnswer;
    const t = norm(a.text ?? '');
    return !!t && (q.accepted ?? []).map(norm).includes(t);
  }
  if (mech === 'order') {
    const n = q.orderTokens?.length ?? 0;
    return !!a.orderIndexes && a.orderIndexes.length === n && a.orderIndexes.every((v, i) => v === i);
  }
  if (mech === 'matching') {
    const n = q.pairs?.length ?? 0;
    return !!a.matchingIndexes && a.matchingIndexes.length === n && a.matchingIndexes.every((v, i) => v === i);
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
  reviewReason: 'incorrect' | 'hint_used' | 'skipped' | 'confirm_retention' | 'retained';
  candidateState: 'due_day1' | 'due_day3' | 'confirm_day7' | 'retained';
}

/**
 * 復習候補の導出（保存はしない・§8修正版）:
 * 誤答=翌日／ヒント正解=3日後／自力正解=7日後の定着確認候補／
 * 後日の再確認でも自力正解（previouslyConfirmed）=retained候補。
 * 一度の自力正解だけでは定着と判定しない。
 */
export const deriveReviewCandidates = (
  rs: { questionId: string; targetId: string; dimension: FoundationDimension; correct: boolean; hintUsed?: boolean; skipped?: boolean; previouslyConfirmed?: boolean; errorTag: string }[],
): ReviewCandidate[] => {
  const seen = new Set<string>();
  const out: ReviewCandidate[] = [];
  for (const r of rs) {
    const key = `${r.targetId}:${r.dimension}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!r.correct && r.skipped) out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day3', reviewReason: 'skipped', candidateState: 'due_day3' });
    else if (!r.correct) out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day1', reviewReason: 'incorrect', candidateState: 'due_day1' });
    else if (r.hintUsed) out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day3', reviewReason: 'hint_used', candidateState: 'due_day3' });
    else if (r.previouslyConfirmed) out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: null, reviewReason: 'retained', candidateState: 'retained' });
    else out.push({ reviewTarget: r.targetId, reviewDimension: r.dimension, errorTag: r.errorTag, suggestedInterval: 'day7', reviewReason: 'confirm_retention', candidateState: 'confirm_day7' });
  }
  return out;
};

// --- 決定的シャッフル（questionId＋attemptSeed・§11） ---
const hashStr = (s: string): number => {
  let h = 2166136261;
  for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};
const nextRand = (state: { s: number }): number => {
  state.s = (state.s + 0x6d2b79f5) | 0;
  let t = Math.imul(state.s ^ (state.s >>> 15), 1 | state.s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const seededPermutation = (n: number, seedStr: string): number[] => {
  const idx = Array.from({ length: n }, (_, i) => i);
  const st = { s: hashStr(seedStr) };
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(nextRand(st) * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  return idx;
};

/**
 * choice選択肢の決定的表示順（questionId＋attemptSeed）。同一attempt内は再レンダーでも不変、
 * attemptが変われば順序が変わり得る。判定は表示位置ではなく元index（=安定choice ID）。
 * シャッフルの結果はそのまま使う。以前は「正解が先頭なら1つずらす」ことで
 * 先頭偏りを避けていたが、それは逆に「1番目は絶対に正解ではない」という
 * 別のヒントになるため廃止した（2026-08-29）。
 */
export const shuffledChoicesSeeded = (q: FoundationQuestion, attemptSeed: number): number[] => {
  const n = q.choices?.length ?? 0;
  return seededPermutation(n, `${q.id}:c:${attemptSeed}`);
};
/** 後方互換: attemptSeed=0の固定表示順 */
export const shuffledChoices = (q: FoundationQuestion): number[] => shuffledChoicesSeeded(q, 0);

/** sentence_orderの出題用シャッフル（正解順と同一なら1つずらす） */
export const shuffledOrderSeeded = (q: FoundationQuestion, attemptSeed: number): number[] => {
  const n = q.orderTokens?.length ?? 0;
  const idx = seededPermutation(n, `${q.id}:o:${attemptSeed}`);
  if (idx.every((v, i) => v === i) && n > 1) [idx[0], idx[1]] = [idx[1], idx[0]];
  return idx;
};
export const shuffledOrder = (q: FoundationQuestion): number[] => shuffledOrderSeeded(q, 0);

/** matching右列の表示順（正解対応と同一並びなら1つずらす） */
export const shuffledMatchingRight = (q: FoundationQuestion, attemptSeed: number): number[] => {
  const n = q.pairs?.length ?? 0;
  const idx = seededPermutation(n, `${q.id}:m:${attemptSeed}`);
  if (idx.every((v, i) => v === i) && n > 1) [idx[0], idx[1]] = [idx[1], idx[0]];
  return idx;
};

// --- Item×次元の候補状態（§12・attemptedAtはISO文字列で明示） ---
export interface AttemptRecord { correct: boolean; hintUsed?: boolean; skipped?: boolean; attemptedAt: string }
/**
 * not_seen→familiar（誤答経験）→guided（ヒント正解）→independent（自力正解）→
 * retained（別の日の再確認でも自力正解）。日付偽装をしない: 渡されたattemptedAtのみから導出。
 */
export const deriveMasteryState = (history: AttemptRecord[]): FoundationMasteryState => {
  if (history.length === 0) return 'not_seen';
  const sorted = [...history].sort((a, b) => a.attemptedAt.localeCompare(b.attemptedAt));
  const last = sorted[sorted.length - 1];
  if (!last.correct) return last.skipped ? 'guided' : 'familiar'; // 「あとで確認」は誤答と別管理（§13）
  if (last.hintUsed) return 'guided';
  const lastDay = last.attemptedAt.slice(0, 10);
  const earlierSelfCorrect = sorted.slice(0, -1).some((r) => r.correct && !r.hintUsed && r.attemptedAt.slice(0, 10) < lastDay);
  return earlierSelfCorrect ? 'retained' : 'independent';
};

/** 人間確認済みセル監査データ（テストfixture用・Excel実ファイル非依存） */
export interface AuditedCell { sheet: string; cellRange: string; value: string; isHeader?: boolean }

/**
 * exact_lexeme出典の妥当性検証（§4/§5）:
 * 列見出しセルはexact_lexeme不可。該当セルに見出し語が語彙項目として
 * 直接存在（完全一致 or 「語（対訳注記）」形式）する場合のみ有効。
 */
export const validateExactLexemeRef = (lemma: string, ref: FoundationSourceRef, audited: AuditedCell[]): boolean => {
  if (ref.sourceMatchType !== 'exact_lexeme') return false;
  if (!ref.sourceSheet || !ref.cellRange) return false;
  const hit = audited.find((a) => a.sheet === ref.sourceSheet && a.cellRange === ref.cellRange);
  if (!hit || hit.isHeader) return false;
  return hit.value === lemma || hit.value.startsWith(lemma + '（');
};
