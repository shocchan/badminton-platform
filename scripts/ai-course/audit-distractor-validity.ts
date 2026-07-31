// 全authored recognition問題の妥当性内訳（UX CLARITY §3の監査）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/audit-distractor-validity.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { N3_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n3GrammarDrafts';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../../src/lib/aiLesson/course/n2GrammarDraftChunks';
import { N2_GRAMMAR_ALIASES } from '../../src/lib/aiLesson/course/n2GrammarAliases';
import { checkQuestionValidity } from '../../src/lib/aiLesson/course/adventure/advQuestionValidity';
import type { GrammarDraftLike } from '../../src/lib/aiLesson/course/adventure/advVariants';

const run = async () => {
  const alias = new Set(Object.keys(N2_GRAMMAR_ALIASES));
  const n2: GrammarDraftLike[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) n2.push(...(await loadN2DraftUnitFile(no)) as unknown as GrammarDraftLike[]);
  const sets: [string, GrammarDraftLike[]][] = [
    ['N2', n2.filter((d) => !alias.has(d.grammarId))],
    ['N3', N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[]],
  ];
  const report: Record<string, unknown> = {};
  for (const [name, drafts] of sets) {
    const issueCount: Record<string, number> = {};
    const failures: { id: string; issues: string[]; correctCat: string; spread: number; opts: string[] }[] = [];
    for (const d of drafts) {
      const v = checkQuestionValidity({
        promptJa: null, promptZh: d.recognition.promptZh,
        choices: d.recognition.options, answerIndex: d.recognition.answerIndex,
        synonymGroups: [d.similarPatterns],
      });
      if (v.ok) continue;
      for (const i of v.issues) issueCount[i] = (issueCount[i] ?? 0) + 1;
      failures.push({
        id: d.grammarId, issues: v.issues,
        correctCat: v.detail.correctCategory, spread: v.detail.lengthSpread,
        opts: d.recognition.options,
      });
    }
    report[name] = { total: drafts.length, failed: failures.length, issueCount, sample: failures.slice(0, 8) };
    console.log(`${name}: total=${drafts.length} failed=${failures.length}`, issueCount);
  }
  mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });
  writeFileSync('docs/ai-course/adventure-v2/generated/distractor-validity-audit.json', JSON.stringify(report, null, 1));
};
void run();
