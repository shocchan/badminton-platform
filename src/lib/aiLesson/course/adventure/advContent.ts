// V2と実コンテンツの組立層（§17: canonical再利用。教材の新規大量生成はしない）。
// 純関数層（advDiagnosis/advBattle/advQuest）へ実データを渡すのはここだけ。
// N2本文はlazy chunk（bundle増加を防ぐ）。
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N2_GRAMMAR_ALIASES } from '../n2GrammarAliases';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../n2GrammarDraftChunks';
import { loadAllBasicDrafts, cachedBasicDraftById, N5_UNIT_IDS, N4_UNIT_IDS } from '../basicGrammarChunks';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { buildUnitQuestions } from '../n3unit/unitRuntime';
import { allVocabularyItems } from '../foundationVocabBank';
import type { AssessQuestion } from '../quality/assessQuestionEngine';
import type { N2GrammarDraft } from '../n2GrammarDrafts';
import type { DiagQuestion, DiagnosisPools } from './advDiagnosis';
import { buildVariantPool, type AdvBattleQuestion, type AdvChoice, type GrammarDraftLike } from './advVariants';
import { skillOfQuestionType, SECTION_OF_SKILL } from './advExamSkills';
import { buildConversationMission, type ConversationMissionSpec } from './advConversationBridge';
import type { AdvRoute, AdvRouteStage } from './advTypes';
import { AREA_UNIT_MAP, isConversationStage } from './advRoute';

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

/**
 * 束が「別日3回80%＋7日後確認」を未出の問題で通せる下限。
 * 1回のバトルが5問・3日ぶんで15問＋確認2問。これを下回る束は攻略不能なので合流させる。
 */
export const MIN_BUNDLE_QUESTIONS = 17;

/** 内部IDを学習者に見せないためのpattern同期lookup（原則13）。
 *  n3は常時参照可・n2は loadAllN2Drafts 済みキャッシュのみ。見つからなければ null */
export const grammarPatternById = (id: string): string | null =>
  N3_GRAMMAR_DRAFTS.find((d) => d.grammarId === id)?.pattern
    ?? n2DraftsCache?.find((d) => d.grammarId === id)?.pattern
    ?? cachedBasicDraftById(id)?.pattern
    ?? null;

// ── バトル用問題プール ──
export interface GrammarPools {
  /** grammarId / unitId → 問題（validated_beta以上のみ） */
  byItem: Map<string, AdvBattleQuestion[]>;
  n3Ids: string[];
  n2Ids: string[];
  n2ByUnit: Map<number, string[]>;
  /** N3文法の束（draft.unit）→ 束ID。項目単位ではプールが1〜5問しかなくmastery不可能なため、mastery/バトルは束単位 */
  n3BundleByItem: Map<string, string>;
  n3BundleIds: string[];
  /** 初級文法の束ID → 配下のgrammarId。合流した単元は束IDから消える（キーは実在する束だけ） */
  basicByUnit: Map<string, string[]>;
  /** 単元ID → 実際の束ID。合流があるためルートのbasicUnitsは必ずこれを通して解決する */
  basicBundleByUnit: Map<string, string>;
}

