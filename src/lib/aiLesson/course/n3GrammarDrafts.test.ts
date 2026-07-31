// Phase 3P-4: N3文法完成draftのガード。
// field存在だけで完成扱いにせず、参照整合・重複・問題の正解位置まで検証する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { N3_GRAMMAR_DRAFTS } from './n3GrammarDrafts';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';

const audit = JSON.parse(readFileSync(join(__dirname, '../../../..',
  'docs/ai-course/production/generated/n3-grammar-source-audit.json'), 'utf8'));
const vocabIds = new Set([...allVocabularyItems(), ...N3_ITEMS].map(i => i.id));

describe('N3文法 source監査manifest', () => {
  it('120行すべてが理由付きterminal stateを持つ（未分類0）', () => {
    expect(audit.totals.excelRows).toBe(120);
    expect(audit.totals.unclassified).toBe(0);
    const sum = Object.values(audit.totals.byClassification as Record<string, number>)
      .reduce((a, b) => a + b, 0);
    expect(sum).toBe(120);
    for (const e of audit.entries) {
      expect(e.terminalState.length).toBeGreaterThan(0);
      expect(e.reason.length).toBeGreaterThan(0);
    }
  });
  it('120行=120文型と仮定していない（独立表記114・完全重複6・N2重なり38）', () => {
    expect(audit.totals.distinctSurface).toBe(114);
    expect(audit.totals.byClassification.exact_duplicate).toBe(6);
    expect(audit.totals.byClassification.n2_overlap).toBe(38);
    expect(audit.totals.byClassification.independent_pattern).toBe(76);
  });
  it('N2重なりは自動でレベル決定せず人間判断へ送る', () => {
    for (const e of audit.entries.filter((x: { classification: string }) => x.classification === 'n2_overlap')) {
      expect(e.terminalState).toBe('awaiting_level_decision');
      expect(e.n2ItemId).toMatch(/^n2g-/);
    }
  });
});

describe('N3文法 完成draft', () => {
  it('必須fieldが全件完備（不完全な文型は追加しない）', () => {
    for (const d of N3_GRAMMAR_DRAFTS) {
      expect(d.pattern.length).toBeGreaterThan(0);
      expect(d.reading.length).toBeGreaterThan(0);
      expect(d.meaningJa.length).toBeGreaterThan(0);
      expect(d.explanationZh.length).toBeGreaterThan(8);
      expect(d.formation.length).toBeGreaterThan(4);     // 接続の明示
      expect(d.usageScene.length).toBeGreaterThan(5);
      expect(d.nuance.length).toBeGreaterThan(5);
      expect(d.examplesJa.length).toBeGreaterThanOrEqual(2);
      expect(d.examplesZh.length).toBe(d.examplesJa.length);
      expect(d.furigana.length).toBeGreaterThan(0);
      expect(d.commonMistakesZh.length).toBeGreaterThan(10);
      expect(d.learnerFocus.length).toBeGreaterThan(10);
      expect(d.similarPatterns.length).toBeGreaterThan(0);
      expect(d.contrast.length).toBeGreaterThan(5);
      expect(d.recognition.options.length).toBe(4);
      expect(d.recognition.distractorReason.length).toBeGreaterThan(5);
      expect(d.production.expected.length).toBeGreaterThan(0);
      expect(d.practice.targetUse.length).toBeGreaterThan(0);
      expect(d.vocabularyLinks.length).toBeGreaterThan(0);
      expect(d.reviewKey).toBe(d.grammarId);
      expect(d.unit).toMatch(/^n3g-unit-/);
    }
  });
  it('例文に対象文型の核が実際に含まれる（形だけのfield埋めを防ぐ）', () => {
    for (const d of N3_GRAMMAR_DRAFTS) {
      // 「〜や〜など」のような不連続文型は分割し、全断片が同一例文に現れることを見る
      const parts = d.pattern.replace(/[（(].*?[)）]/g, '').split(/[〜~]/)
        .map(s => s.trim()).filter(Boolean).map(s => s.slice(0, 2));
      const hit = d.matchKeys
        ? d.examplesJa.some(e => d.matchKeys!.some(k => e.includes(k)))
        : d.examplesJa.some(e => parts.every(p => e.includes(p)));
      expect(hit, `${d.grammarId}: 例文に「${(d.matchKeys ?? parts).join('/')}」が揃っていない`).toBe(true);
    }
  });
  it('vocabularyLinksが実在する語彙IDを指す（参照切れ0）', () => {
    for (const d of N3_GRAMMAR_DRAFTS) {
      for (const v of d.vocabularyLinks) {
        expect(vocabIds.has(v), `${d.grammarId}: 未知の語彙ID ${v}`).toBe(true);
      }
    }
  });
  it('sourceRowIdが監査manifestのdraft対象行に一致する', () => {
    const targets = new Map(audit.entries
      .filter((e: { classification: string }) => e.classification === 'independent_pattern')
      .map((e: { sourceRowId: string; pattern: string }) => [e.sourceRowId, e.pattern]));
    for (const d of N3_GRAMMAR_DRAFTS) {
      expect(targets.has(d.sourceRowId), `${d.grammarId}: 対象外のsourceRowId`).toBe(true);
    }
  });
  it('grammarId・pattern・starter質問が全件固有（テンプレ量産防止）', () => {
    const ids = N3_GRAMMAR_DRAFTS.map(d => d.grammarId);
    expect(new Set(ids).size).toBe(ids.length);
    const pats = N3_GRAMMAR_DRAFTS.map(d => d.pattern);
    expect(new Set(pats).size).toBe(pats.length);
    const st = N3_GRAMMAR_DRAFTS.map(d => d.practice.starterJa);
    expect(new Set(st).size).toBe(st.length);
  });
  it('自動昇格なし（全件draft・human_reviewed/approved false）', () => {
    expect(N3_GRAMMAR_DRAFTS.every(d =>
      d.reviewStatus === 'draft' && !d.humanReviewed && !d.approved)).toBe(true);
  });
});

describe('rights: N3 runtime例文が原本と近接していない', () => {
  // 原本Excelは teacher_created_assumed（未確認）。runtime例文は独自作成でなければならない。
  const bySrc = new Map(audit.entries.map((e: { sourceRowId: string; exJa: string }) =>
    [e.sourceRowId, e.exJa ?? '']));
  const ratio = (a: string, b: string) => {
    const A = a.replace(/\s/g, ''), B = (b ?? '').replace(/\s/g, '');
    if (!B) return 0;
    const set = new Set(B.split(''));
    let hit = 0; for (const c of A) if (set.has(c)) hit++;
    return hit / Math.max(A.length, B.length);
  };
  it('全例文が原本との類似度0.85未満', () => {
    for (const d of N3_GRAMMAR_DRAFTS) {
      const orig = (bySrc.get(d.sourceRowId) ?? '') as string;
      for (const ex of d.examplesJa) {
        expect(ratio(ex, orig), `${d.grammarId}: 原本に近すぎる例文`).toBeLessThan(0.85);
      }
    }
  });
});
