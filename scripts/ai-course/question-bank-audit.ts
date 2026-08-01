// 問題バンク監査（CEO向け）。
//
// 目的は教材追加ではなく、**既存バンクの内容と全体構成を人間が効率よく確認できるようにする**こと。
//
// いちばん大事な点:
//   報告されている「CORE 10,112」「N3 10,804」「N2 11,165」を**単純合計してはいけない**。
//   N3スコープ（N5+N4+N3）は N2スコープ（N5+N4+N3+N2）の**部分集合**なので、
//   足すと同じ問題を二重に数える。questionId で集合演算して unique を出す。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/question-bank-audit.ts
// 出力: docs/ai-course/adventure-v2/generated/question-bank/
import { writeFileSync, mkdirSync } from 'node:fs';
import type { AdvBattleQuestion } from '../../src/lib/aiLesson/course/adventure/advVariants';
import { vocabPool } from '../../src/lib/aiLesson/course/adventure/vocab/vocabQuestions';
import { loadGrammarPools } from '../../src/lib/aiLesson/course/adventure/advContent';
import { ALL_VOCAB_CONTENT } from '../../src/lib/aiLesson/course/adventure/vocab/content/vocabContentBank';
import { activeContent } from '../../src/lib/aiLesson/course/adventure/vocab/vocabContent';
import {
  analyzeQuestion, type QuestionWarning,
} from '../../src/lib/aiLesson/course/adventure/questionAudit';

const OUT = 'docs/ai-course/adventure-v2/generated/question-bank';

/** 監査行。CSV・監査コンソールの両方でこの形を使う */
export interface AuditRow {
  questionId: string;
  bank: 'core-vocabulary' | 'unit-vocabulary' | 'unit-grammar';
  inN3: boolean;
  inN2: boolean;
  targetLevel: string;
  prerequisiteLevel: string;
  routeRole: string;
  readinessContribution: string;
  skill: string;
  questionType: string;
  sourceSenseId: string;
  targetWord: string;
  reading: string;
  questionJa: string;
  questionZh: string;
  choice1: string; choice2: string; choice3: string; choice4: string;
  correctChoiceId: string;
  correctChoicePosition: number;
  explanationJa: string;
  explanationZh: string;
  difficulty: number;
  reviewState: string;
  sourceFile: string;
  warnings: string;
  infoFlags: string;
  // ── 人間レビューの記録欄（今回は空のまま。勝手に humanReviewed にしない） ──
  humanReviewState: string;
  reviewedAt: string;
  reviewer: string;
  reviewNote: string;
  correctionRequested: string;
}

const contentByWordId = new Map(ALL_VOCAB_CONTENT.map((c) => [c.wordId, c]));
const activeList = activeContent(ALL_VOCAB_CONTENT);
const activeSurfaces = new Set(activeList.map((c) => `${c.surface}|${c.reading}`));
const realReadings = new Set(activeList.map((c) => c.reading));

/**
 * 層C語彙のレベル貢献。
 * N2ルートで出るN3以下の語は「N2攻略の基礎補強」であって、**N2レベルの問題ではない**。
 * ここを混ぜると N2 readiness を過大評価する。
 */
const levelRole = (wordLevel: string, inN2: boolean) => {
  if (!inN2) return { routeRole: 'n3-core', readiness: 'n3' };
  if (wordLevel === 'N2' || wordLevel === 'N1') return { routeRole: 'n2-core', readiness: 'n2' };
  return { routeRole: 'n2-foundation-support', readiness: 'n3-or-below' };
};

const sourceFileOf = (q: AdvBattleQuestion, bank: AuditRow['bank']): string => {
  if (bank !== 'core-vocabulary') return 'src/lib/aiLesson/course/adventure/advContent.ts（単元・文法プール）';
  const c = contentByWordId.get(q.sourceItemId ?? '');
  const batch = c ? String(c.batchNo).padStart(2, '0') : '??';
  return `src/lib/aiLesson/course/adventure/vocab/content/coreBatch${batch}.ts`;
};

const toRow = (
  q: AdvBattleQuestion, bank: AuditRow['bank'], inN3: boolean, inN2: boolean,
  warnings: QuestionWarning[],
): AuditRow => {
  const c = contentByWordId.get(q.sourceItemId ?? '');
  const correctIdx = q.choices.findIndex((x) => x.isCorrect);
  const role = bank === 'core-vocabulary'
    ? levelRole(c?.level ?? '', inN2)
    : { routeRole: 'unit', readiness: q.level === 'n2' ? 'n2' : 'n3' };
  return {
    questionId: q.key,
    bank,
    inN3, inN2,
    targetLevel: c?.level ?? q.level,
    // 「この問題を解くのに前提となるレベル」。層Cは語のレベルがそのまま前提になる
    prerequisiteLevel: c?.level ?? q.level,
    routeRole: role.routeRole,
    readinessContribution: role.readiness,
    skill: q.skill,
    questionType: q.type,
    sourceSenseId: q.sourceItemId ?? '',
    targetWord: c?.surface ?? q.targetJapanese ?? '',
    reading: c?.reading ?? '',
    questionJa: q.questionJa,
    questionZh: q.questionZh ?? '',
    choice1: q.choices[0]?.textJa ?? '',
    choice2: q.choices[1]?.textJa ?? '',
    choice3: q.choices[2]?.textJa ?? '',
    choice4: q.choices[3]?.textJa ?? '',
    correctChoiceId: q.choices[correctIdx]?.choiceId ?? '',
    correctChoicePosition: correctIdx + 1,
    explanationJa: q.explanation?.whyCorrectJa ?? '',
    explanationZh: q.explanation?.whyCorrectZh ?? '',
    difficulty: q.difficulty,
    reviewState: q.reviewState ?? '',
    sourceFile: sourceFileOf(q, bank),
    warnings: warnings.filter((w) => w.severity === 'defect').map((w) => w.kind).join('|'),
    infoFlags: warnings.filter((w) => w.severity === 'info').map((w) => w.kind).join('|'),
    humanReviewState: '', reviewedAt: '', reviewer: '', reviewNote: '', correctionRequested: '',
  };
};

