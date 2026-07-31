// N3 Unit ランタイムのガード（§6）。12単元すべてが実データで最後まで進行できることを固定する。
import { describe, it, expect } from 'vitest';
import {
  buildUnitQuestions, questionsForPhase, answerQuestion, advancePhaseIfDone,
  markDiagnosticNotLearned, clearMission, summarizeRun, emptyRunState, restoreRunState, worldChangeFor,
  SCHEMA_VERSION, type UnitRunState,
} from './unitRuntime';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { allVocabularyItems } from '../foundationVocabBank';
import { STAGE_OF } from '../quality/unitCoverage';

const pool = allVocabularyItems();
const NOW = 1_800_000_000_000;

/** 全問正解で単元を最後まで通す（診断はskipせず全フェーズを踏む） */
const runUnitToCompletion = (specIndex: number, opts: { passDiagnostic: boolean }) => {
  const spec = N3_UNIT_SPECS[specIndex];
  const set = buildUnitQuestions(spec, pool);
  let state = emptyRunState(spec.unitId, NOW);
  state = advancePhaseIfDone(state, set, spec, NOW); // intro -> diagnostic

  let guard = 0;
  while (state.phase !== 'mission' && state.phase !== 'result') {
    if (guard++ > 2000) throw new Error(`${spec.unitId}: 進行が終わらない（${state.phase}）`);
    const queue = questionsForPhase(set, state);
    if (queue.length === 0) { state = advancePhaseIfDone(state, set, spec, NOW); continue; }
    const q = queue[0];
    // 診断フェーズは opts で「既習（正解）」か「まだ習っていない（自己申告）」を切り替える
    if (state.phase === 'diagnostic' && !opts.passDiagnostic) {
      state = markDiagnosticNotLearned(state, q); // UIの「まだ習っていない」と同じ経路
    } else {
      state = answerQuestion(state, q, true, NOW);
    }
    state = advancePhaseIfDone(state, set, spec, NOW);
  }
  if (state.phase === 'mission') state = clearMission(state, NOW);
  return { spec, set, state };
};

describe('N3 Unit ランタイム: 12単元すべてが完走できる', () => {
  it('全12単元が result まで到達し、Mission成立・世界変化が定義される', () => {
    expect(N3_UNIT_SPECS.length).toBe(12);
    for (let i = 0; i < N3_UNIT_SPECS.length; i++) {
      const { spec, set, state } = runUnitToCompletion(i, { passDiagnostic: false });
      expect(state.phase, `${spec.unitId} が完了しない`).toBe('result');
      expect(state.missionCleared, `${spec.unitId} のMissionが未達`).toBe(true);
      const summary = summarizeRun(state, spec, set);
      expect(summary.completed).toBe(true);
      expect(summary.untestedItemIds, `${spec.unitId} に未評価の語が残る`).toEqual([]);
      expect(summary.passedCount).toBe(summary.targetCount);
      expect(worldChangeFor(spec).unlockJa.length).toBeGreaterThan(5);
    }
  });
  it('各単元が3段階すべての問題を持つ（Stage1だけで終わらない）', () => {
    for (const spec of N3_UNIT_SPECS) {
      const set = buildUnitQuestions(spec, pool);
      expect(set.byStage.understand.length, `${spec.unitId} 理解`).toBeGreaterThan(0);
      expect(set.byStage.distinguish.length, `${spec.unitId} 使い分け`).toBeGreaterThan(0);
      expect(set.byStage.apply.length, `${spec.unitId} 実践`).toBeGreaterThan(0);
      expect(set.diagnostic.length, `${spec.unitId} 診断`).toBeGreaterThan(0);
    }
  });
  it('診断で正解した語はStage1をskipするが、使い分け・実践は必ず通る', () => {
    const { spec, set, state } = runUnitToCompletion(0, { passDiagnostic: true });
    expect(state.diagnosticSkippedItemIds.length).toBeGreaterThan(0);
    // skipされた語もStage2以降で必ず出題されている（＝一問で定着扱いにしない）
    for (const id of state.diagnosticSkippedItemIds) {
      const laterQuestions = [...set.byStage.distinguish, ...set.byStage.apply].filter(q => q.itemId === id);
      expect(laterQuestions.length, `${spec.unitId}/${id} が使い分け以降で出題されない`).toBeGreaterThan(0);
      const answered = laterQuestions.some(q => state.clearedQuestionIds.includes(q.questionId));
      expect(answered, `${id} が診断だけで通過している`).toBe(true);
    }
  });
  it('誤答した語は復習予定へ入る', () => {
    const spec = N3_UNIT_SPECS[0];
    const set = buildUnitQuestions(spec, pool);
    let state = advancePhaseIfDone(emptyRunState(spec.unitId, NOW), set, spec, NOW);
    const q = questionsForPhase(set, state)[0];
    state = answerQuestion(state, q, false, NOW);
    expect(state.reviewScheduledItemIds).toContain(q.itemId);
    expect(state.clearedQuestionIds).not.toContain(q.questionId); // 誤答では前進しない
  });
  it('診断の「まだ習っていない」は行き止まりにならず、誤答扱いもしない（§6）', () => {
    const spec = N3_UNIT_SPECS[0];
    const set = buildUnitQuestions(spec, pool);
    let state = advancePhaseIfDone(emptyRunState(spec.unitId, NOW), set, spec, NOW);
    const before = questionsForPhase(set, state);
    const q = before[0];
    state = markDiagnosticNotLearned(state, q);
    const after = questionsForPhase(set, state);
    // 同じ問題が先頭に残り続けない（前進する）
    expect(after.length).toBe(before.length - 1);
    expect(after.some(x => x.questionId === q.questionId)).toBe(false);
    // 誤答ではない: wrong加算なし・復習予定行きなし・既習skipにもしない
    expect(state.attempts[q.itemId]?.wrongCount ?? 0).toBe(0);
    expect(state.reviewScheduledItemIds).not.toContain(q.itemId);
    expect(state.diagnosticSkippedItemIds).not.toContain(q.itemId);
    // 使い分け（Stage2）では同じ問題が必ず出る（clearedにしない）
    expect(state.clearedQuestionIds).not.toContain(q.questionId);
  });
  it('全問「まだ習っていない」でも診断が終わりStage1へ進む', () => {
    const spec = N3_UNIT_SPECS[0];
    const set = buildUnitQuestions(spec, pool);
    let state = advancePhaseIfDone(emptyRunState(spec.unitId, NOW), set, spec, NOW);
    let guard = 0;
    while (state.phase === 'diagnostic') {
      if (guard++ > 100) throw new Error('診断が終わらない');
      const q = questionsForPhase(set, state)[0];
      state = advancePhaseIfDone(markDiagnosticNotLearned(state, q), set, spec, NOW);
    }
    expect(state.phase).toBe('stage1');
    // 全語がStage1で導入される（skipされない）
    expect(state.diagnosticSkippedItemIds).toEqual([]);
    expect(questionsForPhase(set, state).length).toBe(set.byStage.understand.length);
  });
  it('encounter語は理解フェーズには出ず、使い分け以降で再登場する（§4）', () => {
    const spec = N3_UNIT_SPECS.find(s => s.encounterVocabularyIds.length > 0)!;
    const set = buildUnitQuestions(spec, pool);
    for (const id of spec.encounterVocabularyIds) {
      expect(set.byStage.understand.some(q => q.itemId === id), `${id} が理解フェーズに出ている`).toBe(false);
      const later = [...set.byStage.distinguish, ...set.byStage.apply].some(q => q.itemId === id);
      expect(later, `${id} が再登場していない`).toBe(true);
    }
  });
});

