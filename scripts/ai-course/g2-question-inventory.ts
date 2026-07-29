// G2: 監査対象の問題インベントリ（単一集計・手計算禁止の原則に従いスクリプトで数える）
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/g2-question-inventory.ts
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../../src/lib/aiLesson/course/n2GrammarDraftChunks';
import { N3_UNIT_SPECS } from '../../src/lib/aiLesson/course/quality/n3UnitSpecs';
import { buildUnitQuestions } from '../../src/lib/aiLesson/course/n3unit/unitRuntime';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';

const run = async () => {
  const pool = allVocabularyItems();

  let n2Recognition = 0, n2Production = 0, n2Missing = 0;
  let n2Items = 0;
  for (const no of N2_UNIT_FILE_NUMBERS) {
    const drafts = await loadN2DraftUnitFile(no);
    for (const d of drafts) {
      n2Items++;
      const rec = (d as unknown as Record<string, unknown>).recognition;
      const prod = (d as unknown as Record<string, unknown>).production;
      if (rec) n2Recognition++; else n2Missing++;
      if (prod) n2Production++;
    }
  }

  let n3Total = 0;
  const n3PerUnit: Record<string, number> = {};
  const seen = new Set<string>();
  for (const spec of N3_UNIT_SPECS) {
    const set = buildUnitQuestions(spec, pool);
    const ids = new Set<string>();
    for (const q of [...set.diagnostic, ...set.byStage.understand, ...set.byStage.distinguish, ...set.byStage.apply]) {
      ids.add(q.questionId);
      seen.add(q.questionId);
    }
    n3PerUnit[spec.unitId] = ids.size;
    n3Total += ids.size;
  }

  console.log(JSON.stringify({
    n2Items,
    n2Recognition,
    n2Production,
    n2MissingRecognition: n2Missing,
    n3QuestionsPerUnit: n3PerUnit,
    n3UniqueQuestionIds: seen.size,
    grandTotal: n2Recognition + seen.size,
  }, null, 1));
};

void run();
