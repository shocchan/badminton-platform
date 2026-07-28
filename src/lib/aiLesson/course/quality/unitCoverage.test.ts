// N3 Unit Coverage Contract のガード（§14-§15）。
// 「N3攻略」を名乗る条件を機械固定する: 対象語の孤立0・required未評価0・
// 高リスクcontrast欠落0・全単元でStage2以上と実践Missionが成立。
import { describe, it, expect } from 'vitest';
import { N3_UNIT_SPECS } from './n3UnitSpecs';
import { evaluateUnitCoverage, summarizeCoverage, STAGE_OF, highRiskWithin, vocabularyMembership } from './unitCoverage';
import { allVocabularyItems } from '../foundationVocabBank';
import { buildAssessQuestions } from './assessQuestionEngine';
import { highRiskCognateIds } from './cognateProfile';

const pool = allVocabularyItems();

describe('N3 Unit Coverage Contract', () => {
  const summary = summarizeCoverage(N3_UNIT_SPECS, pool);

  it('全語彙が単元へ割り当てられている（孤立0・重複0）', () => {
    expect(summary.vocabularyCovered).toBe(summary.vocabularyTotal);
    expect(summary.orphanVocabulary).toEqual([]);
    expect(summary.duplicateAssignments).toEqual([]);
  });
  it('required語の未評価が0（Production条件）', () => {
    expect(summary.requiredUntestedTotal).toBe(0);
  });
  it('高リスク同形語のcontrast欠落が0（Production条件）', () => {
    expect(summary.highRiskContrastMissingTotal).toBe(0);
  });
  it('全単元がCoverage契約を満たす', () => {
    expect(summary.unitsFailing).toEqual([]);
  });
  it('各単元に理解・使い分け・実践の3段階がそろう（Stage1だけで完了しない）', () => {
    for (const spec of N3_UNIT_SPECS) {
      const r = evaluateUnitCoverage(spec, pool);
      expect(r.stageCounts.understand, `${r.unitId} 理解`).toBeGreaterThan(0);
      expect(r.stageCounts.distinguish, `${r.unitId} 使い分け`).toBeGreaterThan(0);
      expect(r.stageCounts.apply, `${r.unitId} 実践`).toBeGreaterThan(0);
    }
  });
  it('実践Missionが実在の対象語だけを参照する', () => {
    for (const spec of N3_UNIT_SPECS) {
      expect(spec.practicalMission.usesItemIds.length).toBeGreaterThanOrEqual(3);
      expect(evaluateUnitCoverage(spec, pool).missionItemsResolved, spec.unitId).toBe(true);
    }
  });
  it('specの高リスク語が実際の高リスク判定と一致する（手書き漏れなし）', () => {
    for (const spec of N3_UNIT_SPECS) {
      const actual = highRiskWithin(spec.targetVocabularyIds, pool).sort();
      expect([...spec.highRiskCognateIds].sort(), spec.unitId).toEqual(actual);
    }
    // 全単元の高リスクを合わせるとプロファイル側の高リスク全件になる
    const all = new Set(N3_UNIT_SPECS.flatMap(s => s.highRiskCognateIds));
    for (const id of highRiskCognateIds()) expect(all.has(id), `${id} がどの単元にも入っていない`).toBe(true);
  });
  it('Unit所属: primaryは1つ・再登場/Mission/復習は複数可（§4）', () => {
    const mem = vocabularyMembership(N3_UNIT_SPECS);
    expect(mem.size).toBe(pool.length);
    for (const m of mem.values()) {
      expect(m.primaryUnitId, `${m.itemId} にprimary所属がない`).toBeTruthy();
      // 再登場・Mission・復習は複数可（禁止しない）
      expect(Array.isArray(m.encounterUnitIds)).toBe(true);
      expect(m.reviewContextIds.length).toBeGreaterThanOrEqual(1);
    }
    // 実際に再登場している語が存在する（同じItemを複製せず別文脈で使えている）
    const reencountered = [...mem.values()].filter(m => m.encounterUnitIds.length > 0);
    expect(reencountered.length).toBeGreaterThanOrEqual(10);
    for (const m of reencountered) {
      expect(m.encounterUnitIds).not.toContain(m.primaryUnitId); // primaryと同じ単元は再登場ではない
    }
  });
  it('再登場は必ず「前の単元で学んだ語」（学ぶ前に再登場しない）', () => {
    expect(summary.encounterBeforePrimary).toEqual([]);
    expect(summary.encounterLinks).toBeGreaterThan(0);
  });
  it('単元specは全件human_review_candidate（自動承認なし）', () => {
    for (const spec of N3_UNIT_SPECS) {
      expect(spec.reviewStatus).toBe('human_review_candidate');
      expect(spec.minimumAccuracy).toBeGreaterThanOrEqual(0.7);
    }
  });
  it('Stage分類が全dimensionを覆う', () => {
    const dims = new Set(pool.flatMap(i => buildAssessQuestions(i, pool, { introduced: false })).map(q => q.dimension));
    for (const d of dims) expect(STAGE_OF[d], `${d} のStage未定義`).toBeTruthy();
  });
});
