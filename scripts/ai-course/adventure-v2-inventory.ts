// Adventure V2 Phase 1: 実データからの正準インベントリ再集計。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/adventure-v2-inventory.ts
// 出力: docs/ai-course/adventure-v2/generated/inventory.json（単一情報源・手計算禁止）
import { writeFileSync, mkdirSync } from 'node:fs';
import { N2_GRAMMAR_INDEX } from '../../src/lib/aiLesson/course/n2GrammarIndex';
import { N2_GRAMMAR_ALIASES } from '../../src/lib/aiLesson/course/n2GrammarAliases';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../../src/lib/aiLesson/course/n2GrammarDraftChunks';
import { N3_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n3GrammarDrafts';
import { N3_UNIT_SPECS } from '../../src/lib/aiLesson/course/quality/n3UnitSpecs';
import { buildUnitQuestions } from '../../src/lib/aiLesson/course/n3unit/unitRuntime';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';
import { WORLD_AREAS } from '../../src/lib/aiLesson/course/rpg/worldAtlas';
import { CHAPTERS } from '../../src/lib/aiLesson/course/rpg/chapterRegistry';

const run = async () => {
  const aliasIds = new Set(Object.keys(N2_GRAMMAR_ALIASES));

  // N2: canonical = index - aliases
  const n2Index = N2_GRAMMAR_INDEX;
  const n2Canonical = n2Index.filter((i) => !aliasIds.has(i.grammarId));
  const n2ByReview: Record<string, number> = {};
  for (const i of n2Canonical) n2ByReview[i.reviewStatus] = (n2ByReview[i.reviewStatus] ?? 0) + 1;

  // N2 drafts本文: recognition問題数（バトル用プール実数）
  let n2DraftCount = 0;
  let n2WithRecognition = 0;
  let n2RecognitionQuestions = 0;
  const n2QuestionsPerItem: Record<string, number> = {};
  for (const no of N2_UNIT_FILE_NUMBERS) {
    for (const d of await loadN2DraftUnitFile(no)) {
      const r = d as unknown as { grammarId: string; recognition?: { options: string[] } };
      n2DraftCount += 1;
      const n = r.recognition ? 1 : 0;
      n2WithRecognition += n;
      n2RecognitionQuestions += n;
      n2QuestionsPerItem[r.grammarId] = n;
    }
  }

  // N3 grammar drafts
  const n3Grammar = N3_GRAMMAR_DRAFTS;
  const n3GrammarByStatus: Record<string, number> = {};
  for (const g of n3Grammar as unknown as { reviewStatus?: string; status?: string }[]) {
    const s = g.reviewStatus ?? g.status ?? 'unknown';
    n3GrammarByStatus[s] = (n3GrammarByStatus[s] ?? 0) + 1;
  }

  // 語彙
  const vocab = allVocabularyItems();
  const vocabByLevel: Record<string, number> = {};
  for (const v of vocab as unknown as { levelTag?: string }[]) {
    const t = v.levelTag ?? 'untagged';
    vocabByLevel[t] = (vocabByLevel[t] ?? 0) + 1;
  }

  // N3 units + 生成問題プール
  const unitQuestionCounts: Record<string, { total: number; diagnostic: number; understand: number; distinguish: number; apply: number }> = {};
  let n3QuestionTotal = 0;
  for (const spec of N3_UNIT_SPECS) {
    const set = buildUnitQuestions(spec, vocab);
    const ids = new Set<string>();
    const count = (qs: { questionId: string }[]) => qs.filter((q) => !ids.has(q.questionId) && (ids.add(q.questionId), true)).length;
    const diagnostic = count(set.diagnostic);
    const understand = count(set.byStage.understand);
    const distinguish = count(set.byStage.distinguish);
    const apply = count(set.byStage.apply);
    unitQuestionCounts[spec.unitId] = { total: ids.size, diagnostic, understand, distinguish, apply };
    n3QuestionTotal += ids.size;
  }

  // World
  const areas = WORLD_AREAS.map((a) => ({ id: a.id, nameJa: (a as unknown as { nameJa?: string; name?: string }).nameJa ?? (a as unknown as { name?: string }).name }));
  const chapters = CHAPTERS.map((c) => ({ id: c.id, quests: (c as unknown as { quests?: unknown[] }).quests?.length ?? 0 }));

  const out = {
    generatedAt: new Date().toISOString(),
    n2: {
      indexTotal: n2Index.length,
      canonical: n2Canonical.length,
      aliases: aliasIds.size,
      identity: `${n2Canonical.length} + ${aliasIds.size} = ${n2Index.length}`,
      byReviewStatus: n2ByReview,
      draftBodies: n2DraftCount,
      withRecognitionQuestion: n2WithRecognition,
      recognitionQuestions: n2RecognitionQuestions,
      itemsWithZeroQuestions: Object.entries(n2QuestionsPerItem).filter(([, n]) => n === 0).map(([id]) => id),
      battlePoolGap: 'N2は1項目1問（recognition）のみ。§18の複数variant要件に対する最大ギャップ',
    },
    n3: {
      grammarDrafts: n3Grammar.length,
      grammarByStatus: n3GrammarByStatus,
      units: N3_UNIT_SPECS.length,
      unitIds: N3_UNIT_SPECS.map((s) => s.unitId),
      generatedQuestionTotal: n3QuestionTotal,
      unitQuestionCounts,
    },
    vocabulary: {
      total: vocab.length,
      byLevelTag: vocabByLevel,
    },
    world: { areas: areas.length, areaList: areas, chapters: chapters.length, chapterQuests: chapters },
  };

  mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });
  writeFileSync('docs/ai-course/adventure-v2/generated/inventory.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify({
    n2: out.n2.identity, n2Questions: n2RecognitionQuestions,
    n3Grammar: n3Grammar.length, n3Units: N3_UNIT_SPECS.length, n3Questions: n3QuestionTotal,
    vocab: vocab.length, areas: areas.length, chapters: chapters.length,
  }));
};

void run();
