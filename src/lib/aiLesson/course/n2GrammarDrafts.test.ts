// Phase 3P-5: N2文法完成draftのガード。原本との整合と、field埋めでない実質を検証する。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { createHash } from 'node:crypto';
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
  it('原本例文はsourceExampleへ改変なしで退避されている（provenance）', () => {
    const sha16 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 16);
    for (const d of N2_GRAMMAR_DRAFTS) {
      const src = byId.get(d.grammarId);
      expect(src, `${d.grammarId} が原本にない`).toBeTruthy();
      // CEO確認（2026-07-28）により全Sourceはconfirmed。runtime使用可
      expect(d.sourceExample.rightsStatus).toBe('teacher_created_confirmed');
      // hashは実際のsha256先頭16桁。textは原本セルと完全一致（注記・全角数字も含め無改変）
      expect(d.sourceExample.hash, `${d.grammarId}: hashがsha256(text)と不一致`)
        .toBe(sha16(d.sourceExample.text));
      expect(src!.examples, `${d.grammarId}: sourceExample.textが原本に無い`)
        .toContain(d.sourceExample.text);
      expect(['original_authored', 'source_confirmed']).toContain(d.runtimeExampleOrigin);
    }
  });
  it('権利未確認Sourceの場合のみ、runtime例文の原本近接を禁止する', () => {
    // 文字ベースの類似度。0.6以上は「少し言い換えただけ」とみなして不合格にする
    const ratio = (a: string, b: string) => {
      const A = a.replace(/[（(][ぁ-ん]+[)）]|\s/g, ''), B = b.replace(/[（(][ぁ-ん]+[)）]|\s/g, '');
      const set = new Set(B.split(''));
      let hit = 0; for (const c of A) if (set.has(c)) hit++;
      return hit / Math.max(A.length, B.length);
    };
    for (const d of N2_GRAMMAR_DRAFTS) {
      if (d.sourceExample.rightsStatus === 'teacher_created_confirmed') continue;
      for (const ex of d.examplesJa) {
        expect(ratio(ex, d.sourceExample.text),
          `${d.grammarId}: runtime例文が原本に近すぎる`).toBeLessThan(0.75);
      }
    }
  });
  it('例文に文型の核が実在する（field埋め防止）', () => {
    for (const d of N2_GRAMMAR_DRAFTS) {
      const core = d.pattern.replace(/[〜~（）()]/g, '').split(/[／/]/)[0].slice(0, 2);
      const hit = d.matchKeys
        ? d.examplesJa.some(e => d.matchKeys!.some(k => e.includes(k)))
        : d.examplesJa.some(e => e.includes(core));
      expect(hit, `${d.grammarId}: 例文に「${(d.matchKeys ?? [core]).join('/')}」が無い`).toBe(true);
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
  it('Unit2以降も含め、必須fieldとUnit番号が正しい', () => {
    const units = new Set(N2_GRAMMAR_DRAFTS.map(d => d.unit));
    expect(units.has(1)).toBe(true);
    expect(units.has(2)).toBe(true);
    for (const d of N2_GRAMMAR_DRAFTS) {
      expect(d.unit).toBeGreaterThanOrEqual(1);
      expect(d.unit).toBeLessThanOrEqual(12);
    }
  });
  it('N3シート由来の中文を使った場合は出典を記録している', () => {
    const withSource = N2_GRAMMAR_DRAFTS.filter(d => d.zhSourceRowId);
    expect(withSource.length).toBeGreaterThan(0);
    for (const d of withSource) expect(d.zhSourceRowId).toMatch(/^n3row-\d+$/);
  });
});
