// N3 Unit 攻略ランタイム（§5・§6）。12単元すべてを同じエンジンで進行させる。
//
// 進行: intro → diagnostic → stage1(理解) → stage2(使い分け) → stage3(実践) → mission → result
//
// 設計上の約束:
// - 問題は assessQuestionEngine が生成する（teach内容を含まない＝答えを漏らさない）
// - 一問の簡単な正解だけで「定着」としない。diagnosticはStage1のskip判断にのみ使う
// - 保存は StoragePort 経由（正式Repositoryへ差し替え可能。UIは保存成否を知る必要がある）
// - 学習stateからRPGの世界変化を導出するが、逆向きの書き戻しはしない
import type { FoundationItem } from '../foundationTypes';
import { buildAssessQuestions, type AssessQuestion } from '../quality/assessQuestionEngine';
import { STAGE_OF, type QuestionStage, type UnitCoverageSpec } from '../quality/unitCoverage';

export type UnitPhase = 'intro' | 'diagnostic' | 'stage1' | 'stage2' | 'stage3' | 'mission' | 'result';

export const PHASE_ORDER: UnitPhase[] = ['intro', 'diagnostic', 'stage1', 'stage2', 'stage3', 'mission', 'result'];

export interface ItemAttempt {
  itemId: string;
  correctCount: number;
  wrongCount: number;
  lastCorrectAtMs: number | null;
}

export interface UnitRunState {
  version: 1;
  unitId: string;
  phase: UnitPhase;
  startedAtMs: number;
  completedAtMs: number | null;
  /** 診断で既習と判定された語（Stage1をskipする）。定着の断定ではない */
  diagnosticSkippedItemIds: string[];
  /** 現在のフェーズ内で何問目か */
  cursor: number;
  attempts: Record<string, ItemAttempt>;
  /** そのStageで正解した問題ID（再入時に重複出題しない） */
  clearedQuestionIds: string[];
  /** 間違えた語（復習予定へ回す） */
  reviewScheduledItemIds: string[];
  /** 診断で「まだ習っていない」を選んだ問題ID（診断のみ消化。Stage2では出題する） */
  diagnosticDeclinedQuestionIds: string[];
  missionCleared: boolean;
}

export const SCHEMA_VERSION = 1;

export const emptyRunState = (unitId: string, nowMs: number): UnitRunState => ({
  version: SCHEMA_VERSION, unitId, phase: 'intro', startedAtMs: nowMs, completedAtMs: null,
  diagnosticSkippedItemIds: [], cursor: 0, attempts: {}, clearedQuestionIds: [],
  reviewScheduledItemIds: [], diagnosticDeclinedQuestionIds: [], missionCleared: false,
});

/** 保存の抽象。localのみ／正式DBのどちらでも差し替えられる */
export interface StoragePort {
  load(unitId: string): Promise<UnitRunState | null>;
  save(state: UnitRunState): Promise<{ ok: true } | { ok: false; code: string }>;
}

export type LoadOutcome =
  | { kind: 'fresh'; state: UnitRunState }
  | { kind: 'resumed'; state: UnitRunState }
  | { kind: 'corrupted'; state: UnitRunState }
  | { kind: 'schema_newer'; state: UnitRunState };

/**
 * 保存値の復元。壊れた値・新しいschemaでも learner を行き止まりにしない。
 * 「壊れていました」ではなく「最初から始められます」を返せるように kind を返す。
 */
export const restoreRunState = (raw: unknown, unitId: string, nowMs: number): LoadOutcome => {
  if (raw === null || raw === undefined) return { kind: 'fresh', state: emptyRunState(unitId, nowMs) };
  const s = raw as Partial<UnitRunState>;
  if (typeof s.version === 'number' && s.version > SCHEMA_VERSION) {
    return { kind: 'schema_newer', state: emptyRunState(unitId, nowMs) };
  }
  const valid = s.version === SCHEMA_VERSION && s.unitId === unitId
    && typeof s.phase === 'string' && PHASE_ORDER.includes(s.phase as UnitPhase)
    && Array.isArray(s.clearedQuestionIds) && typeof s.attempts === 'object' && s.attempts !== null;
  if (!valid) return { kind: 'corrupted', state: emptyRunState(unitId, nowMs) };
  return { kind: 'resumed', state: { ...emptyRunState(unitId, nowMs), ...(s as UnitRunState) } };
};

