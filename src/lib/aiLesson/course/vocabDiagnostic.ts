// パック開始診断（Phase 2D §10／Phase 2E-1 §4-§6・全タップ式・決定的・自己申告だけで完了しない）。
// 次元別（reading/meaning/usage/collocation/particle/conjugation）に確認し、
// reading+meaning確認=basic_confirmed／一部のみ=partially_confirmed／誤答あり=remedial。
// 診断1回の正解でItem全体を「習得済み」にしない（§4）。
import type { FoundationItem, FoundationQuestion } from './foundationTypes';
import type { VocabularyPack, VocabularyTrack, VocabularyPackItemRole } from './vocabularyPacks';
import { roleFor } from './vocabularyPacks';
import type { VocabProgressRepository, VocabQuestionDimension, DiagnosticOutcome } from './vocabProgress';
import { poolQuestionsFor, relatedItemsOf } from './vocabDiagnosticPool';
import type { VocabPoolQuestion } from './vocabDiagnosticPool';

/** 診断問題数（§5: 基礎10〜15問・N3 12〜18問。語数に比例させすぎない） */
export const diagnosticCountFor = (pack: VocabularyPack): number => {
  const [min, max] = pack.id === 'pack-n3-prep-1' ? [12, 18] : [10, 15];
  return Math.min(max, Math.max(min, Math.round(pack.itemIds.length / 6)));
};

/** 診断対象: diagnostic roleの語から決定的に選ぶ（未診断優先・ID順） */
export const pickDiagnosticItems = (
  pack: VocabularyPack, track: VocabularyTrack, itemById: Map<string, FoundationItem>, repo: VocabProgressRepository,
): FoundationItem[] => {
  const done = repo.getDiagnosticOutcomes(pack.id);
  return pack.itemIds
    .filter((id) => roleFor(pack.id, track, id) === 'diagnostic' && !done[id] && itemById.has(id))
    .map((id) => itemById.get(id)!);
};

/** 生成問題（読み/意味・決定的・誤答は同品詞の他語）。プールに無いItemの充填用 */
export const buildDiagnosticQuestion = (item: FoundationItem, pool: FoundationItem[], index: number): FoundationQuestion => {
  const useReading = index % 2 === 1;
  const others: string[] = [];
  const cands = pool.filter((i) => i.id !== item.id && i.partOfSpeech === item.partOfSpeech);
  let s = index * 17 + 5;
  while (others.length < 2 && cands.length > 1) {
    s = (s * 29 + 3) % 997;
    const c = useReading ? cands[s % cands.length].readingKana : cands[s % cands.length].meaningZh;
    const self = useReading ? item.readingKana : item.meaningZh;
    if (!others.includes(c) && c !== self) others.push(c);
  }
  return {
    id: `diag-${item.id}-${useReading ? 'r' : 'm'}`,
    targetItemId: item.id,
    dimension: useReading ? 'reading' : 'meaning',
    type: useReading ? 'reading_choice' : 'single_choice',
    promptJa: useReading ? `「${item.displayForm}」の読みは？` : `「${item.displayForm}」の意味は？`,
    promptZh: useReading ? `「${item.displayForm}」怎么读？` : `「${item.displayForm}」的意思是？`,
    choices: [useReading ? item.readingKana : item.meaningZh, ...others],
    answerIndex: 0,
    explanationJa: `${item.displayForm}（${item.readingKana}）＝${item.meaningZh}`,
    explanationZh: `${item.displayForm}（${item.readingKana}）＝${item.meaningZh}`,
    errorTag: `diag_${item.id}`,
    review: 'draft',
  };
};

export interface DiagnosticSetQuestion { itemId: string; vocabDimension: VocabQuestionDimension; q: FoundationQuestion }

/**
 * 診断セットの決定的構成（§5）:
 * 対象=diagnostic roleの未診断Item。プール（用法・助詞・活用・自他・類義・false friend）を優先し、
 * プールに無いItemは生成問題（読み/意味）で充填。1Item最大2問・全体はパック別の問題数レンジ。
 */
