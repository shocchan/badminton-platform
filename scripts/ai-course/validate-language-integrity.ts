// 学習者表示テキストの言語整合性チェック（JLPT ASSESSMENT INTEGRITY §4）。
// 実行: npm run validate:ai-course-language-integrity
// FAIL条件: 未許可Script / U+FFFD / mojibake / undefined混入 / 必須テキスト欠損
// 警告   : 中国語フィールドの引用外日本語（件数とIDを必ず出す・人間の翻訳作業へ）
import { writeFileSync, mkdirSync } from 'node:fs';
import { collectLearnerVisibleTexts } from '../../src/lib/aiLesson/course/adventure/advLanguageCollect';
import { runLanguageCheck, formatViolation } from '../../src/lib/aiLesson/course/adventure/advLanguageIntegrity';

const REQUIRED_FIELDS = [
  'recognition.explanationZh', 'explanation.whyCorrectJa', 'explanation.whyCorrectZh',
];

const run = async () => {
  const texts = await collectLearnerVisibleTexts();
  const report = runLanguageCheck(texts, REQUIRED_FIELDS);

  console.log(`checked ${report.checked} learner-visible strings`);
  console.log(`blocking violations: ${report.violations.length}`);
  console.log(`warnings           : ${report.warnings.length}`);
  console.log(`byKind: ${JSON.stringify(report.byKind)}`);
  if (Object.keys(report.byScript).length > 0) console.log(`byScript: ${JSON.stringify(report.byScript)}`);

  if (report.violations.length > 0) {
    console.error('\n--- BLOCKING (severity\titemId\tfield\troute\tlocale\tkind\tscript\tsubstring\tcodePoints\torigin\tsourceFile\trecommendation) ---');
    for (const v of report.violations) console.error(formatViolation(v));
  }

  // 警告の内訳（field別トップ）も出して、翻訳作業の優先順位を示す
  const warnByField: Record<string, number> = {};
  for (const w of report.warnings) warnByField[w.field] = (warnByField[w.field] ?? 0) + 1;
  const top = Object.entries(warnByField).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length > 0) {
    console.log('\n--- warnings by field (top10) ---');
    for (const [f, n] of top) console.log(`${n}\t${f}`);
  }

  mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });
  writeFileSync('docs/ai-course/adventure-v2/generated/language-integrity.json', JSON.stringify({
    generatedAt: new Date().toISOString(),
    checked: report.checked,
    pass: report.pass,
    byKind: report.byKind,
    byScript: report.byScript,
    blocking: report.violations,
    warningCount: report.warnings.length,
    warningsByField: warnByField,
    warningSample: report.warnings.slice(0, 50),
  }, null, 1));

  console.log(`\nresult: ${report.pass ? 'PASS' : 'FAIL'}`);
  if (!report.pass) process.exit(1);
};

void run();
