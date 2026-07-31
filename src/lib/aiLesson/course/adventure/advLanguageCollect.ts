// 学習者表示テキストの収集（validator / テストの共通入力）。
// ここで「どのフィールドが learner-visible で、どのlocaleか」を一元宣言する。
// コード・itemId・URL・JSON keyは収集しない（§1の対象外規定）。
import { aiCourseI18n } from '../../../../locales/aiCourse';
import { WORLD_AREAS } from '../rpg/worldAtlas';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../n2GrammarDraftChunks';
import { N2_GRAMMAR_ALIASES } from '../n2GrammarAliases';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { buildUnitQuestions } from '../n3unit/unitRuntime';
import { allVocabularyItems } from '../foundationVocabBank';
import { buildVariantPool, type GrammarDraftLike } from './advVariants';
import { GOAL_LABELS, BAND_LABELS } from './advTypes';
import { SKILL_LABELS } from './advSkillProfile';
import { COMPANIONS } from './advCompanion';
import { EXAM_SKILL_LABELS, EXAM_SECTION_LABELS } from './advExamSkills';
import { TERMS } from './advTerms';
import type { LangCheckInput } from './advLanguageIntegrity';

const push = (
  out: LangCheckInput[], itemId: string, field: string,
  locale: LangCheckInput['locale'], text: unknown, route: string,
  origin: LangCheckInput['origin'], sourceFile?: string,
) => {
  if (typeof text !== 'string') return;
  out.push({ itemId, field, locale, text, route, origin, sourceFile });
};

/** 文法draft（N2/N3共通）の learner-visible field */
const collectGrammarDraft = (
  out: LangCheckInput[], d: GrammarDraftLike & Record<string, unknown>, route: string, file: string,
) => {
  const id = d.grammarId;
  push(out, id, 'pattern', 'targetJa', d.pattern, route, 'canonical', file);
  push(out, id, 'meaningJa', 'ja', d.meaningJa, route, 'canonical', file);
  push(out, id, 'explanationZh', 'zh', d.explanationZh, route, 'canonical', file);
  push(out, id, 'formation', 'ja', d.formation, route, 'canonical', file);
  push(out, id, 'usageScene', 'zh', d.usageScene, route, 'canonical', file);
  push(out, id, 'nuance', 'zh', d.nuance, route, 'canonical', file);
  push(out, id, 'commonMistakesZh', 'zh', d.commonMistakesZh, route, 'canonical', file);
  push(out, id, 'learnerFocus', 'zh', d.learnerFocus, route, 'canonical', file);
  // contrast は ja/zh の混在運用が既存にあるため targetJa 扱い（script検査は全localeで効く）
  push(out, id, 'contrast', 'targetJa', d.contrast, route, 'canonical', file);
  for (const [i, ex] of (d.examplesJa ?? []).entries()) push(out, id, `examplesJa[${i}]`, 'targetJa', ex, route, 'canonical', file);
  for (const [i, ex] of (d.examplesZh ?? []).entries()) push(out, id, `examplesZh[${i}]`, 'zh', ex, route, 'canonical', file);
  for (const [i, sp] of (d.similarPatterns ?? []).entries()) push(out, id, `similarPatterns[${i}]`, 'targetJa', sp, route, 'canonical', file);
  const rec = d.recognition as { promptZh?: string; options?: string[]; explanationZh?: string } | undefined;
  if (rec) {
    push(out, id, 'recognition.promptZh', 'zh', rec.promptZh, `${route}/battle`, 'canonical', file);
    push(out, id, 'recognition.explanationZh', 'zh', rec.explanationZh, `${route}/battle`, 'canonical', file);
    for (const [i, o] of (rec.options ?? []).entries()) push(out, id, `recognition.options[${i}]`, 'targetJa', o, `${route}/battle`, 'canonical', file);
  }
  const prod = d.production as { promptJa?: string; promptZh?: string } | undefined;
  if (prod) {
    push(out, id, 'production.promptJa', 'ja', prod.promptJa, route, 'canonical', file);
    push(out, id, 'production.promptZh', 'zh', prod.promptZh, route, 'canonical', file);
  }
  const prac = d.practice as { themeJa?: string; starterJa?: string; starterZh?: string } | undefined;
  if (prac) {
    push(out, id, 'practice.themeJa', 'ja', prac.themeJa, route, 'canonical', file);
    push(out, id, 'practice.starterJa', 'targetJa', prac.starterJa, route, 'canonical', file);
    push(out, id, 'practice.starterZh', 'zh', prac.starterZh, route, 'canonical', file);
  }
};

