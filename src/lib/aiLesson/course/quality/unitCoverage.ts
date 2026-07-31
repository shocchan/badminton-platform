// N3 Unit Coverage Contract（§14-§15）。
//
// 「N3攻略」を名乗る以上、対象語彙・文法が「学習・確認・使用・復習」のどこかで必ず扱われることを
// 機械検証できる形にする。巨大な一発テストに詰め込むのではなく、Unit全体を通じて全required Itemを扱う。
//
// 3段階（§15）:
//   Stage 1 理解   = reading / core_meaning
//   Stage 2 使い分け = context / collocation / particle / conjugation / scope_contrast / transfer_error
//   Stage 3 実践   = production（場面Mission・応答・並べ替え）
import type { FoundationItem } from '../foundationTypes';
import { buildAssessQuestions } from './assessQuestionEngine';
import { cognateProfileFor, type LearningDimension } from './cognateProfile';
import { contrastQuestionsFor } from './cognateContrastBank';

export type QuestionStage = 'understand' | 'distinguish' | 'apply';

export const STAGE_OF: Record<LearningDimension, QuestionStage> = {
  reading: 'understand', core_meaning: 'understand',
  context: 'distinguish', collocation: 'distinguish', particle: 'distinguish',
  conjugation: 'distinguish', scope_contrast: 'distinguish', transfer_error: 'distinguish',
  register: 'distinguish',
  production: 'apply',
};

export interface PracticalMission {
  missionId: string;
  titleJa: string;
  titleZh: string;
  /** その場面で必ず使う語（requiredVocabularyIdsの部分集合） */
  usesItemIds: string[];
  situationJa: string;
  situationZh: string;
  goalJa: string;
  goalZh: string;
}

export interface UnitCoverageSpec {
  unitId: string;
  /** 学習順。encounter（再登場）は「より前のUnitで学んだ語」だけを許す */
  order: number;
  titleJa: string;
  titleZh: string;
  /**
   * この単元で新しく学ぶ語（primary所属）。全単元を通じて重複0。
   * 一度学んだ語を別単元で再利用したい場合は encounterVocabularyIds を使う（Itemは複製しない）。
   */
  targetVocabularyIds: string[];
  /**
   * 別の場所・人物・文脈で再登場させる語（primaryは他単元にある）。
   * 再登場は禁止しない。ここに入れてもprimaryの重複にはならない。
   */
  encounterVocabularyIds: string[];
  /** 単元完了に必須の語彙（未評価が1件でもあれば未完了） */
  requiredVocabularyIds: string[];
  /** 中国語話者が誤りやすく、contrast問題が必須の語 */
  highRiskCognateIds: string[];
  /** 実践Mission（Stage 3）。単元完了に必須 */
  practicalMission: PracticalMission;
  minimumAccuracy: number;
  reviewPolicy: 'spaced_default';
  reviewStatus: 'human_review_candidate';
}

export interface UnitCoverageResult {
  unitId: string;
  targetCount: number;
  requiredCount: number;
  /** 評価問題を1問以上作れた語 */
  assessableCount: number;
  /** required なのに評価問題が作れない語（Production blocker） */
  requiredUntested: string[];
  /** 高リスクなのにcontrast問題が無い語（Production blocker） */
  highRiskContrastMissing: string[];
  /** Stage別の問題数 */
  stageCounts: Record<QuestionStage, number>;
  /** Stage 2以上が無い語（理解だけで終わっている語） */
  itemsWithoutDistinguish: string[];
  /** 実践Missionが参照する語がtargetに含まれているか */
  missionItemsResolved: boolean;
  passes: boolean;
}

/** 1単元のCoverageを実データから算出する（判定は機械的・人手の申告に依存しない） */
export const evaluateUnitCoverage = (
  spec: UnitCoverageSpec, pool: FoundationItem[],
): UnitCoverageResult => {
  const byId = new Map(pool.map(i => [i.id, i]));
  const stageCounts: Record<QuestionStage, number> = { understand: 0, distinguish: 0, apply: 0 };
  const requiredUntested: string[] = [];
  const itemsWithoutDistinguish: string[] = [];
  let assessableCount = 0;

  for (const id of spec.targetVocabularyIds) {
    const item = byId.get(id);
    if (!item) { if (spec.requiredVocabularyIds.includes(id)) requiredUntested.push(id); continue; }
    const qs = buildAssessQuestions(item, pool, { introduced: false });
    if (qs.length > 0) assessableCount++;
    else if (spec.requiredVocabularyIds.includes(id)) requiredUntested.push(id);
    for (const q of qs) stageCounts[STAGE_OF[q.dimension]]++;
    // 理解だけで終わる語を検出（§15: Stage 1だけで完了させない）
    if (!qs.some(q => STAGE_OF[q.dimension] === 'distinguish')) itemsWithoutDistinguish.push(id);
  }

  const highRiskContrastMissing = spec.highRiskCognateIds.filter(id => contrastQuestionsFor(id).length === 0);
  // Missionは「この単元の語」に加えて「前の単元で学んだ再登場語」も使える（§4）
  const usable = new Set([...spec.targetVocabularyIds, ...spec.encounterVocabularyIds]);
  const missionItemsResolved = spec.practicalMission.usesItemIds.every(id => usable.has(id) && byId.has(id));

  return {
    unitId: spec.unitId,
    targetCount: spec.targetVocabularyIds.length,
    requiredCount: spec.requiredVocabularyIds.length,
    assessableCount,
    requiredUntested,
    highRiskContrastMissing,
    stageCounts,
    itemsWithoutDistinguish,
    missionItemsResolved,
    passes: requiredUntested.length === 0 && highRiskContrastMissing.length === 0
      && missionItemsResolved && stageCounts.distinguish > 0,
  };
};

