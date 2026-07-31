// Phase 3P-1: production manifestの同期ガード。
// 未完成数は必ず単一集計から導出され、manifestと実データが食い違わないことを固定する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildContentReleaseMatrix } from './contentReleaseAudit';
import { N2_GRAMMAR_ITEMS } from './n2GrammarData';

const gen = (name: string) => JSON.parse(readFileSync(
  join(__dirname, '../../../..', 'docs/ai-course/production/generated', name), 'utf8'));

describe('production manifest 同期ガード', () => {
  const m = buildContentReleaseMatrix();
  it('イラストcoverageは実manifest由来（total140・importedはaudit一致）', () => {
    const ill = gen('illustration-coverage-manifest.json');
    expect(ill.total).toBe(m.vocabulary.total);
    expect(ill.imported).toBe(m.vocabulary.imageImported);
    expect(ill.imported + ill.missing).toBe(ill.total);
    expect(ill.humanApproved).toBe(0);   // 人間承認前にapprovedへしない
  });
  it('文法manifestはN2 180全件・N3は未取込120を正直に記録', () => {
    const g = gen('grammar-completion-manifest.json');
    expect(g.n2.total).toBe(N2_GRAMMAR_ITEMS.length);
    expect(g.n2.complete + g.n2.incomplete).toBe(g.n2.total);
    expect(g.n3.imported).toBe(0);
    expect(g.n3.incomplete).toBe(120);
  });
  it('completion matrixの主要値が導出値と一致する', () => {
    const p = gen('production-completion-matrix.json').counts;
    expect(p.missingIllustrations).toBe(m.vocabulary.imagePlannedOrNone);
    expect(p.conversationMissing.vocabContextualGap).toBe(m.vocabulary.total - m.vocabulary.conversationConnected);
    expect(p.n2GrammarIncomplete).toBe(180 - gen('grammar-completion-manifest.json').n2.complete);
    expect(p.zhMissing.vocab).toBe(m.vocabulary.total - m.vocabulary.chineseVerified);
  });
  it('surface manifestは機械走査由来（マーカー合計=種別合計）', () => {
    const s = gen('unfinished-surface-manifest.json');
    const sum = Object.values(s.markers.byKind as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(s.markers.total).toBe(sum);
    expect(s.markers.findings.length).toBe(s.markers.total);
  });
});