/** N3単元の生成問題（choice型のみ）をバトル問題へ正規化。unitId をtargetにした敵編成で使う */
const buildUnitBattlePools = (): Map<string, AdvBattleQuestion[]> => {
  const vocab = allVocabularyItems();
  const out = new Map<string, AdvBattleQuestion[]>();
  for (const spec of N3_UNIT_SPECS) {
    const set = buildUnitQuestions(spec, vocab);
    const seen = new Set<string>();
    const qs: AdvBattleQuestion[] = [];
    const push = (q: AssessQuestion) => {
      if (q.kind !== 'choice' || q.choices.length < 3 || seen.has(q.questionId)) return;
      seen.add(q.questionId);
      const type = `u-${q.dimension}`;
      const skill = skillOfQuestionType(type);
      // 正解はindexではなくchoiceIdで保持する（§11）。元の並びでIDを固定し、表示順は提示時に決める
      const choices: AdvChoice[] = q.choices.map((text, i) => ({
        choiceId: `choice-${String.fromCharCode(97 + i)}`,
        textJa: text,
        isCorrect: i === q.answerIndex,
        whyWrongJa: i === q.answerIndex ? undefined : 'この文脈には合いません。',
        whyWrongZh: i === q.answerIndex ? undefined : '不适合这个语境。',
      }));
      qs.push({
        key: `u${q.dimension}:${spec.unitId}:${q.questionId}`,
        type,
        level: spec.order <= 2 ? 'foundation' : 'n3',
        skill,
        examSection: SECTION_OF_SKILL[skill],
        targetJapanese: q.promptJa,
        questionJa: q.promptJa,
        questionZh: q.promptZh,
        choices,
        explanation: {
          meaningJa: q.explanationJa,
          meaningZh: q.explanationZh,
          whyCorrectJa: q.explanationJa,
          whyCorrectZh: q.explanationZh,
          exampleJa: null, exampleZh: null,
          sourceItemId: q.itemId,
          sourceLabel: q.itemId,
        },
        sourceItemId: q.itemId,
        difficulty: 1,
        timed: false,
        variantId: q.questionId,
        reviewState: 'authored',
        status: 'authored',
      });
    };
    for (const q of set.diagnostic) push(q);
    for (const q of set.byStage.understand) push(q);
    for (const q of set.byStage.distinguish) push(q);
    for (const q of set.byStage.apply) push(q);
    out.set(spec.unitId, qs);
  }
  return out;
};

/**
 * 問題数が足りない束を**次の束へ合流**させながら、項目を束へ割り当てる（2026-08-18 共通化）。
 *
 * 束は「別日3回80%＋7日後の確認」を未出の問題で通せるだけの問題数（MIN_BUNDLE_QUESTIONS）が要る。
 * 足りない束を残すと、毎回満点でも未出問題が尽きて**永久に攻略できないstage**ができる（実際にできていた）。
 * 合流は実測の問題数で決まるので、教材を足せば自動的に細かい束へ戻る。
 *
 * @param unitIds 束の並び（学習順）
 * @param itemsOf 束ID → 配下の項目ID
 * @param countOf 項目ID → その項目が生む問題数
 * @param assign  (項目ID, 実際の束ID) を受け取って登録する
 * @returns 単元ID → 実際の束ID（合流したぶんも解決できる）
 */
const mergeThinBundles = (
  unitIds: string[],
  itemsOf: (unitId: string) => string[],
  countOf: (itemId: string) => number,
  assign: (itemId: string, bundleId: string) => void,
): Map<string, string> => {
  const bundleOfUnit = new Map<string, string>();
  const membersOfBundle = new Map<string, string[]>();
  let bundleId: string | null = null;
  let acc = 0;
  for (const u of unitIds) {
    if (bundleId === null) { bundleId = u; acc = 0; }
    bundleOfUnit.set(u, bundleId);
    for (const id of itemsOf(u)) {
      assign(id, bundleId);
      membersOfBundle.set(bundleId, [...(membersOfBundle.get(bundleId) ?? []), id]);
      acc += countOf(id);
    }
    if (acc >= MIN_BUNDLE_QUESTIONS) { bundleId = null; acc = 0; }
  }
  // 最後の束が足りないまま終わったら、ひとつ前の束へ吸収する（攻略不能な束を残さない）
  if (bundleId !== null) {
    const ids = [...new Set(bundleOfUnit.values())];
    const prev = ids[ids.length - 2];
    if (prev) {
      for (const [u, b] of bundleOfUnit) if (b === bundleId) bundleOfUnit.set(u, prev);
      for (const id of membersOfBundle.get(bundleId) ?? []) assign(id, prev);
    }
  }
  return bundleOfUnit;
};

