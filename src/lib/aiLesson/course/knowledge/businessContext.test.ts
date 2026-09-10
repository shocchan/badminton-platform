/*
 * Business Japanese ＝ Practical Axis の一層（2026-09-10 Phase 5）。
 *
 * 守りたいこと:
 *   ・JLPT 教材をコピーしない：この層は ID と文脈だけを持ち、教材本文を持たない
 *   ・指名した grammarId は全部実在する（dangling 0）。同じ文法を Business 用に複製していない
 *   ・敬語は N4 の既存項目（尊敬語・謙譲語・〜ております）をそのまま使う
 *   ・10文脈すべてで、N2・N1 の学習者に 文法・語彙・読解・聴解・産出 が出る
 *   ・学習者の級より上の文法・教材は出ない（N3 の人に N1 文法を出さない）
 */
import { describe, it, expect } from 'vitest';
import {
  BUSINESS_CONTEXTS, businessContextById, businessPack, businessCoverage, danglingBusinessGrammar, n2GrammarForContext,
} from './businessContext';
import { loadCrossLinks } from './crossLinksLoad';
import { parseKnowledgeId } from './knowledgeId';

describe('層の形', () => {
  it('10文脈。教材本文（pattern／例文）を持たない＝コピーではない', () => {
    expect(BUSINESS_CONTEXTS.map((c) => c.id)).toEqual([
      'keigo', 'internal', 'horenso', 'phone', 'meeting', 'email', 'negotiation', 'sales', 'interview', 'culture',
    ]);
    for (const c of BUSINESS_CONTEXTS) {
      expect(Object.keys(c)).not.toContain('pattern');
      expect(Object.keys(c)).not.toContain('examplesJa');
      expect(c.grammarIds.length).toBeGreaterThan(0);
      expect(c.scenes.length).toBe(3);
      for (const g of [...c.grammarIds, ...c.scenes.flatMap((s) => s.grammarIds)]) {
        expect(parseKnowledgeId(g)?.kind, `${c.id}: ${g}`).toBe('grammar');
      }
    }
  });

  it('敬語は N4 の既存項目を使う（新しい敬語教材を作らない）', () => {
    const keigo = businessContextById('keigo')!;
    expect(keigo.grammarIds).toEqual(expect.arrayContaining([
      'n4g-sonkeigo-oninaru', 'n4g-kenjougo-osuru', 'n4g-sonkeigo-tokubetsu', 'n4g-kenjougo-tokubetsu', 'n4g-teorimasu',
    ]));
  });

  it('N2 の既存分類（formal／work）から文法を足せる', () => {
    expect(n2GrammarForContext(businessContextById('meeting')!).length).toBeGreaterThan(10);
  });
});

describe('**本番教材に当てたQA**', () => {
  it('指名した grammarId は全部実在する（dangling 0）', async () => {
    const idx = await loadCrossLinks();
    expect(danglingBusinessGrammar(idx)).toEqual([]);
  }, 120000);

  it('10文脈 × N2/N1 で 文法・語彙・読解・聴解・産出・場面 がそろう', async () => {
    const idx = await loadCrossLinks();
    const rows = businessCoverage(idx, ['N3', 'N2', 'N1']);
    console.info('[business]', JSON.stringify(rows));
    for (const r of rows.filter((x) => x.level !== 'N3')) {
      expect(r.grammar, `${r.context}/${r.level} grammar`).toBeGreaterThanOrEqual(3);
      expect(r.vocab, `${r.context}/${r.level} vocab`).toBeGreaterThanOrEqual(5);
      expect(r.reading, `${r.context}/${r.level} reading`).toBeGreaterThan(0);
      expect(r.listening, `${r.context}/${r.level} listening`).toBeGreaterThan(0);
      expect(r.production, `${r.context}/${r.level} production`).toBeGreaterThan(0);
    }
    // N1 の学習者には全文脈の会話場面が全部開く。N3 の学習者にも各文脈で最低1場面・文法2つ以上
    for (const r of rows.filter((x) => x.level === 'N1')) expect(r.scenes, `${r.context}/N1 scenes`).toBe(3);
    for (const r of rows.filter((x) => x.level === 'N3')) {
      expect(r.scenes, `${r.context}/N3 scenes`).toBeGreaterThanOrEqual(1);
      expect(r.grammar, `${r.context}/N3 grammar`).toBeGreaterThanOrEqual(2);
      expect(r.production, `${r.context}/N3 production`).toBeGreaterThan(0);
    }
  }, 120000);

  it('学習者の級より上の文法・教材は出ない', async () => {
    const idx = await loadCrossLinks();
    for (const c of BUSINESS_CONTEXTS) {
      const p = businessPack(idx, c.id, 'N3');
      for (const g of p.grammar) expect(['N5', 'N4', 'N3'], `${c.id}: ${g.grammarId}`).toContain(g.level);
      for (const id of [...p.reading, ...p.listening]) expect(['N5', 'N4', 'N3'], `${c.id}: ${id}`).toContain(idx.materials.get(id)?.level);
      for (const s of p.scenes) for (const g of s.grammarIds) expect(['N5', 'N4', 'N3']).toContain(idx.grammar.get(g)?.level);
    }
  }, 120000);

  it('敬語の束（N2）に N4 の敬語項目と仕事の語が入る', async () => {
    const idx = await loadCrossLinks();
    const p = businessPack(idx, 'keigo', 'N2');
    expect(p.grammar.map((g) => g.grammarId)).toEqual(expect.arrayContaining(['n4g-sonkeigo-oninaru', 'n4g-kenjougo-osuru']));
    expect(p.vocab.length).toBeGreaterThan(0);
    for (const v of p.vocab) expect(v.via.length).toBeGreaterThan(0);
  }, 120000);
});
