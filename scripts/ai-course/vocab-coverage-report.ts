// 語彙 Coverage Report と4つの完了判定（HARVESTING POLICY §11・§12）。
//
// 表現規則: 「公式100%網羅」とは書かない。
//   「複数の主要公開語彙データを統合し、重複・意味・レベルを独自に再整理した
//     N2／N3累積語彙バンク」と表現する。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/vocab-coverage-report.ts
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type {
  CanonicalVocabWord, JlptLevelTag, VocabCompletionFlags,
} from '../../src/lib/aiLesson/course/adventure/vocab/vocabTypes';
import { ASPECT_TARGET_BY_PRIORITY } from '../../src/lib/aiLesson/course/adventure/vocab/vocabTypes';
import { ALL_VOCAB_CONTENT } from '../../src/lib/aiLesson/course/adventure/vocab/content/vocabContentBank';
import { activeContent, summarizeBatch } from '../../src/lib/aiLesson/course/adventure/vocab/vocabContent';
import { vocabQuestionCoverage } from '../../src/lib/aiLesson/course/adventure/vocab/vocabQuestions';

const OUT = 'docs/ai-course/adventure-v2/generated';
const CUMULATIVE: Record<'N3' | 'N2', JlptLevelTag[]> = {
  N3: ['N5', 'N4', 'N3'],
  N2: ['N5', 'N4', 'N3', 'N2'],
};