/** Excelが UTF-8 と判定するための BOM。文字リテラルで置くと lint に引っかかるのでエスケープで書く */
const BOM = '\uFEFF';

/** UTF-8 BOM付きCSV（Excelで文字化けしない） */
const toCsv = (rows: Record<string, unknown>[]): string => {
  if (rows.length === 0) return BOM;
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // 改行・カンマ・引用符を含む値は必ずクォートする（Excelで列がずれないように）
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return `${BOM}${[cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n')}\r\n`;
};

const writeCsv = (name: string, rows: Record<string, unknown>[]) => {
  writeFileSync(`${OUT}/${name}`, toCsv(rows));
  console.log(`  ${name}  ${rows.length}行`);
};

const run = async () => {
  mkdirSync(OUT, { recursive: true });

  const flatten = (m: Map<string, AdvBattleQuestion[]>) => [...m.values()].flat();
  const n3Vocab = flatten(vocabPool('N3'));
  const n2Vocab = flatten(vocabPool('N2'));
  const grammar = await loadGrammarPools();
  const unit = [...grammar.byItem.values()].flat();

  const n3Ids = new Set(n3Vocab.map((q) => q.key));
  const n2Ids = new Set(n2Vocab.map((q) => q.key));

  // ── 一意な問題の集合を作る（同じ questionId は1件として扱う） ──
  const universe = new Map<string, { q: AdvBattleQuestion; bank: AuditRow['bank'] }>();
  for (const q of n2Vocab) universe.set(q.key, { q, bank: 'core-vocabulary' });
  for (const q of n3Vocab) if (!universe.has(q.key)) universe.set(q.key, { q, bank: 'core-vocabulary' });
  for (const q of unit) {
    if (universe.has(q.key)) continue;
    universe.set(q.key, { q, bank: q.skill === 'charactersVocabulary' ? 'unit-vocabulary' : 'unit-grammar' });
  }

  const rows: AuditRow[] = [];
  const warnCount = new Map<string, number>();
  const seenQuestionText = new Map<string, string>();
  const seenChoiceSet = new Map<string, string>();

  for (const [id, { q, bank }] of universe) {
    const c = contentByWordId.get(q.sourceItemId ?? '');
    const ws = analyzeQuestion(q, {
      wordLevel: c?.level ?? null,
      inN2: n2Ids.has(id),
      activeSurfaces,
      realReadings,
      seenQuestionText,
      seenChoiceSet,
    });
    for (const w of ws) warnCount.set(`${w.severity}:${w.kind}`, (warnCount.get(`${w.severity}:${w.kind}`) ?? 0) + 1);
    rows.push(toRow(q, bank, n3Ids.has(id), n2Ids.has(id), ws));
  }

  // ── 集合演算 ──
  const core = rows.filter((r) => r.bank === 'core-vocabulary');
  const unitVocab = rows.filter((r) => r.bank === 'unit-vocabulary');
  const unitGrammar = rows.filter((r) => r.bank === 'unit-grammar');
  const bothLevels = rows.filter((r) => r.inN3 && r.inN2);
  const n3Only = rows.filter((r) => r.inN3 && !r.inN2);
  const n2Only = rows.filter((r) => r.inN2 && !r.inN3);
  const unused = rows.filter((r) => !r.inN3 && !r.inN2 && r.bank === 'core-vocabulary');

  const byState = (s: string) => rows.filter((r) => r.reviewState === s).length;
  const holdExcluded = ALL_VOCAB_CONTENT.filter((c) => c.state === 'excluded_from_core').length;

  const summary = {
    generatedAt: new Date().toISOString(),
    countingRules: {
      note: '報告値を単純合計しない。questionId で集合演算する',
      questionId: 'AdvBattleQuestion.key（例 vocab:勉強:べんきょう:meaning）',
      why: 'N3スコープ(N5+N4+N3)は N2スコープ(N5+N4+N3+N2)の部分集合。足すと二重計上になる',
      poolNote: '同じ questionId でも N3プールと N2プールでは誤答の抽選seedが異なるため、選択肢が違う場合がある（正解は同じ）',
    },
    uniqueQuestions: rows.length,
    coreQuestions: core.length,
    n3Questions: rows.filter((r) => r.inN3).length,
    n2Questions: rows.filter((r) => r.inN2).length,
    n2n3Overlap: bothLevels.length,
    n3Only: n3Only.length,
    n2Only: n2Only.length,
    unitVocabularyQuestions: unitVocab.length,
    unitGrammarQuestions: unitGrammar.length,
    unusedQuestions: unused.length,
    reportedFigures: {
      note: 'これまでの報告値。合計してはいけない',
      coreVocabularyQuestions: core.length,
      n3CharactersVocabulary: rows.filter((r) => r.inN3).length + unitVocab.length,
      n2CharactersVocabulary: rows.filter((r) => r.inN2).length + unitVocab.length,
      naiveSum: core.length + rows.filter((r) => r.inN3).length + rows.filter((r) => r.inN2).length,
      actualUnique: rows.length,
    },
    reviewState: {
      active: byState('validated_beta') + byState('authored'),
      hold: rows.filter((r) => r.reviewState === 'generated_draft').length,
      excludedFromCoreWords: holdExcluded,
      humanReviewed: 0,
    },
    warnings: Object.fromEntries([...warnCount.entries()].sort((a, b) => b[1] - a[1])),
    warningRows: rows.filter((r) => r.warnings).length,
    infoRows: rows.filter((r) => r.infoFlags).length,
    severityNote: 'defect=直す候補 / info=事実の分類（readiness_overcount は設計どおりだが N2 readiness へ数えてはいけない）',
  };

  writeFileSync(`${OUT}/question-bank-summary.json`, `${JSON.stringify(summary, null, 2)}\n`);

  console.log('=== 問題数（questionId基準・集合演算） ===');
  console.log(`unique               ${summary.uniqueQuestions}`);
  console.log(`CORE(層C)            ${summary.coreQuestions}`);
  console.log(`N3に属する           ${summary.n3Questions}`);
  console.log(`N2に属する           ${summary.n2Questions}`);
  console.log(`N2/N3 両方           ${summary.n2n3Overlap}`);
  console.log(`N3のみ / N2のみ      ${summary.n3Only} / ${summary.n2Only}`);
  console.log(`単元(語彙/文法)      ${summary.unitVocabularyQuestions} / ${summary.unitGrammarQuestions}`);
  console.log(`未使用               ${summary.unusedQuestions}`);
  console.log(`単純合計すると       ${summary.reportedFigures.naiveSum}（実際は ${summary.reportedFigures.actualUnique}）`);
  console.log('=== 警告 ===');
  for (const [k, v] of Object.entries(summary.warnings)) console.log(`  ${k}: ${v}`);

  // ── CSV ──
  console.log('=== CSV ===');
  writeCsv('question-bank-summary.csv', [{
    項目: 'unique questions', 件数: summary.uniqueQuestions,
  }, { 項目: 'CORE(層C)', 件数: summary.coreQuestions },
    { 項目: 'N3に属する', 件数: summary.n3Questions },
    { 項目: 'N2に属する', 件数: summary.n2Questions },
    { 項目: 'N2/N3 両方に属する', 件数: summary.n2n3Overlap },
    { 項目: 'N3のみ', 件数: summary.n3Only },
    { 項目: 'N2のみ', 件数: summary.n2Only },
    { 項目: '単元(文字・語彙)', 件数: summary.unitVocabularyQuestions },
    { 項目: '単元(文法)', 件数: summary.unitGrammarQuestions },
    { 項目: '未使用', 件数: summary.unusedQuestions },
    { 項目: 'active', 件数: summary.reviewState.active },
    { 項目: 'hold', 件数: summary.reviewState.hold },
    { 項目: 'CORE除外語', 件数: summary.reviewState.excludedFromCoreWords },
    { 項目: '人間確認済み', 件数: 0 },
    { 項目: '警告のある問題', 件数: summary.warningRows }]);

  writeCsv('core-vocabulary-questions.csv', core);
  writeCsv('n3-vocabulary-questions.csv', rows.filter((r) => r.inN3));
  writeCsv('n2-vocabulary-questions.csv', rows.filter((r) => r.inN2));
  // 1万行のファイルはExcelで扱いづらいので、出題形式ごとにも分けて出す。
  // 形式は決め打ちせず実データから拾う（新しい形式を足したときに取りこぼさないため）
  for (const type of [...new Set(rows.map((r) => r.questionType))].sort()) {
    writeCsv(`by-type-${type}-questions.csv`, rows.filter((r) => r.questionType === type));
  }
  writeCsv('warning-questions.csv', rows.filter((r) => r.warnings));
  // 人間レビュー待ち＝まだ誰も見ていない全active（列だけ用意し、値は空のまま）
  writeCsv('review-needed-questions.csv', rows.filter((r) => !r.humanReviewState));
  // N2ルートに出る基礎問題（設計どおり。ただし N2 readiness へ数えないこと）
  writeCsv('n2-foundation-support-questions.csv', rows.filter((r) => r.routeRole === 'n2-foundation-support'));

  console.log('→', OUT);
};

run();
