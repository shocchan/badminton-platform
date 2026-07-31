// Phase R1: N3/N2 overlap Usage構造化のガード。二重Item化とレベル自動確定を防ぐ。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { N3_N2_OVERLAP_USAGES, overlapByN2Id } from './n3n2OverlapUsages';
import { N2_GRAMMAR_DRAFTS } from './n2GrammarDrafts';

const audit = JSON.parse(readFileSync(join(__dirname, '../../../..',
  'docs/ai-course/production/generated/n3-grammar-source-audit.json'), 'utf8'));

describe('N3/N2 overlap Usage構造化（38件）', () => {
  it('auditのn2_overlap 38件を過不足なく覆う', () => {
    const auditIds = new Set(
      audit.entries.filter((e: { classification: string }) => e.classification === 'n2_overlap')
        .map((e: { sourceRowId: string }) => e.sourceRowId));
    expect(auditIds.size).toBe(38);
    expect(N3_N2_OVERLAP_USAGES.length).toBe(38);
    for (const o of N3_N2_OVERLAP_USAGES) {
      expect(auditIds.has(o.n3SourceRowId), `${o.n3SourceRowId} がauditに無い`).toBe(true);
    }
    expect(new Set(N3_N2_OVERLAP_USAGES.map(o => o.n3SourceRowId)).size).toBe(38);
  });
  it('アンカーは既存N2 completeDraftのみ（新Item・二重Item化なし）', () => {
    const draftIds = new Set(N2_GRAMMAR_DRAFTS.map(d => d.grammarId));
    const anchors = N3_N2_OVERLAP_USAGES.map(o => o.n2ItemId);
    expect(new Set(anchors).size).toBe(38); // アンカー重複なし
    for (const id of anchors) expect(draftIds.has(id), `${id} はcompleteDraftに無い`).toBe(true);
  });
  it('レベル最終配置は全件人間判断待ちのまま（自動確定しない）', () => {
    for (const o of N3_N2_OVERLAP_USAGES) {
      expect(o.levelPlacement).toBe('awaiting_level_decision');
      expect(o.core.levelCandidate).toBe('N3');
      expect(o.relationCandidate).toMatch(/^(same_item_same_usage|same_item_extended_usage|same_pattern_different_usage|different_register|different_nuance|relation_only|human_decision_required)$/);
      expect(o.rationale.length).toBeGreaterThan(10);
      expect(o.reviewKey).toBe(`overlap-${o.n2ItemId}`);
      expect(o.sourceRefs).toContain(o.n3SourceRowId);
      expect(o.sourceRefs).toContain(o.n2ItemId);
      expect(o.core.meaningZh.length).toBeGreaterThan(0);
      expect(o.core.exampleJa.length).toBeGreaterThan(0);
    }
  });
  it('lookupが機能する', () => {
    expect(overlapByN2Id('n2g-002')?.n3SourceRowId).toBe('n3row-2');
    expect(overlapByN2Id('n2g-999')).toBeUndefined();
  });
});