const run = () => {
  const p = `${OUT}/vocab-canonical.json`;
  if (!existsSync(p)) { console.error('run build-canonical-vocab.ts first'); process.exit(2); }
  const bank = JSON.parse(readFileSync(p, 'utf8')) as { words: CanonicalVocabWord[]; stats: Record<string, unknown> };
  const words = bank.words;

  const cover = (target: 'N3' | 'N2') => {
    const levels = CUMULATIVE[target];
    const inScope = words.filter((w) => levels.includes(w.independentlyAssignedLevel));
    const byLevel: Record<string, number> = {};
    for (const l of levels) byLevel[l] = inScope.filter((w) => w.independentlyAssignedLevel === l).length;
    const byPriority: Record<string, number> = {};
    for (const w of inScope) byPriority[w.priority] = (byPriority[w.priority] ?? 0) + 1;

    const uniqueExpressions = new Set(inScope.map((w) => w.canonicalSurface)).size;
    const uniqueSenses = inScope.reduce((n, w) => n + Math.max(1, w.senses.length), 0);
    // canonical fieldが揃っている＝読み・語義・レベル・根拠・優先度が埋まっている
    const canonicalComplete = inScope.filter((w) =>
      w.reading && w.senses.length > 0 && w.independentlyAssignedLevel
      && w.sourceEvidence.length > 0 && w.priority !== 'hold').length;
    // 層C（独自コンテンツ）を持つ語。canonical bank の senses ではなく層Cバンクを正準とする
    const contentKeys = new Set(activeContent(ALL_VOCAB_CONTENT).map((c) => `${c.surface}|${c.reading}`));
    const withOriginalContent = inScope.filter((w) =>
      contentKeys.has(`${w.canonicalSurface}|${w.reading}`)).length;
    const qCov = vocabQuestionCoverage(target);

    return {
      target,
      candidateLevels: byLevel,
      uniqueExpressions,
      uniqueSenses,
      core: byPriority.core ?? 0,
      likely: byPriority.likely ?? 0,
      extended: byPriority.extended ?? 0,
      hold: byPriority.hold ?? 0,
      canonicalCompleteFields: canonicalComplete,
      questionCoverageByType: qCov.byAspect,
      activeQuestions: qCov.questions,
      wordsBelowAspectTarget: qCov.belowAspectTarget.length,
      wordsWithOriginalContent: withOriginalContent,
      aspectTargetForCore: ASPECT_TARGET_BY_PRIORITY.core,
    };
  };

  const n3 = cover('N3');
  const n2 = cover('N2');

  // ── 4つの完了判定（§12）──
  const coreWords = words.filter((w) => w.priority === 'core');
  const activeKeys = new Set(activeContent(ALL_VOCAB_CONTENT).map((c) => `${c.surface}|${c.reading}`));
  const coreWithQuestions = coreWords.filter((w) =>
    activeKeys.has(`${w.canonicalSurface}|${w.reading}`)).length;
  const batches = [...new Set(ALL_VOCAB_CONTENT.map((c) => c.batchNo))]
    .map((n) => summarizeBatch(n, ALL_VOCAB_CONTENT, false));
  const flags: VocabCompletionFlags = {
    // 公開候補の収集と統合が完了（複数sourceのunion・sourceFamily統合済み）
    vocabularyHarvestComplete: words.length > 0 && (bank.stats.total as number) > 0,
    // Sense・読み・レベル・根拠の正準化が完了 = hold以外の全語でfieldが揃っている
    canonicalBankComplete: words.filter((w) => w.priority !== 'hold')
      .every((w) => w.reading && w.senses.length > 0 && w.sourceEvidence.length > 0),
    // CORE語の必要問題形式が揃っている
    coreQuestionCoverageComplete: coreWords.length > 0 && coreWithQuestions === coreWords.length,
    // N2/N3累積範囲で active question coverage が完了
    examVocabularyCoverageComplete: n2.wordsWithOriginalContent > 0
      && n2.wordsWithOriginalContent === n2.uniqueExpressions,
  };

  const warnings = {
    singleSourceFamily: words.filter((w) => w.sourceFamilyCount === 1).length,
    levelConflict: words.filter((w) => w.levelConflict !== null).length,
    lowFrequency: words.filter((w) => w.frequencyRank === 'uncommon' || w.frequencyRank === 'unknown').length,
    ambiguousSense: words.filter((w) => w.senses.length >= 3).length,
    lowConfidence: words.filter((w) => w.levelConfidence === 'low').length,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    title: '複数の主要公開語彙データを統合し、重複・意味・レベルを独自に再整理したN2／N3累積語彙バンク',
    disclaimer: '公式出題基準の100%網羅を主張するものではない。公開候補の統合と独自再判定の結果である。',
    totals: {
      canonicalWords: words.length,
      uniqueExpressions: new Set(words.map((w) => w.canonicalSurface)).size,
      uniqueReadings: new Set(words.map((w) => w.reading)).size,
      uniqueSurfaceReading: new Set(words.map((w) => `${w.canonicalSurface}|${w.reading}`)).size,
      byLevel: bank.stats.byLevel,
      byPriority: bank.stats.byPriority,
    },
    n3Cumulative: n3,
    n2Cumulative: n2,
    completion: flags,
    layerC: {
      batches,
      coreWords: coreWords.length,
      coreWithOriginalContent: coreWithQuestions,
      remainingCoreWords: coreWords.length - coreWithQuestions,
      note: '一括生成はしない。250語単位で 生成→機械検査→意味レビュー→active_beta→staging smoke を繰り返す（§6）',
    },
    warnings,
    nextStep: flags.coreQuestionCoverageComplete
      ? 'LIKELY／EXTENDEDの問題拡張へ'
      : `層C（独自の訳・例文・問題）をCORE ${coreWords.length}語から作成する。§9の順番に従い一括大量生成はしない`,
  };

  writeFileSync(`${OUT}/vocab-coverage-report.json`, JSON.stringify(report, null, 1));

  console.log(`canonical=${report.totals.canonicalWords} uniqueExpr=${report.totals.uniqueExpressions} uniqueReading=${report.totals.uniqueReadings}`);
  console.log(`N3累積: expr=${n3.uniqueExpressions} senses=${n3.uniqueSenses} core=${n3.core} likely=${n3.likely} ext=${n3.extended} hold=${n3.hold}`);
  console.log(`N2累積: expr=${n2.uniqueExpressions} senses=${n2.uniqueSenses} core=${n2.core} likely=${n2.likely} ext=${n2.extended} hold=${n2.hold}`);
  console.log('layerC', report.layerC.coreWithOriginalContent, '/', report.layerC.coreWords, 'batches', batches);
  console.log('completion', flags);
  console.log('warnings', warnings);
};

run();
