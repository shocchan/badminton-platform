// V2と実コンテンツの組立層（§17: canonical再利用。教材の新規大量生成はしない）。
// 純関数層（advDiagnosis/advBattle/advQuest）へ実データを渡すのはここだけ。
// N2本文はlazy chunk（bundle増加を防ぐ）。
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N2_GRAMMAR_ALIASES } from '../n2GrammarAliases';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../n2GrammarDraftChunks';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { buildUnitQuestions } from '../n3unit/unitRuntime';
import { allVocabularyItems } from '../foundationVocabBank';
import type { AssessQuestion } from '../quality/assessQuestionEngine';
import type { N2GrammarDraft } from '../n2GrammarDrafts';
import type { DiagQuestion, DiagnosisPools } from './advDiagnosis';
import { buildVariantPool, type AdvBattleQuestion, type GrammarDraftLike } from './advVariants';
import { buildConversationMission, type ConversationMissionSpec } from './advConversationBridge';
import type { AdvRouteStage } from './advTypes';
import { AREA_UNIT_MAP } from './advRoute';

// ── N2本文のlazyロード（1回だけ・以後キャッシュ） ──
let n2DraftsCache: N2GrammarDraft[] | null = null;
export const loadAllN2Drafts = async (): Promise<N2GrammarDraft[]> => {
  if (n2DraftsCache) return n2DraftsCache;
  const all: N2GrammarDraft[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) all.push(...await loadN2DraftUnitFile(no));
  n2DraftsCache = all;
  return all;
};

export const N2_ALIAS_IDS = new Set(Object.keys(N2_GRAMMAR_ALIASES));

// ── バトル用問題プール ──
export interface GrammarPools {
  /** grammarId → 問題（validated_beta以上のみ） */
  byItem: Map<string, AdvBattleQuestion[]>;
  n3Ids: string[];
  n2Ids: string[];
  n2ByUnit: Map<number, string[]>;
}

let poolCache: GrammarPools | null = null;
export const loadGrammarPools = async (): Promise<GrammarPools> => {
  if (poolCache) return poolCache;
  const n2 = await loadAllN2Drafts();
  const n2Pool = buildVariantPool(n2 as unknown as GrammarDraftLike[], 'n2', N2_ALIAS_IDS);
  const n3Pool = buildVariantPool(N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], 'n3');
  const byItem = new Map<string, AdvBattleQuestion[]>([...n3Pool.byItem, ...n2Pool.byItem]);
  const n2ByUnit = new Map<number, string[]>();
  for (const d of n2) {
    if (N2_ALIAS_IDS.has(d.grammarId)) continue;
    const list = n2ByUnit.get(d.unit) ?? [];
    list.push(d.grammarId);
    n2ByUnit.set(d.unit, list);
  }
  poolCache = {
    byItem,
    n3Ids: N3_GRAMMAR_DRAFTS.map((d) => d.grammarId),
    n2Ids: n2.filter((d) => !N2_ALIAS_IDS.has(d.grammarId)).map((d) => d.grammarId),
    n2ByUnit,
  };
  return poolCache;
};

// ── 診断プール（既存validated問題のみ・§10） ──
const toDiagFromUnit = (q: AssessQuestion, level: 'foundation' | 'n3', unitId: string): DiagQuestion | null => {
  if (q.kind !== 'choice' || q.choices.length < 2) return null; // 並べ替えは診断で使わない（時間短縮）
  return {
    key: `n3q:${unitId}:${q.questionId}`,
    level, skill: 'vocabulary',
    promptJa: q.promptJa, promptZh: q.promptZh,
    choices: q.choices, answerIndex: q.answerIndex,
    explanationZh: q.explanationZh,
    refId: q.itemId,
  };
};

const toDiagFromGrammar = (d: GrammarDraftLike, level: 'n3' | 'n2'): DiagQuestion => ({
  key: `rec:${d.grammarId}`,
  level, skill: 'grammar',
  promptJa: '',
  promptZh: d.recognition.promptZh,
  choices: d.recognition.options,
  answerIndex: d.recognition.answerIndex,
  explanationZh: d.recognition.explanationZh,
  refId: d.grammarId,
});

