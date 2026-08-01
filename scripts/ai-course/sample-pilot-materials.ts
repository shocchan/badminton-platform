// Paid Pilot で実際に出題される教材の抽出（PRODUCT_CANON / PILOT §12）。
//
// **全教材を再監査しない。** Pilotで学習者の目に触れる active_beta から、
// レベル・形式・難易度を分散させて決定的にサンプリングし、独立レビューへ回す。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/sample-pilot-materials.ts
// 出力: docs/ai-course/adventure-v2/generated/pilot-sample/*.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { activeContent } from '../../src/lib/aiLesson/course/adventure/vocab/vocabContent';
import { ALL_VOCAB_CONTENT } from '../../src/lib/aiLesson/course/adventure/vocab/content/vocabContentBank';
import { buildVocabQuestions } from '../../src/lib/aiLesson/course/adventure/vocab/vocabQuestions';
import { readingSetsFor } from '../../src/lib/aiLesson/course/adventure/reading/readingBank';
import { playableSets } from '../../src/lib/aiLesson/course/adventure/listening/listeningBank';
import { buildMockSpec } from '../../src/lib/aiLesson/course/adventure/advMock';

const OUT = 'docs/ai-course/adventure-v2/generated/pilot-sample';

/** 決定的な擬似乱数（同じ入力なら毎回同じサンプルになる＝再現できる） */
const rng = (seed: number) => () => {
  let s = (seed = (seed * 1664525 + 1013904223) >>> 0);
  s ^= s >>> 15;
  return (s >>> 0) / 4294967296;
};

/** 層（key）ごとに均等に取る。1つの形式・難易度に偏らせない */
const stratify = <T>(items: T[], keyOf: (t: T) => string, total: number, seed: number): T[] => {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const k = keyOf(it);
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  const keys = [...groups.keys()].sort();
  const per = Math.ceil(total / keys.length);
  const rand = rng(seed);
  const out: T[] = [];
  for (const k of keys) {
    const pool = [...(groups.get(k) ?? [])];
    // Fisher-Yates（決定的）
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    out.push(...pool.slice(0, per));
  }
  return out.slice(0, total);
};

const run = () => {
  mkdirSync(OUT, { recursive: true });
  const active = activeContent(ALL_VOCAB_CONTENT);

  // ── 語彙: N3スコープ100問・N2スコープ100問。観点×レベルで層化 ──
  for (const level of ['N3', 'N2'] as const) {
    const scope = level === 'N3' ? ['N5', 'N4', 'N3'] : ['N5', 'N4', 'N3', 'N2'];
    const inScope = active.filter((c) => scope.includes(c.level));
    const questions = inScope.flatMap((c, i) =>
      buildVocabQuestions(c, inScope, 20260801 + i * 31).map((q) => ({
        questionId: q.key,
        aspect: q.type.replace('vocab-', ''),
        sourceWord: `${c.surface}|${c.reading}`,
        wordLevel: c.level,
        difficulty: q.difficulty,
        questionJa: q.questionJa,
        questionZh: q.questionZh,
        targetJapanese: q.targetJapanese,
        choices: q.choices.map((ch) => ({ id: ch.choiceId, ja: ch.textJa, correct: ch.isCorrect })),
        explanationJa: q.explanation.whyCorrectJa,
        explanationZh: q.explanation.whyCorrectZh,
        wordGlossZh: c.glossZh,
        wordExplanationJa: c.explanationJa,
      })));
    const sample = stratify(questions, (q) => `${q.aspect}:${q.wordLevel}:${q.difficulty}`, 100, level === 'N3' ? 7717 : 9931);
    writeFileSync(`${OUT}/vocab-${level}.json`, JSON.stringify({
      level, sampledFrom: questions.length, sampleSize: sample.length,
      note: 'active_beta から観点×語レベル×難易度で層化抽出。複数正解・不自然な訳・解説の誤りを見る',
      questions: sample,
    }, null, 1));
    console.log(`vocab ${level}: ${sample.length} / ${questions.length}問から抽出`);
  }

  // ── 読解: 各20セット。形式×難易度で層化 ──
  for (const level of ['N3', 'N2'] as const) {
    const sets = readingSetsFor(level);
    const sample = stratify(sets, (s) => `${s.readingType}:${s.difficulty}`, 20, level === 'N3' ? 3313 : 5519);
    writeFileSync(`${OUT}/reading-${level}.json`, JSON.stringify({
      level, sampledFrom: sets.length, sampleSize: sample.length,
      note: '本文を読まないと解けるか・根拠が本文にあるか・複数正解・中国語の自然さを見る',
      sets: sample,
    }, null, 1));
    console.log(`reading ${level}: ${sample.length} / ${sets.length}セットから抽出`);
  }

  // ── 聴解: 各20セット。形式×難易度で層化 ──
  for (const level of ['N3', 'N2'] as const) {
    const sets = playableSets().filter((s) => s.sourceLevel === level);
    const sample = stratify(sets, (s) => `${s.listeningType}:${s.difficulty}`, 20, level === 'N3' ? 1217 : 2423);
    writeFileSync(`${OUT}/listening-${level}.json`, JSON.stringify({
      level, sampledFrom: sets.length, sampleSize: sample.length,
      note: '原稿と設問の整合・複数正解・音声で聞き取れるか（読み間違いを誘う表記）・中国語の自然さを見る',
      sets: sample,
    }, null, 1));
    console.log(`listening ${level}: ${sample.length} / ${sets.length}セットから抽出`);
  }

  // ── ミニ模試: 各1回分の仕様 ──
  for (const level of ['N3', 'N2'] as const) {
    const scope = level === 'N3' ? ['N5', 'N4', 'N3'] : ['N5', 'N4', 'N3', 'N2'];
    const vocabCount = active.filter((c) => scope.includes(c.level))
      .reduce((n, c, i) => n + buildVocabQuestions(c, active, 20260801 + i * 31).length, 0);
    const spec = buildMockSpec(level, {
      vocabCount,
      grammarCount: 400,
      readingCount: readingSetsFor(level).length,
      listeningCount: playableSets().filter((s) => s.sourceLevel === level).length,
    });
    writeFileSync(`${OUT}/mock-${level}.json`, JSON.stringify(spec, null, 1));
    console.log(`mock ${level}: sections=${spec.sections.map((s) => s.skill).join('/')}`);
  }

  console.log('→', OUT);
};

run();