describe('N3 Unit ランタイム: 中断復帰とエラー状態（§5G）', () => {
  it('保存値から続きを復元する', () => {
    const spec = N3_UNIT_SPECS[0];
    const saved: UnitRunState = { ...emptyRunState(spec.unitId, NOW), phase: 'stage2', cursor: 3 };
    const out = restoreRunState(saved, spec.unitId, NOW);
    expect(out.kind).toBe('resumed');
    expect(out.state.phase).toBe('stage2');
  });
  it('旧形式（diagnosticDeclinedQuestionIdsなし）の保存値も既定値[]で復元できる', () => {
    const spec = N3_UNIT_SPECS[0];
    const legacy = { ...emptyRunState(spec.unitId, NOW), phase: 'diagnostic' as const };
    delete (legacy as Partial<UnitRunState>).diagnosticDeclinedQuestionIds;
    const out = restoreRunState(legacy, spec.unitId, NOW);
    expect(out.kind).toBe('resumed');
    expect(out.state.diagnosticDeclinedQuestionIds).toEqual([]);
  });
  it('保存値なしは新規、壊れた値・別単元は最初から（行き止まりにしない）', () => {
    expect(restoreRunState(null, 'u', NOW).kind).toBe('fresh');
    expect(restoreRunState({ version: 1, unitId: 'other' }, 'u', NOW).kind).toBe('corrupted');
    expect(restoreRunState({ nonsense: true }, 'u', NOW).kind).toBe('corrupted');
    expect(restoreRunState({ version: 1, unitId: 'u', phase: 'nope' }, 'u', NOW).kind).toBe('corrupted');
    for (const kind of ['corrupted', 'fresh'] as const) {
      const st = restoreRunState(kind === 'fresh' ? null : { bad: 1 }, 'u', NOW).state;
      expect(st.phase).toBe('intro'); // 常に開始可能な状態へ落ちる
    }
  });
  it('新しいschemaの保存値は上書きせず、最初から始められる状態を返す', () => {
    const out = restoreRunState({ version: SCHEMA_VERSION + 1, unitId: 'u', phase: 'stage3' }, 'u', NOW);
    expect(out.kind).toBe('schema_newer');
    expect(out.state.phase).toBe('intro');
  });
  it('Stage分類は問題のdimensionと一致する（フェーズの取り違えがない）', () => {
    for (const spec of N3_UNIT_SPECS) {
      const set = buildUnitQuestions(spec, pool);
      for (const q of set.byStage.understand) expect(STAGE_OF[q.dimension]).toBe('understand');
      for (const q of set.byStage.distinguish) expect(STAGE_OF[q.dimension]).toBe('distinguish');
      for (const q of set.byStage.apply) expect(STAGE_OF[q.dimension]).toBe('apply');
    }
  });
});