export const buildDiagnosisPools = async (): Promise<DiagnosisPools> => {
  const vocab = allVocabularyItems();
  const foundationVocab: DiagQuestion[] = [];
  const n3Vocab: DiagQuestion[] = [];
  // 序盤2単元=foundation帯・後半2単元=N3帯の診断問題を使う（§10: 短く・幅広く）
  const specs = [...N3_UNIT_SPECS].sort((a, b) => a.order - b.order);
  for (const spec of [specs[0], specs[1], specs[specs.length - 2], specs[specs.length - 1]]) {
    const set = buildUnitQuestions(spec, vocab);
    const isEarly = spec.order <= 2;
    for (const q of set.diagnostic) {
      const d = toDiagFromUnit(q, isEarly ? 'foundation' : 'n3', spec.unitId);
      if (d) (isEarly ? foundationVocab : n3Vocab).push(d);
    }
  }
  const n2 = await loadAllN2Drafts();
  return {
    foundationVocab,
    n3Vocab,
    n3Grammar: (N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[]).map((d) => toDiagFromGrammar(d, 'n3')),
    n2Grammar: (n2 as unknown as GrammarDraftLike[])
      .filter((d) => !N2_ALIAS_IDS.has(d.grammarId))
      .map((d) => toDiagFromGrammar(d, 'n2')),
  };
};

// ── stage → 出題対象・会話ターゲット・次の学習対象 ──
export interface StageContent {
  battleTargetIds: string[];
  nextGrammarIds: string[];
  nextUnitIds: string[];
  conversationTargets: { refId: string; expression: string; themeJa: string; themeZh: string }[];
  missionByGrammarId: Map<string, ConversationMissionSpec>;
}

/** masteredIds を除いた「次にやる」対象を stage から展開する */
export const stageContent = async (
  stage: AdvRouteStage, masteredIds: Set<string>,
): Promise<StageContent> => {
  const pools = await loadGrammarPools();
  const n2 = await loadAllN2Drafts();
  const n3ById = new Map((N3_GRAMMAR_DRAFTS as unknown as (GrammarDraftLike & N2GrammarDraft)[]).map((d) => [d.grammarId, d]));
  const n2ById = new Map(n2.map((d) => [d.grammarId, d]));

  const grammarIds: string[] = [];
  if (stage.targets.n3GrammarIds && stage.targets.n3GrammarIds.length > 0) grammarIds.push(...stage.targets.n3GrammarIds);
  else if (stage.kind === 'n3_grammar') grammarIds.push(...pools.n3Ids);
  if (stage.targets.n2Units) for (const u of stage.targets.n2Units) grammarIds.push(...(pools.n2ByUnit.get(u) ?? []));

  const unitIds = stage.targets.n3UnitIds ?? [];
  const nextGrammarIds = grammarIds.filter((g) => !masteredIds.has(g));
  const nextUnitIds = unitIds.filter((u) => !masteredIds.has(u));

  // 会話ターゲット: stageの文法から（会話stageはエリアの実用場面へ）
  const missionByGrammarId = new Map<string, ConversationMissionSpec>();
  const conversationTargets: StageContent['conversationTargets'] = [];
  for (const g of nextGrammarIds.slice(0, 8)) {
    const d = n2ById.get(g) ?? n3ById.get(g);
    if (!d || !d.practice) continue;
    const m = buildConversationMission(d as never);
    missionByGrammarId.set(g, m);
    // 教材にthemeZhは無いため、zh側はstarterZh（場面を表す中文の一文）で代替する
    conversationTargets.push({ refId: g, expression: m.targetUse, themeJa: m.themeJa, themeZh: m.starterZh || m.themeJa });
  }

  const battleTargetIds = [...nextUnitIds, ...nextGrammarIds];
  return { battleTargetIds, nextGrammarIds, nextUnitIds, conversationTargets, missionByGrammarId };
};

/** stageのバトル対象が属するエリア単元の実在ガード（route⇔atlas整合） */
export const stageAreaUnitsExist = (stage: AdvRouteStage): boolean => {
  const units = stage.targets.n3UnitIds ?? [];
  const known = new Set(Object.values(AREA_UNIT_MAP).flat());
  return units.every((u) => known.has(u));
};