let poolCache: GrammarPools | null = null;
export const loadGrammarPools = async (): Promise<GrammarPools> => {
  if (poolCache) return poolCache;
  const n2 = await loadAllN2Drafts();
  const basic = await loadAllBasicDrafts();
  const n2Pool = buildVariantPool(n2 as unknown as GrammarDraftLike[], 'n2', N2_ALIAS_IDS);
  const n3Pool = buildVariantPool(N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], 'n3');
  // 初級文法は誤答プールをN5/N4の中だけで作る（基礎の学習者にN3/N2の表現を混ぜない）
  const basicPool = buildVariantPool(basic as unknown as GrammarDraftLike[], 'foundation');
  const byItem = new Map<string, AdvBattleQuestion[]>([
    ...n3Pool.byItem, ...n2Pool.byItem, ...basicPool.byItem, ...buildUnitBattlePools(),
  ]);
  const n2ByUnit = new Map<number, string[]>();
  for (const d of n2) {
    if (N2_ALIAS_IDS.has(d.grammarId)) continue;
    const list = n2ByUnit.get(d.unit) ?? [];
    list.push(d.grammarId);
    n2ByUnit.set(d.unit, list);
  }
  // N3文法は束（draft.unit）でmastery判定する。
  //
  // 【2026-08-18 監査P0】以前は unit-10 → unit-9 だけをハードコードで合流させていた。
  // ところが実測すると **unit-1 は14問しかなく**（17問未満）、毎回100%正解しても
  // 3日目には未出問題が尽きて qualifying にならず、**永久に攻略できない**stageだった。
  // N3文法攻略はN3目標の本丸なので、ここで詰まると先へ進めない。
  // 初級文法と同じ「実測の問題数で自動的に合流する」やり方へ統一する。
  // 教材を足せば自動的に細かい束へ戻るので、次に同じ穴が空くことはない。
  const n3BundleByItem = new Map<string, string>();
  const n3UnitIds = [...new Set(N3_GRAMMAR_DRAFTS.map((d) => d.unit))]
    .sort((a, b) => Number(a.split('-')[2]) - Number(b.split('-')[2]));
  mergeThinBundles(
    n3UnitIds,
    (u) => N3_GRAMMAR_DRAFTS.filter((d) => d.unit === u).map((d) => d.grammarId),
    (id) => (n3Pool.byItem.get(id) ?? []).length,
    (id, bundle) => {
      n3BundleByItem.set(id, bundle);
      byItem.set(bundle, [...(byItem.get(bundle) ?? []), ...(n3Pool.byItem.get(id) ?? [])]);
    },
  );
  // N2文法も単元束（n2g-unit-*）でmastery判定する（2026-08-15）。
  // 項目単位（178個×別日3回+7日確認）では理論上800日超かかり半年で完走不可能だった。
  // 学習（learn step）は項目単位のまま・攻略台帳とバトルだけ束にする（N3と同じ設計）
  for (const d of n2) {
    if (N2_ALIAS_IDS.has(d.grammarId)) continue;
    const bundle = `n2g-unit-${d.unit}`;
    n3BundleByItem.set(d.grammarId, bundle);
    const list = byItem.get(bundle) ?? [];
    list.push(...(n2Pool.byItem.get(d.grammarId) ?? []));
    byItem.set(bundle, list);
  }
  // 初級文法（N5/N4）も同じ束攻略にする。108項目を項目単位で判定すると完走不可能。
  // ただし助詞のような1文字の項目は自動生成できる問題型が少なく、単元をそのまま束にすると
  // 攻略不能な束（別日3回80%＋7日後確認に必要な17問に届かない）ができる。
  // → 問題数が足りない単元は**次の単元へ合流**させる（N3のunit-10→unit-9と同じ考え方）。
  //   合流は実測の問題数で決まるので、教材を足せば自動的に細かい束へ戻る
  const basicByUnit = new Map<string, string[]>();
  const basicBundleByUnit = new Map<string, string>();
  for (const unitIds of [N5_UNIT_IDS, N4_UNIT_IDS]) {
    const itemsOf = new Map(unitIds.map((u) => [u, basic.filter((d) => d.unit === u)]));
    const qCount = (u: string) => (itemsOf.get(u) ?? [])
      .reduce((n, d) => n + (basicPool.byItem.get(d.grammarId) ?? []).length, 0);
    let bundleId: string | null = null;
    let acc = 0;
    for (const u of unitIds) {
      if (bundleId === null) { bundleId = u; acc = 0; }
      basicBundleByUnit.set(u, bundleId);
      for (const d of itemsOf.get(u) ?? []) {
        n3BundleByItem.set(d.grammarId, bundleId);
        basicByUnit.set(bundleId, [...(basicByUnit.get(bundleId) ?? []), d.grammarId]);
        const list = byItem.get(bundleId) ?? [];
        list.push(...(basicPool.byItem.get(d.grammarId) ?? []));
        byItem.set(bundleId, list);
      }
      acc += qCount(u);
      if (acc >= MIN_BUNDLE_QUESTIONS) { bundleId = null; acc = 0; }
    }
    // 最後の束が足りないまま終わったら、ひとつ前の束へ吸収する（攻略不能な束を残さない）
    if (bundleId !== null && basicByUnit.size > 0) {
      const ids = [...basicByUnit.keys()].filter((k) => unitIds.includes(k));
      const prev = ids[ids.length - 2];
      if (prev) {
        for (const g of basicByUnit.get(bundleId) ?? []) n3BundleByItem.set(g, prev);
        for (const [u, b] of basicBundleByUnit) if (b === bundleId) basicBundleByUnit.set(u, prev);
        basicByUnit.set(prev, [...(basicByUnit.get(prev) ?? []), ...(basicByUnit.get(bundleId) ?? [])]);
        byItem.set(prev, [...(byItem.get(prev) ?? []), ...(byItem.get(bundleId) ?? [])]);
        basicByUnit.delete(bundleId);
        byItem.delete(bundleId);
      }
    }
  }
  const n3BundleIds = [...new Set(n3BundleByItem.values())];
  poolCache = {
    byItem,
    n3Ids: N3_GRAMMAR_DRAFTS.map((d) => d.grammarId),
    n2Ids: n2.filter((d) => !N2_ALIAS_IDS.has(d.grammarId)).map((d) => d.grammarId),
    n2ByUnit,
    n3BundleByItem,
    n3BundleIds,
    basicByUnit,
    basicBundleByUnit,
  };
  return poolCache;
};

