// Production Blocker Manifest 生成（§3）。単一集計から機械的に算出する。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/generate-production-blocker-manifest.ts
// 出力: docs/ai-course/production/generated/production-blocker-manifest.json
//
// 指標はコミット数やテスト数ではなく「何がリリースを止めているか」。
// AIが解消できるもの（ai_actionable）と、人間・remote・実機・法務にしかできないもの（human_gate）を分ける。
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { allVocabularyItems } from '../../src/lib/aiLesson/course/foundationVocabBank';
import { buildAssessQuestions, canAssess } from '../../src/lib/aiLesson/course/quality/assessQuestionEngine';
import { auditPresentedQuestion, auditFoundationQuestion } from '../../src/lib/aiLesson/course/quality/answerLeakage';
import { cognateProfileFor, allowsCoreMeaningQuestion, highRiskCognateIds } from '../../src/lib/aiLesson/course/quality/cognateProfile';
import { contrastQuestionsFor } from '../../src/lib/aiLesson/course/quality/cognateContrastBank';
import { BUNDLE as U1 } from '../../src/lib/aiLesson/course/foundationUnit1';
import { UNIT2_QUESTIONS } from '../../src/lib/aiLesson/course/foundationUnit2';
import { UNIT3_QUESTIONS } from '../../src/lib/aiLesson/course/foundationUnit3';
import { UNIT4_QUESTIONS } from '../../src/lib/aiLesson/course/foundationUnit4';
import { UNIT5_QUESTIONS } from '../../src/lib/aiLesson/course/foundationUnit5';
import { UNIT6_QUESTIONS } from '../../src/lib/aiLesson/course/foundationUnit6';
import { CHAPTER1_QUESTS } from '../../src/lib/aiLesson/course/rpg/chapter1Data';

const ROOT = process.cwd();
const pool = allVocabularyItems();
const itemById = new Map(pool.map(i => [i.id, i]));
const foundationQuestions = [...U1.questions, ...UNIT2_QUESTIONS, ...UNIT3_QUESTIONS,
  ...UNIT4_QUESTIONS, ...UNIT5_QUESTIONS, ...UNIT6_QUESTIONS];

// ── learner向けソースの走査 ──
const walk = (dir: string, out: string[] = []): string[] => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(p) && !/\.test\./.test(p)) out.push(p);
  }
  return out;
};

/** learner に見せてはいけない開発表示（§6）。文字列と検出理由 */
const DEV_LABELS = ['試作', 'labPreview限定', 'sandbox保存', '内部プレビュー', '内部確認',
  'この画面専用', '通常の学習記録には影響しません', '検証用', 'デバッグ'];
const UNFINISHED_LABELS = ['準備中', '作成中', 'coming soon', 'Coming Soon', 'β版', 'ベータ版'];

interface SurfaceFinding { file: string; label: string; line: number }

const scanSurfaces = (labels: string[], dirs: string[]): SurfaceFinding[] => {
  const out: SurfaceFinding[] = [];
  for (const d of dirs) {
    if (!existsSync(join(ROOT, d))) continue;
    for (const file of walk(join(ROOT, d))) {
      const text = readFileSync(file, 'utf8');
      text.split('\n').forEach((ln, i) => {
        // JSXの表示文字列のみを対象にする（import・型・コメント行は除外）
        if (/^\s*(\/\/|\*|import|export type|export interface)/.test(ln)) return;
        for (const lab of labels) {
          if (ln.includes(lab)) out.push({ file: file.replace(ROOT + '/', ''), label: lab, line: i + 1 });
        }
      });
    }
  }
  return out;
};

// learnerが実際に到達する画面（labPreview限定パネルは production では非表示）
const LEARNER_DIRS = ['src/components/ai-course', 'src/pages/ai-lesson'];

// ── 教育品質 ──
const leakageFindings = [
  ...foundationQuestions.flatMap(q => auditFoundationQuestion(q)),
  ...pool.flatMap(item => buildAssessQuestions(item, pool, { introduced: false }).flatMap(q =>
    auditPresentedQuestion({
      questionId: q.questionId, phase: 'assess', teachTexts: [],
      promptTexts: [q.promptJa, q.promptZh], choices: q.choices,
      correctAnswer: q.choices[q.answerIndex],
    }))),
];
const answerLeakageIssues = leakageFindings.filter(f => f.releaseBlocker);
const questionQualityWarnings = leakageFindings.filter(f => !f.releaseBlocker);

/** 同形同義語に意味当てを出している問題（trivial） */
const trivialCognateQuestions = pool.flatMap(item => {
  const prof = cognateProfileFor(item);
  return buildAssessQuestions(item, pool, { introduced: false })
    .filter(q => q.dimension === 'core_meaning' && !allowsCoreMeaningQuestion(prof, false))
    .map(q => q.questionId);
});

/** 高リスク同形語でcontrastが無いもの */
const highRiskContrastMissing = highRiskCognateIds().filter(id => contrastQuestionsFor(id).length === 0);

/** Chapter 1が扱う語のうちassessできないもの */
const chapter1Items = [...new Set(CHAPTER1_QUESTS.flatMap(q => q.learningItemIds))];
const requiredVocabularyUntested = chapter1Items.filter(id => {
  const it = itemById.get(id);
  return !it || !canAssess(it, pool);
});

/** どのUnit・Chapterからも参照されない語（孤立） */
const referenced = new Set<string>([
  ...chapter1Items,
  ...foundationQuestions.map(q => q.targetItemId).filter((x): x is string => !!x),
  ...U1.items.map(i => i.id),
]);
const orphanVocabulary = pool.filter(i => !referenced.has(i.id)).map(i => i.id);

