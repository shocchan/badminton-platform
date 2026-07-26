import { describe, it, expect } from 'vitest';
import { FOUNDATION_UNIT_META, loadFoundationUnit, isKnownFoundationUnit } from './foundationRegistry';
import type { FoundationUnitBundle } from './foundationRegistry';
import { mechanicOf } from './foundationTypes';

let bundles: Record<string, FoundationUnitBundle> = {};
const loadAll = async () => {
  if (Object.keys(bundles).length) return bundles;
  for (const m of FOUNDATION_UNIT_META) bundles[m.id] = await loadFoundationUnit(m.id);
  return bundles;
};

describe('しくみラボ 全6単元の横断整合（Phase 2B §27）', () => {
  it('6単元が登録され、未知IDは安全に拒否される', async () => {
    expect(FOUNDATION_UNIT_META.length).toBe(6);
    expect(isKnownFoundationUnit('fu-bogus')).toBe(false);
    await expect(loadFoundationUnit('fu-bogus')).rejects.toThrow('unknown foundation unit');
  });

  it('メタと実データが一致し、全教材がdraft（自動approved禁止）', async () => {
    const bs = await loadAll();
    for (const m of FOUNDATION_UNIT_META) {
      const b = bs[m.id];
      expect(b.unit.id).toBe(m.id);
      expect(b.unit.titleJa).toBe(m.titleJa);
      expect(b.unit.estimatedMinutes).toBe(m.estimatedMinutes);
      expect(b.unit.prerequisiteUnitIds).toEqual(m.prerequisiteUnitIds);
      [b.unit, ...b.items, ...b.rules, ...b.questions].forEach((x) => expect(x.review).toBe('draft'));
    }
  });

  it('ID重複なし: unit/rule/questionはグローバル一意・itemは同一参照でのみ再登場', async () => {
    const bs = await loadAll();
    const unitIds = FOUNDATION_UNIT_META.map((m) => m.id);
    expect(new Set(unitIds).size).toBe(unitIds.length);
    const ruleIds = Object.values(bs).flatMap((b) => b.rules.map((r) => r.id));
    expect(new Set(ruleIds).size).toBe(ruleIds.length);
    const qIds = Object.values(bs).flatMap((b) => b.questions.map((q) => q.id));
    expect(new Set(qIds).size).toBe(qIds.length);
    // 同じitem idが複数単元に登場する場合は同一オブジェクト（重複登録禁止・§6）
    const seen = new Map<string, object>();
    for (const b of Object.values(bs)) for (const it of b.items) {
      const prev = seen.get(it.id);
      if (prev) expect(it).toBe(prev);
      else seen.set(it.id, it);
    }
  });

  it('語彙再利用: 行く=unit2/3/5・住む=unit1/5・日本語=unit1/4 が同一Item参照', async () => {
    const bs = await loadAll();
    const find = (uid: string, iid: string) => bs[uid].items.find((i) => i.id === iid);
    expect(find('fu-verbs-masu-nai', 'fi-iku')).toBe(find('fu-te-form', 'fi-iku'));
    expect(find('fu-verbs-masu-nai', 'fi-iku')).toBe(find('fu-particles-ni-de-e', 'fi-iku'));
    expect(find('fu-selfintro-1', 'fi-sumu')).toBe(find('fu-particles-ni-de-e', 'fi-sumu'));
    expect(find('fu-selfintro-1', 'fi-nihongo')).toBe(find('fu-particles-wa-ga-wo', 'fi-nihongo'));
  });

  it('単元参照整合: itemIds/ruleIds/questionIdsが実データと一致・target実在・dimension整合', async () => {
    const bs = await loadAll();
    for (const b of Object.values(bs)) {
      expect(b.unit.itemIds).toEqual(b.items.map((i) => i.id));
      expect(b.unit.ruleIds).toEqual(b.rules.map((r) => r.id));
      expect(b.unit.questionIds).toEqual(b.questions.map((q) => q.id));
      for (const q of b.questions) {
        const target = q.targetItemId ?? q.targetRuleId;
        expect(target).toBeTruthy();
        const exists = b.items.some((i) => i.id === q.targetItemId) || b.rules.some((r) => r.id === q.targetRuleId);
        expect(exists).toBe(true);
      }
    }
  });

  it('全問題が正解・ja/zh解説・errorTagを持ち、choiceは2〜4択・input系はaccepted明示', async () => {
    const bs = await loadAll();
    for (const b of Object.values(bs)) for (const q of b.questions) {
      expect(q.explanationJa.length).toBeGreaterThan(0);
      expect(q.explanationZh.length).toBeGreaterThan(0);
      expect(q.promptJa && q.promptZh).toBeTruthy();
      expect(q.errorTag.length).toBeGreaterThan(0);
      const mech = mechanicOf(q.type);
      if (mech === 'choice') {
        expect(q.choices!.length).toBeGreaterThanOrEqual(2);
        expect(q.choices!.length).toBeLessThanOrEqual(4);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(q.choices!.length);
      }
      if (mech === 'input') expect(q.accepted!.length).toBeGreaterThan(0);
      if (mech === 'order') expect(q.orderTokens!.length).toBeGreaterThanOrEqual(3);
      if (mech === 'matching') expect(q.pairs!.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('軸別最低問題数（助詞単元はparticleがform/connection相当・docs記載）', async () => {
    const bs = await loadAll();
    for (const b of Object.values(bs)) {
      const d = (k: string) => b.questions.filter((q) => q.dimension === k).length;
      expect(d('reading')).toBeGreaterThanOrEqual(2);
      expect(d('meaning')).toBeGreaterThanOrEqual(2);
      expect(d('form') + d('connection') + d('particle')).toBeGreaterThanOrEqual(3);
      expect(d('usage')).toBeGreaterThanOrEqual(2);
      expect(b.questions.length).toBeGreaterThanOrEqual(10);
      expect(b.questions.length).toBeLessThanOrEqual(15);
    }
  });

  it('出典整合: 全sourceRefにsourceMatchType/sourceLabel・external_scopeはセル参照なし・IDはExcel行に非依存', async () => {
    const bs = await loadAll();
    for (const b of Object.values(bs)) for (const it of b.items) {
      expect(it.sources.length).toBeGreaterThan(0);
      for (const s of it.sources) {
        expect(['exact_lexeme', 'inflected_form', 'example_contains', 'related_expression', 'external_scope']).toContain(s.sourceMatchType);
        expect(s.sourceLabel.length).toBeGreaterThan(0);
        if (s.sourceMatchType === 'external_scope') { expect(s.sourceSheet).toBeNull(); expect(s.cellRange ?? null).toBeNull(); }
      }
      // IDは安定スラッグ（行番号を含まない）
      expect(it.id).toMatch(/^fi-[a-z0-9-]+$/);
      expect(it.id).not.toMatch(/\d{2,}/);
    }
  });

  it('前提関係: unit1→unit2→unit3・unit4/5/6はunit1後・循環なし', () => {
    const byId = Object.fromEntries(FOUNDATION_UNIT_META.map((m) => [m.id, m]));
    expect(byId['fu-verbs-masu-nai'].prerequisiteUnitIds).toEqual(['fu-selfintro-1']);
    expect(byId['fu-te-form'].prerequisiteUnitIds).toEqual(['fu-verbs-masu-nai']);
    ['fu-particles-wa-ga-wo', 'fu-particles-ni-de-e', 'fu-numbers-shopping'].forEach((id) =>
      expect(byId[id].prerequisiteUnitIds).toEqual(['fu-selfintro-1']));
    for (const m of FOUNDATION_UNIT_META) {
      m.prerequisiteUnitIds.forEach((p) => { expect(byId[p]).toBeTruthy(); expect(p).not.toBe(m.id); });
      expect(m.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it('助詞問題の網羅: は/が/を/に/で/(へ言及)/時間のに/手段ので/場所ので/移動先', async () => {
    const bs = await loadAll();
    const tags = Object.values(bs).flatMap((b) => b.questions.map((q) => q.errorTag)).join(',');
    ['particle_wa_topic', 'particle_ga_exist', 'particle_wo_object2', 'particle_ni_destination', 'particle_de_workplace', 'particle_ni_time', 'particle_de_means', 'particle_sumu_ni'].forEach((tag) => expect(tags).toContain(tag));
    const u5rules = bs['fu-particles-ni-de-e'].rules.map((r) => r.explanationJa).join('');
    expect(u5rules).toContain('へ');
  });

  it('数字・時刻・値段・特殊読みのMVP範囲（分の特殊読みは対象外と明記）', async () => {
    const bs = await loadAll();
    const u6 = bs['fu-numbers-shopping'];
    const all = u6.rules.map((r) => r.explanationJa).join('');
    ['よじ', 'しちじ', 'くじ', 'ひとり', 'ふたり', '円', 'いくら'].forEach((k) => expect(all).toContain(k));
    expect(all).toContain('「分」の特殊読みは次の段階');
    expect(u6.questions.some((q) => q.type === 'matching')).toBe(true);
  });
});