// ── 診断プール（既存validated問題のみ・§10） ──
const toDiagFromUnit = (q: AssessQuestion, level: 'foundation' | 'n3', unitId: string): DiagQuestion | null => {
  if (q.kind !== 'choice' || q.choices.length < 2) return null; // 並べ替えは診断で使わない（時間短縮）
  return {
    // バトル側と同一キー（診断で出した問題はバトルで「既出」扱いになる）
    key: `u${q.dimension}:${unitId}:${q.questionId}`,
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
  /** grammarId → mastery束ID（N3は n3g-unit-*）。束が無い項目は項目ID */
  grammarBundleByItem: Map<string, string>;
  nextGrammarIds: string[];
  nextUnitIds: string[];
  conversationTargets: { refId: string; expression: string; themeJa: string; themeZh: string }[];
  missionByGrammarId: Map<string, ConversationMissionSpec>;
}

/**
 * masteredIds を除いた「次にやる」対象を stage から展開する。
 * waitingIds（7日後確認の解禁待ち）は「進行中」なので次候補から外す＝先の対象へ進める
 * （2026-08-15 進度改善: 待ちの間に学習が止まる直列スケジューリングの解消）
 */
export const stageContent = async (
  stage: AdvRouteStage, masteredIds: Set<string>, waitingIds: Set<string> = new Set(),
): Promise<StageContent> => {
  const pools = await loadGrammarPools();
  const n2 = await loadAllN2Drafts();
  const n3ById = new Map((N3_GRAMMAR_DRAFTS as unknown as (GrammarDraftLike & N2GrammarDraft)[]).map((d) => [d.grammarId, d]));
  const n2ById = new Map(n2.map((d) => [d.grammarId, d]));
  const basicById = new Map((await loadAllBasicDrafts()).map((d) => [d.grammarId, d]));

  const grammarIds: string[] = [];
  // 初級文法（基礎キャンプ・N3の橋）を先に置く。基礎帯の学習者にはここが本体。
  // 単元→束は合流があるので basicBundleByUnit を通す。同じ束を指す単元は重複するため一意化
  if (stage.targets.basicUnits) {
    const bundles = new Set(stage.targets.basicUnits.map((u) => pools.basicBundleByUnit.get(u) ?? u));
    for (const b of bundles) grammarIds.push(...(pools.basicByUnit.get(b) ?? []));
  }
  if (stage.targets.n3GrammarIds && stage.targets.n3GrammarIds.length > 0) grammarIds.push(...stage.targets.n3GrammarIds);
  else if (stage.kind === 'n3_grammar') grammarIds.push(...pools.n3Ids);
  if (stage.targets.n2Units) for (const u of stage.targets.n2Units) grammarIds.push(...(pools.n2ByUnit.get(u) ?? []));

  const unitIds = stage.targets.n3UnitIds ?? [];
  const skip = (id: string): boolean => masteredIds.has(id) || waitingIds.has(id);
  const nextGrammarIds = grammarIds.filter((g) => !skip(g) && !skip(pools.n3BundleByItem.get(g) ?? ''));
  const nextUnitIds = unitIds.filter((u) => !skip(u));

  // 会話ターゲット: stageの文法から（会話stageはエリアの実用場面へ）
  const missionByGrammarId = new Map<string, ConversationMissionSpec>();
  const conversationTargets: StageContent['conversationTargets'] = [];
  for (const g of nextGrammarIds.slice(0, 8)) {
    const d = n2ById.get(g) ?? n3ById.get(g) ?? (basicById.get(g) as unknown as N2GrammarDraft | undefined);
    if (!d || !d.practice) continue;
    const m = buildConversationMission(d as never);
    missionByGrammarId.set(g, m);
    // 教材にthemeZhは無いため、zh側はstarterZh（場面を表す中文の一文）で代替する
    conversationTargets.push({ refId: g, expression: m.targetUse, themeJa: m.themeJa, themeZh: m.starterZh || m.themeJa });
  }

  const battleTargetIds = [...nextUnitIds, ...new Set(nextGrammarIds.map((g) => pools.n3BundleByItem.get(g) ?? g))];
  return { battleTargetIds, grammarBundleByItem: pools.n3BundleByItem, nextGrammarIds, nextUnitIds, conversationTargets, missionByGrammarId };
};

/**
 * 学習コンテンツを出すstageを選ぶ（2026-08-15 進度改善）。
 * 現在stageの対象がすべて攻略済みか7日待ちなら、先のstageの学習を前倒しする
 * （待ちの間に学習が完全に止まる直列スケジューリングの解消）。
 * ホームの「現在地」表示は currentStageOf のまま＝待ちのstageが確認を通るまで動かない。
 */
export const pickContentStage = async (
  route: AdvRoute, currentStage: AdvRouteStage, masteredIds: Set<string>,
  stageDone: Set<string>, waitingIds: Set<string>,
): Promise<{ stage: AdvRouteStage; content: StageContent }> => {
  const startIdx = Math.max(0, route.stages.findIndex((s) => s.stageId === currentStage.stageId));
  const candidates = route.stages.slice(startIdx)
    .filter((s) => !stageDone.has(s.stageId) && !isConversationStage(s));
  let fallback: { stage: AdvRouteStage; content: StageContent } | null = null;
  for (const s of candidates) {
    const content = await stageContent(s, masteredIds, waitingIds);
    if (!fallback) fallback = { stage: s, content };
    if (content.nextGrammarIds.length > 0 || content.nextUnitIds.length > 0) return { stage: s, content };
  }
  if (fallback) return fallback;
  return { stage: currentStage, content: await stageContent(currentStage, masteredIds, waitingIds) };
};

/** stageのバトル対象が属するエリア単元の実在ガード（route⇔atlas整合） */
export const stageAreaUnitsExist = (stage: AdvRouteStage): boolean => {
  const units = stage.targets.n3UnitIds ?? [];
  const known = new Set(Object.values(AREA_UNIT_MAP).flat());
  return units.every((u) => known.has(u));
};
