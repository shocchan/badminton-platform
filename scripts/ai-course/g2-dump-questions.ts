// G2: 監査用の問題ダンプ（人が読む一次資料）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/g2-dump-questions.ts <outDir>
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../../src/lib/aiLesson/course/n2GrammarDraftChunks';
import { N3_UNIT_SPECS } from '../../src/lib/aiLesson/course/quality/n3UnitSpecs';
import { buildUnitQuestions } from '../../src/lib/aiLesson/course/n3unit/unitRuntime';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';

const outDir = process.argv[2] ?? '/tmp/g2';
mkdirSync(outDir, { recursive: true });

const run = async () => {
  // ── N2 recognition（173問）──
  const n2Lines: string[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) {
    for (const d of await loadN2DraftUnitFile(no)) {
      const r = (d as unknown as {
        grammarId: string; pattern: string; meaningJa: string;
        recognition?: { promptZh: string; options: string[]; answerIndex: number; distractorReason?: string };
      });
      const rec = r.recognition;
      if (!rec) { n2Lines.push(`${r.grammarId}\tNO_RECOGNITION`); continue; }
      n2Lines.push([
        r.grammarId, r.pattern, r.meaningJa, rec.promptZh,
        rec.options.map((o, i) => `${i === rec.answerIndex ? '◎' : '・'}${o}`).join(' ／ '),
        rec.distractorReason ?? '',
      ].join('\t'));
    }
  }
  writeFileSync(join(outDir, 'n2-recognition.tsv'), n2Lines.join('\n'));

  // ── N3 生成問題（477問）──
  const pool = allVocabularyItems();
  const n3Lines: string[] = [];
  for (const spec of N3_UNIT_SPECS) {
    const set = buildUnitQuestions(spec, pool);
    const emitted = new Set<string>();
    const all = [
      ...set.diagnostic.map(q => ({ q, ph: 'diag' })),
      ...set.byStage.understand.map(q => ({ q, ph: 'und' })),
      ...set.byStage.distinguish.map(q => ({ q, ph: 'dis' })),
      ...set.byStage.apply.map(q => ({ q, ph: 'app' })),
    ];
    for (const { q, ph } of all) {
      if (emitted.has(q.questionId)) continue;
      emitted.add(q.questionId);
      const choices = q.kind === 'order'
        ? `[並べ替え] ${(q.orderAnswer ?? q.choices).join('|')}`
        : q.choices.map((c, i) => `${i === q.answerIndex ? '◎' : '・'}${c}`).join(' ／ ');
      n3Lines.push([spec.unitId, ph, q.questionId, q.dimension, q.itemId,
        q.promptJa.replace(/\n/g, '⏎'), choices].join('\t'));
    }
  }
  writeFileSync(join(outDir, 'n3-questions.tsv'), n3Lines.join('\n'));
  console.log(`wrote ${n2Lines.length} n2 + ${n3Lines.length} n3 to ${outDir}`);
};

void run();
