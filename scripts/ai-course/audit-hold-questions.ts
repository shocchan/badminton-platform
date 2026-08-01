// HOLD問題の再集計と分類（COMPLETION §5）。
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/audit-hold-questions.ts
//
// 方針: 誤問を出すよりHOLDを選ぶ。ただしHOLDで0問になる項目を作らない。
// 分類:
//  REPAIR_AND_RELEASE        … 生成variantで安全に代替済み（元recはHOLDのまま）
//  REPLACE_WITH_SAFE_VARIANT … 同上（variantが2種類以上ある＝暗記対策も足りる）
//  KEEP_HOLD                 … 代替はあるが品質判断が人間待ち
//  REMOVE_FROM_PILOT         … 代替が無くPilotから外す（0問項目＝要対応）
import { writeFileSync, mkdirSync } from 'node:fs';
import { N3_GRAMMAR_DRAFTS } from '../../src/lib/aiLesson/course/n3GrammarDrafts';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../../src/lib/aiLesson/course/n2GrammarDraftChunks';
import { N2_GRAMMAR_ALIASES } from '../../src/lib/aiLesson/course/n2GrammarAliases';
import { buildVariantPool, type GrammarDraftLike } from '../../src/lib/aiLesson/course/adventure/advVariants';
import { checkQuestionValidity } from '../../src/lib/aiLesson/course/adventure/advQuestionValidity';

type Disposition = 'REPAIR_AND_RELEASE' | 'KEEP_HOLD' | 'REPLACE_WITH_SAFE_VARIANT' | 'REMOVE_FROM_PILOT';

const run = async () => {
  const alias = new Set(Object.keys(N2_GRAMMAR_ALIASES));
  const n2: GrammarDraftLike[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) n2.push(...(await loadN2DraftUnitFile(no)) as unknown as GrammarDraftLike[]);

  const out: Record<string, unknown> = { generatedAt: new Date().toISOString() };
  let totalHold = 0;
  let zeroQuestionItems: string[] = [];

  for (const [level, drafts, aliasSet] of [
    ['N2', n2, alias] as const,
    ['N3', N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], new Set<string>()] as const,
  ]) {
    const pool = buildVariantPool(drafts as GrammarDraftLike[], level === 'N2' ? 'n2' : 'n3', aliasSet as Set<string>);
    const byId = new Map((drafts as GrammarDraftLike[]).map((d) => [d.grammarId, d]));
    const rows = pool.held.map((h) => {
      const active = pool.byItem.get(h.sourceItemId) ?? [];
      const types = new Set(active.map((q) => q.type));
      const v = checkQuestionValidity({
        promptJa: null,
        promptZh: byId.get(h.sourceItemId)?.recognition.promptZh ?? '',
        choices: byId.get(h.sourceItemId)?.recognition.options ?? [],
        answerIndex: byId.get(h.sourceItemId)?.recognition.answerIndex ?? 0,
      });
      const disposition: Disposition =
        active.length === 0 ? 'REMOVE_FROM_PILOT'
        : types.size >= 2 ? 'REPLACE_WITH_SAFE_VARIANT'
        : active.length >= 1 ? 'REPAIR_AND_RELEASE'
        : 'KEEP_HOLD';
      return {
        sourceItemId: h.sourceItemId,
        questionId: h.key,
        holdReasons: h.issues,
        semanticDisconnect: h.issues.includes('semantic_disconnection'),
        structuralMismatch: h.issues.includes('structural_inhomogeneity'),
        multipleAnswerRisk: h.issues.includes('duplicate_meaning_family'),
        giveaway: h.issues.includes('ending_category_giveaway'),
        languageIssue: false,
        correctCategory: h.correctCategory,
        lengthSpread: v.detail.lengthSpread,
        activeQuestionCount: active.length,
        activeQuestionTypes: [...types],
        fixability: active.length === 0 ? 'none' : types.size >= 2 ? 'covered_by_variants' : 'single_variant',
        disposition,
      };
    });
    totalHold += rows.length;
    zeroQuestionItems = [...zeroQuestionItems, ...pool.stats.itemsWithZeroQuestions];
    const byDisp: Record<string, number> = {};
    for (const r of rows) byDisp[r.disposition] = (byDisp[r.disposition] ?? 0) + 1;
    out[level] = {
      canonicalItems: pool.stats.items,
      activeQuestions: pool.stats.questions,
      byType: pool.stats.byType,
      heldCount: rows.length,
      byDisposition: byDisp,
      itemsWithZeroQuestions: pool.stats.itemsWithZeroQuestions,
      held: rows,
    };
    console.log(`${level}: canonical=${pool.stats.items} active=${pool.stats.questions} held=${rows.length}`, byDisp,
      `zeroQ=${pool.stats.itemsWithZeroQuestions.length}`);
  }

  out.summary = { totalHold, zeroQuestionItems, pass: zeroQuestionItems.length === 0 };
  mkdirSync('docs/ai-course/adventure-v2/generated', { recursive: true });
  writeFileSync('docs/ai-course/adventure-v2/generated/hold-audit.json', JSON.stringify(out, null, 1));
  console.log(`total HOLD=${totalHold} zeroQuestionItems=${zeroQuestionItems.length} → ${zeroQuestionItems.length === 0 ? 'PASS' : 'FAIL'}`);
};

void run();