/** その単元の全問題（Stage別）。encounter語も含めて別文脈で再確認できるようにする */
export interface UnitQuestionSet {
  byStage: Record<QuestionStage, AssessQuestion[]>;
  diagnostic: AssessQuestion[];
  allItemIds: string[];
}

export const buildUnitQuestions = (spec: UnitCoverageSpec, pool: FoundationItem[]): UnitQuestionSet => {
  const byId = new Map(pool.map(i => [i.id, i]));
  const byStage: Record<QuestionStage, AssessQuestion[]> = { understand: [], distinguish: [], apply: [] };
  const diagnostic: AssessQuestion[] = [];

  for (const id of spec.targetVocabularyIds) {
    const item = byId.get(id);
    if (!item) continue;
    for (const q of buildAssessQuestions(item, pool, { introduced: false })) {
      byStage[STAGE_OF[q.dimension]].push(q);
      // 診断は「使い分け」の1問で見る。読み・意味だけでskip判定しない（§5B）
      if (STAGE_OF[q.dimension] === 'distinguish' && !diagnostic.some(d => d.itemId === id)) diagnostic.push(q);
    }
  }
  // 再登場語は「別文脈での確認」としてStage2/3へ加える（Itemの複製ではない）
  for (const id of spec.encounterVocabularyIds) {
    const item = byId.get(id);
    if (!item) continue;
    for (const q of buildAssessQuestions(item, pool, { introduced: true })) {
      const stage = STAGE_OF[q.dimension];
      if (stage !== 'understand') byStage[stage].push(q);
    }
  }
  return { byStage, diagnostic, allItemIds: [...spec.targetVocabularyIds, ...spec.encounterVocabularyIds] };
};

const stageOfPhase = (phase: UnitPhase): QuestionStage | null =>
  phase === 'stage1' ? 'understand' : phase === 'stage2' ? 'distinguish' : phase === 'stage3' ? 'apply' : null;

/** 現在のフェーズで出す問題列（診断でskipした語のStage1は飛ばす） */
export const questionsForPhase = (
  set: UnitQuestionSet, state: UnitRunState,
): AssessQuestion[] => {
  if (state.phase === 'diagnostic') {
    return set.diagnostic.filter(q => !state.clearedQuestionIds.includes(q.questionId)
      && !state.diagnosticDeclinedQuestionIds.includes(q.questionId));
  }
  const stage = stageOfPhase(state.phase);
  if (!stage) return [];
  return set.byStage[stage].filter(q => {
    if (state.clearedQuestionIds.includes(q.questionId)) return false;
    // 診断で既習と判定された語は理解フェーズをskip（使い分け・実践は必ず通す）
    if (stage === 'understand' && state.diagnosticSkippedItemIds.includes(q.itemId)) return false;
    return true;
  });
};

const bumpAttempt = (state: UnitRunState, itemId: string, correct: boolean, nowMs: number): UnitRunState => {
  const a = state.attempts[itemId] ?? { itemId, correctCount: 0, wrongCount: 0, lastCorrectAtMs: null };
  return {
    ...state,
    attempts: {
      ...state.attempts,
      [itemId]: {
        ...a,
        correctCount: a.correctCount + (correct ? 1 : 0),
        wrongCount: a.wrongCount + (correct ? 0 : 1),
        lastCorrectAtMs: correct ? nowMs : a.lastCorrectAtMs,
      },
    },
  };
};

/** 解答を反映する（純関数）。正解でのみ前進し、誤答は復習予定へ回す */
export const answerQuestion = (
  state: UnitRunState, question: AssessQuestion, correct: boolean, nowMs: number,
): UnitRunState => {
  let next = bumpAttempt(state, question.itemId, correct, nowMs);
  if (!correct) {
    next = {
      ...next,
      reviewScheduledItemIds: next.reviewScheduledItemIds.includes(question.itemId)
        ? next.reviewScheduledItemIds : [...next.reviewScheduledItemIds, question.itemId],
    };
    return next;
  }
  next = { ...next, clearedQuestionIds: [...next.clearedQuestionIds, question.questionId] };
  // 診断で正解 → その語のStage1をskip（「定着」ではなく「導入は不要」の判断）
  if (state.phase === 'diagnostic' && !next.diagnosticSkippedItemIds.includes(question.itemId)) {
    next = { ...next, diagnosticSkippedItemIds: [...next.diagnosticSkippedItemIds, question.itemId] };
  }
  return next;
};

