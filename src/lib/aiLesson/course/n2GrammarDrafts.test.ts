// Phase 3P-5: N2文法完成draftのガード。原本との整合と、field埋めでない実質を検証する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { N2_GRAMMAR_DRAFTS } from './n2GrammarDrafts';
import { N2_GRAMMAR_ITEMS } from './n2GrammarData';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';

const audit = JSON.parse(readFileSync(join(__dirname, '../../../..',
  'docs/ai-course/production/generated/n2-grammar-source-audit.json'), 'utf8'));
const vocabIds = new Set([...allVocabularyItems(), ...N3_ITEMS].map(i => i.id));
const byId = new Map(N2_GRAMMAR_ITEMS.map(g => [g.grammarId, g]));

describe('N2文法 source監査manifest', () => {
  it('180件すべてが理由付きterminal stateを持つ（未分類0）', () => {
    expect(audit.totals.items).toBe(180);
    expect(audit.totals.unclassified).toBe(0);
    const sum = Object.values(audit.totals.byClassification as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(180);
  });
  it('原本の実態を正直に記録（中文0・meaningJa 10・例文180・同義注記7）', () => {
    expect(audit.totals.meaningZhPresent).toBe(0);
    expect(audit.totals.meaningJaPresent).toBe(10);
    expect(audit.totals.examplesPresent).toBe(180);
    expect(audit.totals.byClassification.synonym_of_other_item).toBe(7);
    expect(audit.totals.byClassification.n3_sheet_can_fill).toBe(38);
  });
  it('同義注記は自動統合せず人間判断へ送る', () => {
    for (const e of audit.entries.filter((x: { classification: string }) =>
      x.classification === 'synonym_of_other_item')) {
      expect(e.terminalState).toBe('awaiting_merge_decision');
    }
  });
});

describe('N2文法 完成draft', () => {
  it('必須fieldが全件完備', () => {
    for (const d of N2_GRAMMAR_DRAFTS) {
      expect(d.explanationZh.length).toBeGreaterThan(8);
      expect(d.formation.length).toBeGreaterThan(4);
      expect(d.usageScene.length).toBeGreaterThan(5);
      expect(d.nuance.length).toBeGreaterThan(5);
      expect(d.examplesJa.length).toBeGreaterThanOrEqual(2);
      expect(d.examplesZh.length).toBe(d.examplesJa.length);
      expect(d.furigana.length).toBeGreaterThan(0);
      expect(d.commonMistakesZh.length).toBeGreaterThan(10);
      expect(d.learnerFocus.length).toBeGreaterThan(10);
      expect(d.contrast.length).toBeGreaterThan(5);
      expect(d.recognition.options.length).toBe(4);
      expect(d.production.expected.length).toBeGreaterThan(0);
      expect(d.vocabularyLinks.length).toBeGreaterThan(0);
      expect(d.unit).toBeGreaterThan(0);
    }
  });
  it('grammarIdが原本n2GrammarDataに実在し、原本の第1例文を改変していない', () => {
    for (const d of N2_GRAMMAR_DRAFTS) {
      const src = byId.get(d.grammarId);
      expect(src, `${d.grammarId} が原本にない`).toBeTruthy();
      // 原本例文はふりがな注記を含むため、括弧注記を除いた本文が一致することを見る。
      // やむを得ず編集した場合は sourceExampleEdit に原文と理由を必ず残す（改変を隠さない）。
      const strip = (s: string) => s.replace(/[（(][ぁ-ん]+[)）]/g, '');
      if (d.sourceExampleEdit) {
        expect(strip(d.sourceExampleEdit.original)).toBe(strip(src!.examples[0]));
        expect(d.sourceExampleEdit.reason.length).toBeGreaterThan(10);
      } else {
        expect(strip(d.examplesJa[0])).toBe(strip(src!.examples[0]));
      }
    }
  });
  it('例文に文型の核が実在する（field埋め防止）', () => {
    for (const d of N2_GRAMMAR_DRAFTS) {
      const core = d.pattern.replace(/[〜~（）()]/g, '').slice(0, 2);
      expect(d.examplesJa.some(e => e.includes(core)), `${d.grammarId}: 例文に「${core}」が無い`).toBe(true);
    }
  });
  it('vocabularyLinksの参照切れ0・自動昇格なし', () => {
    for (const d of N2_GRAMMAR_DRAFTS) {
      for (const v of d.vocabularyLinks) expect(vocabIds.has(v), `未知ID ${v}`).toBe(true);
      expect(d.reviewStatus).toBe('draft');
      expect(d.humanReviewed).toBe(false);
      expect(d.approved).toBe(false);
    }
  });
  it('N3シート由来の中文を使った場合は出典を記録している', () => {
    const withSource = N2_GRAMMAR_DRAFTS.filter(d => d.zhSourceRowId);
    expect(withSource.length).toBeGreaterThan(0);
    for (const d of withSource) expect(d.zhSourceRowId).toMatch(/^n3row-\d+$/);
  });
});
