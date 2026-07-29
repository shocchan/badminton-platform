// 夜間ブラッシュアップ用: 教材ギャップの機械監査（単一集計・手計算禁止）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/material-gap-audit.ts
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';
import { levelMetaOf } from '../../src/lib/aiLesson/course/vocabularyLevelMeta';
import { contentNoteOf } from '../../src/lib/aiLesson/course/vocabContentMeta';
import { furiganaForItem } from '../../src/lib/aiLesson/course/vocabFurigana';
import { practiceForItem } from '../../src/lib/aiLesson/course/vocabConversationPractice';
import { relationsForItem } from '../../src/lib/aiLesson/course/vocabRelations';
import { N3_UNIT_SPECS } from '../../src/lib/aiLesson/course/quality/n3UnitSpecs';
import { evaluateUnitCoverage } from '../../src/lib/aiLesson/course/quality/unitCoverage';
import { cognateProfileFor } from '../../src/lib/aiLesson/course/quality/cognateProfile';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../../src/lib/aiLesson/course/n2GrammarDraftChunks';

const items = allVocabularyItems();

// ── 1) 語彙ノート系のカバレッジ（中国語話者向けの核心価値） ──
const noteGaps = { falseFriendNoNote: [] as string[], partialNoNote: [] as string[], jpSpecificNoNote: [] as string[] };
for (const it of items) {
  const meta = levelMetaOf(it.id);
  const hasAnyNote = !!it.usageNoteZh || !!contentNoteOf(it.id)?.learningFocusZh || !!meta.cognateNoteZh;
  if (meta.cognate === 'false_friend' && !hasAnyNote) noteGaps.falseFriendNoNote.push(it.id);
  if (meta.cognate === 'partial_overlap' && !hasAnyNote) noteGaps.partialNoNote.push(it.id);
  if (meta.cognate === 'japanese_specific' && !hasAnyNote) noteGaps.jpSpecificNoNote.push(it.id);
}

// ── 2) ふりがな構造化セグメント ──
const noFurigana = items.filter(i => !furiganaForItem(i.id)).map(i => i.id);

// ── 3) 会話練習（contextual scriptの有無） ──
const noPractice = items.filter(i => !practiceForItem(i.id)).map(i => i.id);

// ── 4) 類義・関係リンク ──
const noRelations = items.filter(i => relationsForItem(i.id).length === 0 && !i.antonymId).map(i => i.id);

// ── 5) N3単元: 理解止まりの語（Stage2=使い分けが1問も作れない語） ──
const distinguishGaps: Record<string, string[]> = {};
for (const spec of N3_UNIT_SPECS) {
  const r = evaluateUnitCoverage(spec, items);
  if (r.itemsWithoutDistinguish.length > 0) distinguishGaps[spec.unitId] = r.itemsWithoutDistinguish;
}

// ── 6) 高リスク語のcontrast問題数 ──
const highRisk = items.filter(i => cognateProfileFor(i).highRisk).map(i => i.id);

// ── 7) N2 drafts: フィールド完成度 ──
const n2Gaps = { noSecondExample: [] as string[], noMistakes: [] as string[], noSimilar: [] as string[], noContrast: [] as string[], noRecognition: [] as string[], noProductionPrompt: [] as string[], noExplanationZh: [] as string[], noFurigana: [] as string[], zhExampleShort: [] as string[], noLearnerFocus: [] as string[], noPractice: [] as string[] };
let n2Total = 0;
for (const n of N2_UNIT_FILE_NUMBERS) {
  const drafts = await loadN2DraftUnitFile(n);
  for (const d of drafts) {
    n2Total++;
    const g = d as unknown as Record<string, unknown>;
    if (!Array.isArray(g.examplesJa) || (g.examplesJa as string[]).length < 2) n2Gaps.noSecondExample.push(d.grammarId);
    if (!g.commonMistakesZh) n2Gaps.noMistakes.push(d.grammarId);
    if (!Array.isArray(g.similarPatterns) || (g.similarPatterns as string[]).length === 0) n2Gaps.noSimilar.push(d.grammarId);
    if (!g.contrast) n2Gaps.noContrast.push(d.grammarId);
    const rec = g.recognition as { options?: string[]; distractorReason?: string } | undefined;
    if (!rec || !Array.isArray(rec.options) || rec.options.length < 3) n2Gaps.noRecognition.push(d.grammarId);
    const prod = g.production as { promptJa?: string; expected?: string[] } | undefined;
    if (!prod || !prod.promptJa || !Array.isArray(prod.expected) || prod.expected.length === 0) n2Gaps.noProductionPrompt.push(d.grammarId);
    if (!g.explanationZh) n2Gaps.noExplanationZh.push(d.grammarId);
    if (!g.learnerFocus) n2Gaps.noLearnerFocus.push(d.grammarId);
    const prac = g.practice as { starterJa?: string } | undefined;
    if (!prac || !prac.starterJa) n2Gaps.noPractice.push(d.grammarId);
    if (!g.furigana) n2Gaps.noFurigana.push(d.grammarId);
    if (!Array.isArray(g.examplesZh) || (g.examplesZh as string[]).length < (g.examplesJa as string[]).length) (n2Gaps as Record<string, string[]>).zhExampleShort?.push(d.grammarId);
  }
}

// ── 8) 語彙: 2つ目の例文・commonForms ──
const vocabGaps = {
  noUsageNoteAny: items.filter(i => !i.usageNoteZh && !contentNoteOf(i.id)?.learningFocusZh).length,
  noCommonForms: items.filter(i => i.partOfSpeech === 'verb' && (!i.commonFormsJa || i.commonFormsJa.length === 0)).map(i => i.id),
  senses: items.filter(i => i.senses && i.senses.length > 1).length,
};

const summary = {
  vocabTotal: items.length,
  noteGaps: { falseFriend: noteGaps.falseFriendNoNote, partial: noteGaps.partialNoNote.length, partialIds: noteGaps.partialNoNote, jpSpecific: noteGaps.jpSpecificNoNote },
  furigana: { missing: noFurigana.length, ids: noFurigana.slice(0, 20) },
  practice: { missing: noPractice.length, sample: noPractice.slice(0, 10) },
  relations: { isolated: noRelations.length, sample: noRelations.slice(0, 10) },
  n3DistinguishGaps: distinguishGaps,
  highRiskCount: highRisk.length,
  n2: { total: n2Total, gaps: Object.fromEntries(Object.entries(n2Gaps).map(([k, v]) => [k, v.length])), sampleIds: Object.fromEntries(Object.entries(n2Gaps).filter(([, v]) => v.length > 0).map(([k, v]) => [k, v.slice(0, 8)])) },
  vocabGaps: { noUsageNoteAny: vocabGaps.noUsageNoteAny, verbsNoCommonForms: vocabGaps.noCommonForms.length, verbsNoCommonFormsIds: vocabGaps.noCommonForms.slice(0, 20), multiSenseItems: vocabGaps.senses },
};
console.log(JSON.stringify(summary, null, 1));