/**
 * 診断で「まだ習っていない」を選んだとき。誤答ではなく自己申告なので、
 * wrong加算・復習予定行きにはせず、診断の出題だけを消化して先へ進める。
 * - diagnosticSkippedItemIds には入れない＝Stage1で必ず導入から学ぶ
 * - clearedQuestionIds には入れない＝同じ問題がStage2（使い分け）で必ず出る
 */
export const markDiagnosticNotLearned = (
  state: UnitRunState, question: AssessQuestion,
): UnitRunState => {
  if (state.phase !== 'diagnostic') return state;
  if (state.diagnosticDeclinedQuestionIds.includes(question.questionId)) return state;
  return {
    ...state,
    diagnosticDeclinedQuestionIds: [...state.diagnosticDeclinedQuestionIds, question.questionId],
  };
};

/** そのフェーズの残り問題が0なら次のフェーズへ */
export const advancePhaseIfDone = (
  state: UnitRunState, set: UnitQuestionSet, spec: UnitCoverageSpec, nowMs: number,
): UnitRunState => {
  if (state.phase === 'intro') return { ...state, phase: 'diagnostic', cursor: 0 };
  if (state.phase === 'mission') {
    return state.missionCleared
      ? { ...state, phase: 'result', completedAtMs: state.completedAtMs ?? nowMs } : state;
  }
  if (state.phase === 'result') return state;
  if (questionsForPhase(set, state).length > 0) return state;
  const order: UnitPhase[] = ['diagnostic', 'stage1', 'stage2', 'stage3', 'mission'];
  const idx = order.indexOf(state.phase);
  const nextPhase = order[idx + 1] ?? 'mission';
  // 実践Missionが定義されていない単元は無い（契約で保証）が、念のため
  if (nextPhase === 'mission' && !spec.practicalMission) {
    return { ...state, phase: 'result', completedAtMs: state.completedAtMs ?? nowMs };
  }
  return { ...state, phase: nextPhase, cursor: 0 };
};

export const clearMission = (state: UnitRunState, nowMs: number): UnitRunState =>
  ({ ...state, missionCleared: true, phase: 'result', completedAtMs: state.completedAtMs ?? nowMs });

export interface UnitRunSummary {
  unitId: string;
  targetCount: number;
  attemptedCount: number;
  passedCount: number;
  reviewScheduledCount: number;
  untestedItemIds: string[];
  missionCleared: boolean;
  accuracy: number;
  meetsMinimumAccuracy: boolean;
  completed: boolean;
}

/** 単元の結果集計（申告ではなく実際の解答から算出する） */
export const summarizeRun = (
  state: UnitRunState, spec: UnitCoverageSpec, set: UnitQuestionSet,
): UnitRunSummary => {
  const target = spec.targetVocabularyIds;
  const attempted = target.filter(id => !!state.attempts[id]);
  // 「通過」= その語の問題を1問以上正解し、誤答より正解が多い
  const passed = target.filter(id => {
    const a = state.attempts[id];
    return !!a && a.correctCount > 0 && a.correctCount >= a.wrongCount;
  });
  const totalCorrect = Object.values(state.attempts).reduce((s, a) => s + a.correctCount, 0);
  const totalWrong = Object.values(state.attempts).reduce((s, a) => s + a.wrongCount, 0);
  const accuracy = totalCorrect + totalWrong === 0 ? 0 : totalCorrect / (totalCorrect + totalWrong);
  const untested = target.filter(id => !state.attempts[id] && set.byStage.understand.some(q => q.itemId === id));
  return {
    unitId: spec.unitId,
    targetCount: target.length,
    attemptedCount: attempted.length,
    passedCount: passed.length,
    reviewScheduledCount: state.reviewScheduledItemIds.length,
    untestedItemIds: untested,
    missionCleared: state.missionCleared,
    accuracy,
    meetsMinimumAccuracy: accuracy >= spec.minimumAccuracy,
    completed: state.phase === 'result' && state.missionCleared,
  };
};

/** 単元完了で世界に起きる変化（RPG層はこれをread onlyで使う） */
export const worldChangeFor = (spec: UnitCoverageSpec): { placeJa: string; unlockJa: string } => ({
  placeJa: spec.titleJa,
  unlockJa: `${spec.practicalMission.titleJa}ができるようになり、次の場所へ進めます`,
});