/** UI辞書（ja/zh）を再帰的に収集。関数値は代表引数で1度だけ評価する */
const collectDict = (out: LangCheckInput[], node: unknown, locale: 'ja' | 'zh', path: string) => {
  if (typeof node === 'string') {
    push(out, `i18n.${locale}`, path, locale, node, 'ui', 'ui', 'src/locales/aiCourse.ts');
    return;
  }
  if (typeof node === 'function') {
    try {
      // 代表引数（文字列/数値）で評価し、テンプレート中の固定文言を検査する
      const fn = node as (...a: unknown[]) => unknown;
      // 引数個数はまちまちなので多めに渡す（不足するとテンプレートに undefined が出る）
      const v = fn('◯', 1, 2, 3, 4, 5, 6, 7);
      if (typeof v === 'string') push(out, `i18n.${locale}`, `${path}()`, locale, v, 'ui', 'ui', 'src/locales/aiCourse.ts');
    } catch { /* 引数形が違う関数は検査対象外 */ }
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectDict(out, v, locale, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) collectDict(out, v, locale, path ? `${path}.${k}` : k);
  }
};

/** 全learner-visibleテキストを収集（generated variantを含む） */
export const collectLearnerVisibleTexts = async (): Promise<LangCheckInput[]> => {
  const out: LangCheckInput[] = [];

  // ── 教材（canonical）──
  for (const d of N3_GRAMMAR_DRAFTS as unknown as (GrammarDraftLike & Record<string, unknown>)[]) {
    collectGrammarDraft(out, d, 'n3-grammar', 'src/lib/aiLesson/course/n3GrammarDrafts*.ts');
  }
  const n2All: (GrammarDraftLike & Record<string, unknown>)[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) {
    n2All.push(...(await loadN2DraftUnitFile(no)) as unknown as (GrammarDraftLike & Record<string, unknown>)[]);
  }
  for (const d of n2All) collectGrammarDraft(out, d, 'n2-grammar', 'src/lib/aiLesson/course/n2GrammarDraftsUnit*.ts');

  // ── 語彙 ──
  for (const v of allVocabularyItems() as unknown as Record<string, unknown>[]) {
    const id = String(v.id);
    push(out, id, 'lemma', 'targetJa', v.lemma, 'vocab', 'canonical');
    push(out, id, 'meaningZh', 'zh', v.meaningZh, 'vocab', 'canonical');
  }

  // ── 単元生成問題 ──
  const pool = allVocabularyItems();
  for (const spec of N3_UNIT_SPECS) {
    const set = buildUnitQuestions(spec, pool);
    const all = [...set.diagnostic, ...set.byStage.understand, ...set.byStage.distinguish, ...set.byStage.apply];
    for (const q of all) {
      push(out, q.questionId, 'promptJa', 'targetJa', q.promptJa, 'battle/unit', 'generated');
      push(out, q.questionId, 'promptZh', 'zh', q.promptZh, 'battle/unit', 'generated');
      push(out, q.questionId, 'explanationJa', 'ja', q.explanationJa, 'battle/unit', 'generated');
      push(out, q.questionId, 'explanationZh', 'zh', q.explanationZh, 'battle/unit', 'generated');
      q.choices.forEach((c, i) => push(out, q.questionId, `choices[${i}]`, 'targetJa', c, 'battle/unit', 'generated'));
    }
  }

  // ── variant生成問題 ──
  const aliasIds = new Set(Object.keys(N2_GRAMMAR_ALIASES));
  for (const [lvl, drafts, alias] of [
    ['n2', n2All, aliasIds] as const,
    ['n3', N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], new Set<string>()] as const,
  ]) {
    const vp = buildVariantPool(drafts as GrammarDraftLike[], lvl, alias);
    for (const qs of vp.byItem.values()) {
      for (const q of qs) {
        push(out, q.key, 'targetJapanese', 'targetJa', q.targetJapanese ?? '', `battle/${lvl}`, 'generated');
        push(out, q.key, 'questionJa', 'ja', q.questionJa ?? '', `battle/${lvl}`, 'generated');
        push(out, q.key, 'questionZh', 'zh', q.questionZh, `battle/${lvl}`, 'generated');
        push(out, q.key, 'explanation.whyCorrectJa', 'ja', q.explanation.whyCorrectJa, `battle/${lvl}`, 'generated');
        push(out, q.key, 'explanation.whyCorrectZh', 'zh', q.explanation.whyCorrectZh, `battle/${lvl}`, 'generated');
        push(out, q.key, 'explanation.meaningJa', 'ja', q.explanation.meaningJa, `battle/${lvl}`, 'generated');
        push(out, q.key, 'explanation.meaningZh', 'zh', q.explanation.meaningZh, `battle/${lvl}`, 'generated');
        q.choices.forEach((c, i) => {
          push(out, q.key, `choices[${i}].textJa`, 'targetJa', c.textJa, `battle/${lvl}`, 'generated');
          if (c.textZh) push(out, q.key, `choices[${i}].textZh`, 'zh', c.textZh, `battle/${lvl}`, 'generated');
          if (c.whyWrongJa) push(out, q.key, `choices[${i}].whyWrongJa`, 'ja', c.whyWrongJa, `battle/${lvl}`, 'generated');
          if (c.whyWrongZh) push(out, q.key, `choices[${i}].whyWrongZh`, 'zh', c.whyWrongZh, `battle/${lvl}`, 'generated');
        });
      }
    }
  }

  // ── 世界（Map・facility gloss）──
  for (const a of WORLD_AREAS) {
    push(out, a.areaId, 'nameJa', 'targetJa', a.nameJa, 'map', 'canonical');
    push(out, a.areaId, 'nameZh', 'targetJa', a.nameZh, 'map', 'canonical'); // 固有名詞＋gloss併記
    push(out, a.areaId, 'learningThemeJa', 'ja', a.learningThemeJa, 'map', 'canonical');
    push(out, a.areaId, 'learningThemeZh', 'zh', a.learningThemeZh, 'map', 'canonical');
    push(out, a.areaId, 'storyPurposeJa', 'ja', a.storyPurposeJa, 'map', 'canonical');
    push(out, a.areaId, 'storyPurposeZh', 'zh', a.storyPurposeZh, 'map', 'canonical');
    push(out, a.areaId, 'practicalMissionJa', 'ja', a.practicalMissionJa, 'map', 'canonical');
    push(out, a.areaId, 'practicalMissionZh', 'zh', a.practicalMissionZh, 'map', 'canonical');
  }

  // ── V2固有ラベル ──
  for (const [k, v] of Object.entries(GOAL_LABELS)) {
    push(out, `goal.${k}`, 'ja', 'ja', v.ja, 'onboarding', 'ui');
    push(out, `goal.${k}`, 'zh', 'zh', v.zh, 'onboarding', 'ui');
  }
  for (const [k, v] of Object.entries(BAND_LABELS)) {
    push(out, `band.${k}`, 'ja', 'ja', v.ja, 'home', 'ui');
    push(out, `band.${k}`, 'zh', 'zh', v.zh, 'home', 'ui');
  }
  for (const [k, v] of Object.entries(SKILL_LABELS)) {
    push(out, `skill.${k}`, 'ja', 'ja', v.ja, 'readiness', 'ui');
    push(out, `skill.${k}`, 'zh', 'zh', v.zh, 'readiness', 'ui');
  }
  for (const [k, v] of Object.entries(EXAM_SKILL_LABELS)) {
    push(out, `examSkill.${k}`, 'ja', 'ja', v.ja, 'readiness', 'ui');
    push(out, `examSkill.${k}`, 'zh', 'zh', v.zh, 'readiness', 'ui');
  }
  for (const [k, v] of Object.entries(EXAM_SECTION_LABELS)) {
    push(out, `examSection.${k}`, 'ja', 'ja', v.ja, 'readiness', 'ui');
    push(out, `examSection.${k}`, 'zh', 'zh', v.zh, 'readiness', 'ui');
  }
  for (const [k, v] of Object.entries(TERMS)) {
    push(out, `term.${k}`, 'ja', 'ja', v.ja, 'ui', 'ui');
    push(out, `term.${k}`, 'zh', 'zh', v.zh, 'ui', 'ui');
  }
  for (const c of COMPANIONS) {
    push(out, `companion.${c.id}`, 'nameJa', 'targetJa', c.nameJa, 'home', 'ui');
    push(out, `companion.${c.id}`, 'nameZh', 'zh', c.nameZh, 'home', 'ui');
    push(out, `companion.${c.id}`, 'roleJa', 'ja', c.roleJa, 'home', 'ui');
    push(out, `companion.${c.id}`, 'roleZh', 'zh', c.roleZh, 'home', 'ui');
    push(out, `companion.${c.id}`, 'greetJa', 'ja', c.greetJa, 'home', 'ui');
    push(out, `companion.${c.id}`, 'greetZh', 'zh', c.greetZh, 'home', 'ui');
  }

  // ── UI辞書（ja/zh）──
  collectDict(out, aiCourseI18n.ja, 'ja', '');
  collectDict(out, aiCourseI18n.zh, 'zh', '');

  return out;
};