/** 語ごとのUnit所属（§4）。primaryは1つ、再登場・Mission・復習は複数可 */
export interface VocabularyMembership {
  itemId: string;
  primaryUnitId: string | null;
  encounterUnitIds: string[];
  missionUnitIds: string[];
  reviewContextIds: string[];
}

export const vocabularyMembership = (specs: UnitCoverageSpec[]): Map<string, VocabularyMembership> => {
  const m = new Map<string, VocabularyMembership>();
  const ensure = (id: string) => {
    if (!m.has(id)) m.set(id, { itemId: id, primaryUnitId: null, encounterUnitIds: [], missionUnitIds: [], reviewContextIds: [] });
    return m.get(id)!;
  };
  for (const s of specs) {
    for (const id of s.targetVocabularyIds) {
      const e = ensure(id);
      // primaryは1つだけ。2つ目が来たら記録せず、summarizeCoverageが重複として検出する
      if (e.primaryUnitId === null) e.primaryUnitId = s.unitId;
    }
    for (const id of s.encounterVocabularyIds) {
      const e = ensure(id);
      if (!e.encounterUnitIds.includes(s.unitId)) e.encounterUnitIds.push(s.unitId);
    }
    for (const id of s.practicalMission.usesItemIds) {
      const e = ensure(id);
      if (!e.missionUnitIds.includes(s.unitId)) e.missionUnitIds.push(s.unitId);
    }
    // 復習文脈: その単元で扱う語はすべて、その単元の復習対象になりうる
    for (const id of [...s.targetVocabularyIds, ...s.encounterVocabularyIds]) {
      const e = ensure(id);
      const ctx = `review:${s.unitId}`;
      if (!e.reviewContextIds.includes(ctx)) e.reviewContextIds.push(ctx);
    }
  }
  return m;
};

/** 高リスク語をtargetから自動抽出（specの手書き漏れを防ぐ） */
export const highRiskWithin = (targetIds: string[], pool: FoundationItem[]): string[] => {
  const byId = new Map(pool.map(i => [i.id, i]));
  return targetIds.filter(id => {
    const item = byId.get(id);
    return item ? cognateProfileFor(item).highRisk : false;
  });
};

export interface CoverageSummary {
  units: number;
  vocabularyTotal: number;
  vocabularyCovered: number;
  orphanVocabulary: string[];
  /** primary所属が2つ以上ある語（0でなければ契約違反） */
  duplicateAssignments: string[];
  /** 再登場の総数（禁止ではなく、むしろ望ましい） */
  encounterLinks: number;
  /** 前の単元で学んでいない語をencounterに入れている違反 */
  encounterBeforePrimary: string[];
  requiredUntestedTotal: number;
  highRiskContrastMissingTotal: number;
  unitsFailing: string[];
}

/** 全単元を横断して、語彙の網羅・重複・未評価を集計する */
export const summarizeCoverage = (
  specs: UnitCoverageSpec[], pool: FoundationItem[],
): CoverageSummary => {
  const seen = new Map<string, number>();
  for (const s of specs) for (const id of s.targetVocabularyIds) seen.set(id, (seen.get(id) ?? 0) + 1);
  const results = specs.map(s => evaluateUnitCoverage(s, pool));
  // encounterは「その語をprimaryで学ぶ単元より後」でなければならない
  const primaryOrder = new Map<string, number>();
  for (const s of specs) for (const id of s.targetVocabularyIds) {
    if (!primaryOrder.has(id)) primaryOrder.set(id, s.order);
  }
  const encounterBeforePrimary: string[] = [];
  let encounterLinks = 0;
  for (const s of specs) for (const id of s.encounterVocabularyIds) {
    encounterLinks++;
    const po = primaryOrder.get(id);
    if (po === undefined || po >= s.order) encounterBeforePrimary.push(`${s.unitId}:${id}`);
  }
  return {
    units: specs.length,
    vocabularyTotal: pool.length,
    vocabularyCovered: pool.filter(i => seen.has(i.id)).length,
    orphanVocabulary: pool.filter(i => !seen.has(i.id)).map(i => i.id),
    duplicateAssignments: [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    encounterLinks,
    encounterBeforePrimary,
    requiredUntestedTotal: results.reduce((s, r) => s + r.requiredUntested.length, 0),
    highRiskContrastMissingTotal: results.reduce((s, r) => s + r.highRiskContrastMissing.length, 0),
    unitsFailing: results.filter(r => !r.passes).map(r => r.unitId),
  };
};
