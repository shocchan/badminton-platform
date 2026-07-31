// variant生成の全件機械検査（§18/§30: 漏洩0・重複0・複数正解対策・決定性）。
// 実データ（N2 178 canonical＋N3 76）に対して回す＝「存在するふり」をテストで排除。
import { describe, it, expect } from 'vitest';
import { buildVariantPool, buildExclusionSet, validateQuestion, matchKeysOf, type GrammarDraftLike } from './advVariants';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N2_GRAMMAR_ALIASES } from '../n2GrammarAliases';
import { N2_UNIT_FILE_NUMBERS, loadN2DraftUnitFile } from '../n2GrammarDraftChunks';

const loadAllN2 = async (): Promise<GrammarDraftLike[]> => {
  const all: GrammarDraftLike[] = [];
  for (const no of N2_UNIT_FILE_NUMBERS) all.push(...(await loadN2DraftUnitFile(no)) as unknown as GrammarDraftLike[]);
  return all;
};

describe('advVariants 実データ全件検査', () => {
  it('N2: canonical 178全項目にプールが生成され、全問が機械検査PASS・キー重複0', async () => {
    const drafts = await loadAllN2();
    const pool = buildVariantPool(drafts, 'n2', new Set(Object.keys(N2_GRAMMAR_ALIASES)));
    expect(pool.stats.items).toBe(178);
    expect(pool.stats.byType.rec).toBe(178);
    const keys = new Set<string>();
    for (const qs of pool.byItem.values()) {
      expect(qs.length).toBeGreaterThanOrEqual(1);
      for (const q of qs) {
        expect(validateQuestion(q)).toEqual([]);
        expect(keys.has(q.key)).toBe(false);
        keys.add(q.key);
      }
    }
    // §18: 複数variant（タイプ2種以上）を持つ項目が大多数であること（暗記対策の実効性）
    expect(pool.stats.multiVariantItems).toBeGreaterThanOrEqual(150);
    expect(pool.stats.questions).toBeGreaterThanOrEqual(400);
  });

  it('N3: 76全項目にプールが生成され、全問PASS', () => {
    const pool = buildVariantPool(N3_GRAMMAR_DRAFTS as unknown as GrammarDraftLike[], 'n3');
    expect(pool.stats.items).toBe(76);
    expect(pool.stats.byType.rec).toBe(76);
    for (const qs of pool.byItem.values()) for (const q of qs) expect(validateQuestion(q)).toEqual([]);
    expect(pool.stats.multiVariantItems).toBeGreaterThanOrEqual(60);
  });

  it('決定的: 2回ビルドで同一結果', async () => {
    const drafts = await loadAllN2();
    const a = buildVariantPool(drafts.slice(0, 30), 'n2');
    const b = buildVariantPool(drafts.slice(0, 30), 'n2');
    expect(JSON.stringify([...a.byItem.entries()])).toBe(JSON.stringify([...b.byItem.entries()]));
  });

  it('同義・同族はdistractorから除外される（複数正解の主対策・D-008）', async () => {
    const drafts = await loadAllN2();
    const byId = new Map(drafts.map((d) => [d.grammarId, d]));
    // 例: 「〜上では」(n2g-006) と「〜上は」(n2g-007) は同族（上を共有）
    const jouDewa = byId.get('n2g-006');
    if (jouDewa) {
      const ex = buildExclusionSet(jouDewa, drafts);
      expect(ex.has('n2g-007')).toBe(true);
    }
    // similarPatterns両方向: あげく ↔ 末に
    const ageku = byId.get('n2g-001');
    if (ageku) {
      const ex = buildExclusionSet(ageku, drafts);
      for (const d of drafts) {
        if (d.similarPatterns.some((p) => p.includes('あげく'))) expect(ex.has(d.grammarId)).toBe(true);
      }
    }
    // clozeのdistractorが除外集合と交差しないことを全件で確認
    const pool = buildVariantPool(drafts, 'n2', new Set(Object.keys(N2_GRAMMAR_ALIASES)));
    const keyToId = new Map<string, string>();
    for (const d of drafts) for (const k of matchKeysOf(d)) if (!keyToId.has(k)) keyToId.set(k, d.grammarId);
    for (const [id, qs] of pool.byItem) {
      const self = byId.get(id);
      if (!self) continue;
      const ex = buildExclusionSet(self, drafts.filter((d) => !(d.grammarId in N2_GRAMMAR_ALIASES)));
      for (const q of qs) {
        if (q.type !== 'cloze') continue;
        for (let i = 0; i < q.choices.length; i++) {
          if (i === q.answerIndex) continue;
          const owner = keyToId.get(q.choices[i]);
          if (owner) expect(ex.has(owner)).toBe(false);
        }
      }
    }
  });

  it('生成不能はrejected/欠落として可視化される（存在するふりをしない）', () => {
    const minimal: GrammarDraftLike = {
      grammarId: 'x-001', pattern: '〜てすと', meaningJa: '', explanationZh: '', formation: '',
      examplesJa: ['この文に文型は含まれない'], examplesZh: [''], similarPatterns: [],
      recognition: { promptZh: 'p', options: ['a', 'a', 'b', 'c'], answerIndex: 0, explanationZh: 'e' },
    };
    const pool = buildVariantPool([minimal], 'n3');
    // recognitionは重複選択肢で機械検査に落ち、cloze/meaning/formは材料不足で生成なし
    expect(pool.byItem.get('x-001') ?? []).toHaveLength(0);
    expect(pool.rejected.some((r) => r.key === 'rec:x-001' && r.issues.includes('duplicate_choice'))).toBe(true);
  });
});