// ── 集計 ──
const debugLabels = scanSurfaces(DEV_LABELS, LEARNER_DIRS);
const unfinished = scanSurfaces(UNFINISHED_LABELS, LEARNER_DIRS);

type Owner = 'ai_actionable' | 'human_gate';
interface Blocker { key: string; count: number; severity: 'P0' | 'P1' | 'P2'; owner: Owner; note: string }

const blockers: Blocker[] = [
  { key: 'answerLeakageIssues', count: answerLeakageIssues.length, severity: 'P1', owner: 'ai_actionable',
    note: 'assess画面で答えが露出している問題数' },
  { key: 'trivialCognateQuestions', count: trivialCognateQuestions.length, severity: 'P2', owner: 'ai_actionable',
    note: '中国語と同形同義の語に意味当てを出している問題数' },
  { key: 'highRiskContrastMissing', count: highRiskContrastMissing.length, severity: 'P1', owner: 'ai_actionable',
    note: '高リスク同形語でcontrast問題が無い語数' },
  { key: 'requiredVocabularyUntested', count: requiredVocabularyUntested.length, severity: 'P1', owner: 'ai_actionable',
    note: 'Chapter必須語のうち評価問題を作れない語数' },
  { key: 'orphanVocabulary', count: orphanVocabulary.length, severity: 'P2', owner: 'ai_actionable',
    note: 'どのUnit/Chapterからも参照されない語数' },
  { key: 'questionQualityWarnings', count: questionQualityWarnings.length, severity: 'P2', owner: 'ai_actionable',
    note: '長さ・文体の偏りなど当てやすさの警告' },
  { key: 'debugLabelsVisible', count: debugLabels.length, severity: 'P1', owner: 'ai_actionable',
    note: 'learner画面に開発表示（試作/sandbox/検証用など）が残っている箇所' },
  { key: 'comingSoonVisible', count: unfinished.length, severity: 'P1', owner: 'ai_actionable',
    note: 'learner画面に準備中/coming soon表示が残っている箇所' },
];

const humanGates: Blocker[] = [
  { key: 'humanContentReviewWaiting', count: 1, severity: 'P0', owner: 'human_gate',
    note: 'N2/N3教材・cognate分類・contrast問題のCEO承認（human_reviewed/approvedは自動昇格しない）' },
  { key: 'humanVisualReviewWaiting', count: 1, severity: 'P0', owner: 'human_gate',
    note: 'RPG世界名・Story文言・pixel assetのCEO承認' },
  { key: 'physicalDeviceWaiting', count: 1, severity: 'P0', owner: 'human_gate',
    note: '実機iPhone/Android・VoiceOver/TalkBack確認' },
  { key: 'remoteDbWaiting', count: 1, severity: 'P0', owner: 'human_gate',
    note: '共有Supabaseへのmigration/RLS適用（APPLY_SHARED_SUPABASE_MIGRATIONS が必要）' },
  { key: 'legalDecisionBlockers', count: 1, severity: 'P0', owner: 'human_gate',
    note: '利用規約・プライバシー・AI利用範囲・現実景品の法務判断' },
  { key: 'productionDeployWaiting', count: 1, severity: 'P0', owner: 'human_gate',
    note: '本番反映（APPROVE_AI_COURSE_PRODUCTION_RELEASE が必要）' },
];

const aiTotal = blockers.reduce((s, b) => s + b.count, 0);
const manifest = {
  generatedAt: new Date().toISOString(),
  productionGo: aiTotal === 0 && humanGates.every(h => h.count === 0) ? 'GO' : 'NO-GO',
  summary: {
    aiActionableBlockers: aiTotal,
    humanGateBlockers: humanGates.reduce((s, b) => s + b.count, 0),
    p1Count: [...blockers, ...humanGates].filter(b => b.severity === 'P1').reduce((s, b) => s + b.count, 0),
    p0Count: [...blockers, ...humanGates].filter(b => b.severity === 'P0').reduce((s, b) => s + b.count, 0),
  },
  blockers,
  humanGates,
  details: {
    answerLeakageIssues: answerLeakageIssues.slice(0, 40),
    trivialCognateQuestions: trivialCognateQuestions.slice(0, 40),
    highRiskContrastMissing,
    requiredVocabularyUntested,
    orphanVocabularySample: orphanVocabulary.slice(0, 40),
    orphanVocabularyTotal: orphanVocabulary.length,
    debugLabelsVisible: debugLabels.slice(0, 40),
    comingSoonVisible: unfinished.slice(0, 40),
  },
  coverage: {
    vocabularyTotal: pool.length,
    vocabularyAssessable: pool.filter(i => canAssess(i, pool)).length,
    chapter1RequiredItems: chapter1Items.length,
    highRiskCognates: highRiskCognateIds().length,
    generatedAssessQuestions: pool.reduce((s, i) => s + buildAssessQuestions(i, pool, { introduced: false }).length, 0),
  },
};

const OUT = 'docs/ai-course/production/generated/production-blocker-manifest.json';
writeFileSync(join(ROOT, OUT), JSON.stringify(manifest, null, 1) + '\n');
console.log(JSON.stringify({ productionGo: manifest.productionGo, ...manifest.summary }, null, 1));
for (const b of blockers.filter(b => b.count > 0)) console.log(` ${b.severity} ${b.key}: ${b.count}`);
