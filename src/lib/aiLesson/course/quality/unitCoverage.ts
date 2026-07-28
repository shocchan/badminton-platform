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
  goalJa: string;
}

export interface UnitCoverageSpec {
  unitId: string;
  titleJa: string;
  titleZh: string;
  /** 単元が扱う語彙（全件）。ここに入った語は必ずどこかで評価される */
  targetVocabularyIds: string[];
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
  const missionItemsResolved = spec.practicalMission.usesItemIds.every(
    id => spec.targetVocabularyIds.includes(id) && byId.has(id));

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
  duplicateAssignments: string[];
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
  return {
    units: specs.length,
    vocabularyTotal: pool.length,
    vocabularyCovered: pool.filter(i => seen.has(i.id)).length,
    orphanVocabulary: pool.filter(i => !seen.has(i.id)).map(i => i.id),
    duplicateAssignments: [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id),
    requiredUntestedTotal: results.reduce((s, r) => s + r.requiredUntested.length, 0),
    highRiskContrastMissingTotal: results.reduce((s, r) => s + r.highRiskContrastMissing.length, 0),
    unitsFailing: results.filter(r => !r.passes).map(r => r.unitId),
  };
};
