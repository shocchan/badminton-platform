// 試験全区分のカバレッジ行列（EXAM COVERAGE CLOSURE §7・§8）。
//
// 「N2/N3受験者がシステム内で学習を完結できるか」を、
// **試験の5つの区分 × レベル** で1枚に出す。足りないものを足りないと書く。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/exam-coverage-matrix.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { readingCoverage, readingPool } from '../../src/lib/aiLesson/course/adventure/reading/readingBank';
import { listeningCoverage, listeningPool } from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';
import { vocabPool, vocabQuestionCoverage } from '../../src/lib/aiLesson/course/adventure/vocab/vocabQuestions';
import { loadGrammarPools } from '../../src/lib/aiLesson/course/adventure/advContent';
import { buildMockSpec, MOCK_REQUIREMENT } from '../../src/lib/aiLesson/course/adventure/advMock';
import { EXAM_SKILL_LABELS, OVERALL_READINESS_REQUIREMENT } from '../../src/lib/aiLesson/course/adventure/advExamSkills';

const OUT = 'docs/ai-course/adventure-v2/generated';

/** §8で掲げた到達目標。達成／未達をそのまま書く */
const TARGETS = {
  N3: { reading: [100, 120] as const, listening: [100, 100] as const },
  N2: { reading: [120, 150] as const, listening: [100, 125] as const },
};

const count = (m: Map<string, { length: number }[]> | Map<string, unknown[]>) =>
  [...m.values()].reduce((n, v) => n + (v as unknown[]).length, 0);

const run = async () => {
  const grammar = await loadGrammarPools();
  let grammarQuestions = 0;
  let vocabFromGrammarPools = 0;
  for (const qs of grammar.byItem.values()) {
    for (const q of qs) {
      if (q.skill === 'grammar') grammarQuestions += 1;
      else if (q.skill === 'charactersVocabulary') vocabFromGrammarPools += 1;
    }
  }

  const rows = (['N3', 'N2'] as const).map((level) => {
    const rc = readingCoverage(level);
    const lc = listeningCoverage(level);
    const vq = vocabQuestionCoverage(level);
    const vCount = count(vocabPool(level));
    const rCount = count(readingPool(level));
    const lCount = count(listeningPool(level));
    const t = TARGETS[level];

    const spec = buildMockSpec(level, {
      vocabCount: vCount + vocabFromGrammarPools,
      grammarCount: grammarQuestions,
      readingCount: rCount,
      listeningCount: lCount,
    });

    return {
      level,
      skills: {
        charactersVocabulary: {
          label: EXAM_SKILL_LABELS.charactersVocabulary.ja,
          activeQuestions: vCount + vocabFromGrammarPools,
          fromOriginalVocabContent: vCount,
          fromUnitQuestions: vocabFromGrammarPools,
          wordsWithContent: vq.activeWords,
          aspects: vq.byAspect,
          meetsMockMinimum: vCount + vocabFromGrammarPools >= MOCK_REQUIREMENT.vocab,
          meetsReadinessMinimum: vCount + vocabFromGrammarPools >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill,
        },
        grammar: {
          label: EXAM_SKILL_LABELS.grammar.ja,
          activeQuestions: grammarQuestions,
          meetsMockMinimum: grammarQuestions >= MOCK_REQUIREMENT.grammar,
          meetsReadinessMinimum: grammarQuestions >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill,
        },
        reading: {
          label: EXAM_SKILL_LABELS.reading.ja,
          sets: rc.total,
          activeQuestions: rCount,
          byType: rc.byType,
          target: `${t.reading[0]}〜${t.reading[1]}セット`,
          shortfall: Math.max(0, t.reading[0] - rc.total),
          meetsMockMinimum: rCount >= MOCK_REQUIREMENT.reading,
          meetsReadinessMinimum: rCount >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill,
        },
        listening: {
          label: EXAM_SKILL_LABELS.listening.ja,
          sets: lc.total,
          playable: lc.playable,
          activeQuestions: lCount,
          byType: lc.byType,
          missingAudio: lc.missingAudio.length,
          target: `${t.listening[0]}〜${t.listening[1]}セット`,
          shortfall: Math.max(0, t.listening[0] - lc.playable),
          meetsMockMinimum: lCount >= MOCK_REQUIREMENT.listening,
          meetsReadinessMinimum: lCount >= OVERALL_READINESS_REQUIREMENT.minEvidencePerSkill,
        },
        timeManagement: {
          label: EXAM_SKILL_LABELS.timeManagement.ja,
          // 時間配分は素材ではなく「時間つき模試を実施できるか」で決まる
          mockRunnable: spec.sections.length > 0,
          mockSections: spec.sections.map((s) => s.sectionId),
          mockTitleJa: spec.titleJa,
          mockReady: spec.ready,
          blockersJa: spec.blockersJa,
          requiredMockRuns: OVERALL_READINESS_REQUIREMENT.minMockCount,
        },
      },
    };
  });

  const allSkillsConnected = rows.every((r) =>
    r.skills.charactersVocabulary.meetsMockMinimum
    && r.skills.grammar.meetsMockMinimum
    && r.skills.reading.meetsMockMinimum
    && r.skills.listening.meetsMockMinimum
    && r.skills.timeManagement.mockRunnable);

  const report = {
    generatedAt: new Date().toISOString(),
    purpose: '試験の5区分（文字・語彙／文法／読解／聴解／時間配分）が、N3とN2それぞれで学習と測定に接続されているかの実測',
    rows,
    verdict: {
      allFiveSkillsConnected: allSkillsConnected,
      readingTargetMet: rows.every((r) => r.skills.reading.shortfall === 0),
      listeningTargetMet: rows.every((r) => r.skills.listening.shortfall === 0),
      note: '「接続されている」は模試の最低問題数を満たし出題経路があること。'
        + '§8の到達目標（読解100〜150・聴解100〜125セット）とは別の基準である',
    },
  };

  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/exam-coverage-matrix.json`, JSON.stringify(report, null, 1));

  for (const r of rows) {
    console.log(`── ${r.level} ──`);
    const s = r.skills;
    console.log(`  文字・語彙: ${s.charactersVocabulary.activeQuestions}問（層C ${s.charactersVocabulary.fromOriginalVocabContent} / 単元 ${s.charactersVocabulary.fromUnitQuestions}）mock=${s.charactersVocabulary.meetsMockMinimum} readiness=${s.charactersVocabulary.meetsReadinessMinimum}`);
    console.log(`  文法      : ${s.grammar.activeQuestions}問 mock=${s.grammar.meetsMockMinimum} readiness=${s.grammar.meetsReadinessMinimum}`);
    console.log(`  読解      : ${s.reading.sets}セット/${s.reading.activeQuestions}問 目標${s.reading.target} 不足${s.reading.shortfall} mock=${s.reading.meetsMockMinimum}`);
    console.log(`  聴解      : ${s.listening.playable}/${s.listening.sets}セット再生可 目標${s.listening.target} 不足${s.listening.shortfall} mock=${s.listening.meetsMockMinimum}`);
    console.log(`  時間配分  : 模試「${s.timeManagement.mockTitleJa}」 sections=${s.timeManagement.mockSections.join('/')} ready=${s.timeManagement.mockReady}`);
    if (s.timeManagement.blockersJa.length > 0) console.log(`              blockers: ${s.timeManagement.blockersJa.join(' / ')}`);
  }
  console.log('verdict', report.verdict);
};

void run();