export const buildDiagnosticSet = (
  pack: VocabularyPack, track: VocabularyTrack, itemById: Map<string, FoundationItem>, repo: VocabProgressRepository,
  allItems: FoundationItem[],
): DiagnosticSetQuestion[] => {
  const targets = pickDiagnosticItems(pack, track, itemById, repo);
  const targetIds = new Set(targets.map((t) => t.id));
  const total = diagnosticCountFor(pack);
  const perItem = new Map<string, number>();
  const out: DiagnosticSetQuestion[] = [];
  const push = (itemId: string, vocabDimension: VocabQuestionDimension, question: FoundationQuestion) => {
    if (out.length >= total) return;
    const n = perItem.get(itemId) ?? 0;
    if (n >= 2) return;
    if (out.some((x) => x.q.id === question.id)) return;  // 重複問題なし
    perItem.set(itemId, n + 1);
    out.push({ itemId, vocabDimension, q: question });
  };
  // ①プール問題（定義順=読み→意味→用法系。transparent語の読み優先・false friendの意味/用法優先はプール構成で担保）
  const poolQs: VocabPoolQuestion[] = poolQuestionsFor(pack.id).filter((p) => targetIds.has(p.itemId));
  for (const p of poolQs) push(p.itemId, p.vocabDimension, p.q);
  // ②プールに1問も無いItemを生成問題で充填（読み/意味交互）
  targets.forEach((item, i) => {
    if (!perItem.has(item.id)) {
      const g = buildDiagnosticQuestion(item, allItems, i);
      push(item.id, g.dimension === 'reading' ? 'reading' : 'meaning', g);
    }
  });
  // ③まだ枠が余っていれば2問目（別次元）を追加
  targets.forEach((item, i) => {
    if (out.length >= total) return;
    if ((perItem.get(item.id) ?? 0) === 1) {
      const used = out.find((x) => x.itemId === item.id)!.vocabDimension;
      const g = buildDiagnosticQuestion(item, allItems, used === 'reading' ? i * 2 : i * 2 + 1);
      if ((g.dimension === 'reading' ? 'reading' : 'meaning') !== used) push(item.id, g.dimension === 'reading' ? 'reading' : 'meaning', g);
    }
  });
  return out;
};

/**
 * 診断回答の反映（§6）: 次元別に記録し、Item全体の結果はRepositoryが導出。
 * supported=補助あり正解（直後のカード表示後など）。診断ではconfirmed/needs_reviewのみ使う。
 */
export const applyDiagnosticAnswer = (
  repo: VocabProgressRepository, packId: string, itemId: string,
  dimension: VocabQuestionDimension, correct: boolean,
): DiagnosticOutcome => {
  repo.recordDiagnosticDimension(packId, itemId, dimension, correct ? 'confirmed' : 'needs_review');
  repo.recordTest(itemId, dimension, correct);
  return repo.getDiagnosticOutcomes(packId)[itemId] ?? 'diagnostic';
};

/** 診断override込みの実効role（basic_confirmed=確認済み／partially=引き続き確認／誤答=remedial） */
export const effectiveRole = (
  pack: VocabularyPack, track: VocabularyTrack, itemId: string, repo: VocabProgressRepository,
): VocabularyPackItemRole | 'confirmed' | 'partially_confirmed' => {
  const base = roleFor(pack.id, track, itemId);
  if (base !== 'diagnostic') return base;
  const d = repo.getDiagnosticOutcomes(pack.id)[itemId];
  if (d === 'basic_confirmed') return 'confirmed';
  if (d === 'partially_confirmed') return 'partially_confirmed';
  if (d === 'remedial') return 'remedial';
  return base;
};

/**
 * 3分復習の対象選定（§25／2E-1 §5: 誤答Itemの関連語（自他ペア等）も候補へ追加・3〜7問・決定的）。
 * basic_confirmedでも「まだ不安」・誤答があれば再表示される（永久除外しない・§6）。
 */
export const pickQuickReviewItems = (
  allIds: string[], repo: VocabProgressRepository, max = 7,
): string[] => {
  const picked: string[] = [];
  const idSet = new Set(allIds);
  const add = (id: string) => { if (picked.length < max && idSet.has(id) && !picked.includes(id)) picked.push(id); };
  const wrongIds: string[] = [];
  for (const id of repo.getReviewItemIds()) { add(id); wrongIds.push(id); }
  for (const id of allIds) {
    const e = repo.getEntry(id);
    const lastWrong = e.tests.length > 0 && !e.tests[e.tests.length - 1].correct;
    if (e.selfAssessment === 'needs_review' || lastWrong) { add(id); if (lastWrong) wrongIds.push(id); }
  }
  // 誤答した語の関連Item（自他ペア等）を候補の後方へ（結果はでっち上げない・候補としてのみ）
  for (const w of wrongIds) for (const rel of relatedItemsOf(w)) add(rel);
  return picked.slice(0, Math.max(3, Math.min(max, picked.length)));
};
