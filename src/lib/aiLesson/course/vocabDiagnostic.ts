// パック開始診断（Phase 2D §10・全タップ式・決定的・自己申告だけで完了しない）。
import type { FoundationItem, FoundationQuestion } from './foundationTypes';
import type { VocabularyPack, VocabularyTrack, VocabularyPackItemRole } from './vocabularyPacks';
import { roleFor } from './vocabularyPacks';
import type { VocabProgressRepository, DiagnosticState } from './vocabProgress';

/** 診断問題数（パック語数に比例させすぎない・§10） */
export const diagnosticCountFor = (pack: VocabularyPack): number =>
  Math.min(15, Math.max(8, Math.round(pack.itemIds.length / 8)));

/** 診断対象: diagnostic roleの語から決定的に選ぶ（未診断優先・ID順） */
export const pickDiagnosticItems = (
  pack: VocabularyPack, track: VocabularyTrack, itemById: Map<string, FoundationItem>, repo: VocabProgressRepository,
): FoundationItem[] => {
  const done = repo.getDiagnosticResults(pack.id);
  const candidates = pack.itemIds
    .filter((id) => roleFor(pack.id, track, id) === 'diagnostic' && !done[id] && itemById.has(id))
    .map((id) => itemById.get(id)!);
  return candidates.slice(0, diagnosticCountFor(pack));
};

/** 意味/読みを交互に確認する診断問題（決定的・誤答は同品詞の他語） */
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

/** 診断結果→role動的変換（正解=confirmed／誤答=remedial・§10） */
export const applyDiagnosticResult = (
  repo: VocabProgressRepository, packId: string, itemId: string, correct: boolean,
): DiagnosticState => {
  const state: DiagnosticState = correct ? 'confirmed' : 'remedial';
  repo.setDiagnosticResult(packId, itemId, state);
  return state;
};

/** 診断override込みの実効role */
export const effectiveRole = (
  pack: VocabularyPack, track: VocabularyTrack, itemId: string, repo: VocabProgressRepository,
): VocabularyPackItemRole | 'confirmed' => {
  const base = roleFor(pack.id, track, itemId);
  if (base !== 'diagnostic') return base;
  const d = repo.getDiagnosticResults(pack.id)[itemId];
  if (d === 'confirmed') return 'confirmed';
  if (d === 'remedial') return 'remedial';
  return base;
};

/** 3分復習の対象選定（弱点だけ・3〜7問・決定的・§25） */
export const pickQuickReviewItems = (
  allIds: string[], repo: VocabProgressRepository, max = 7,
): string[] => {
  const picked: string[] = [];
  for (const id of repo.getReviewItemIds()) if (picked.length < max && !picked.includes(id)) picked.push(id);
  for (const id of allIds) {
    if (picked.length >= max) break;
    const e = repo.getEntry(id);
    const lastWrong = e.tests.length > 0 && !e.tests[e.tests.length - 1].correct;
    if ((e.selfAssessment === 'needs_review' || lastWrong) && !picked.includes(id)) picked.push(id);
  }
  return picked.slice(0, Math.max(3, Math.min(max, picked.length)));
};
