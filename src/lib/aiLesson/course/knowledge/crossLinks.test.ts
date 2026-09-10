/*
 * 教材間の接続（2026-09-10 Phase 4）。
 *
 * 守りたいこと:
 *   ・文法だけを孤立させない（語彙・教材のどちらにも繋がらない文法を減らす）
 *   ・辺には根拠が残る（explicit / derived と via）
 *   ・当てずっぽうで繋がない（かなだけの短い語・2文字以下の芯では本文照合しない）
 *   ・「仕事で依頼する」から 語彙→文法→例文→読解→聴解→産出 が実際に組める
 *   ・学習者の級より上の教材を経路に入れない
 */
import { describe, it, expect } from 'vitest';
import {
  buildCrossLinks, learningPath, linksOfGrammar, crossLinkCoverage, unknownIds, linkableSurface, grammarStems, stemAppears,
} from './crossLinks';
import { loadCrossLinks } from './crossLinksLoad';
import { PRACTICAL_DOMAINS } from './practicalAxis';

describe('照合の道具（誤爆しない）', () => {
  it('かなだけの短い語・1文字の語は本文照合に使わない', () => {
    expect(linkableSurface('は')).toBe(false);
    expect(linkableSurface('それ')).toBe(false);
    expect(linkableSurface('意味')).toBe(true);
  });
  it('文法の芯は3文字以上だけ（「〜は」「〜に」では繋がない）', () => {
    expect(grammarStems('〜は（主題）')).toEqual([]);
    expect(grammarStems('〜を余儀なくされる')).toEqual(['を余儀なくされる']);
    expect(stemAppears('延期を余儀なくされそうです', 'を余儀なくされる')).toBe('を余儀なくされ');
    expect(stemAppears('何もない文', 'を余儀なくされる')).toBeNull();
  });
});

describe('合成データで辺の作り方を固定', () => {
  const idx = buildCrossLinks({
    grammar: [
      { grammarId: 'n3g-a', pattern: '〜ていただけませんか', level: 'N3', examplesJa: ['資料を確認していただけませんか。'], vocabularyLinks: ['fi-shiryou'], practice: { themeJa: '会社で頼む', targetUse: '依頼' } },
      { grammarId: 'n1g-001', pattern: '〜をおいて（他にない）', level: 'N1', examplesJa: ['この仕事は彼をおいて他にいない。'] },
      { grammarId: 'n5g-wa', pattern: '〜は（主題）', level: 'N5', examplesJa: ['私は学生です。'] },
    ],
    vocab: [
      { wordId: 'vc-01-001', surface: '資料', level: 'N4', explanationJa: '「資料」は会社で使う書類です。' },
      { wordId: 'vc-01-002', surface: '確認', level: 'N3', explanationJa: '「確認」は会社で内容を確かめることです。' },
      { wordId: 'vc-41-001', surface: '示唆', level: 'N1' },
    ],
    foundation: [{ id: 'fi-shiryou', displayForm: '資料' }],
    materials: [
      { setId: 'n3r-01', kind: 'reading', level: 'N3', text: '会議の資料を確認していただけませんか、と部長に頼んだ。' },
      { setId: 'n1l-01', kind: 'listening', level: 'N1', text: '示唆に富む話だった。', knowledge: { comprehensionTarget: 'x', distractorDesign: 'y', grammarLinks: ['n1g-001'], vocabularyLinks: ['vc-41-001'], domain: 'work' } },
      { setId: 'n5r-01', kind: 'reading', level: 'N5', text: '私は学生です。資料を読みます。' },
    ],
  });

  it('明示リンクは explicit、本文由来は derived で根拠が残る', () => {
    const e = idx.edges.filter((x) => x.from === 'n3g-a');
    expect(e).toContainEqual({ from: 'n3g-a', to: 'fi-shiryou', layer: 'grammar-vocab', evidence: 'explicit', via: 'vocabularyLinks' });
    expect(e.find((x) => x.to === 'vc-01-001')).toMatchObject({ evidence: 'derived', via: 'example:資料' });
    expect(e.find((x) => x.to === 'n3r-01')).toMatchObject({ layer: 'grammar-material', evidence: 'derived' });
    expect(e.find((x) => x.layer === 'grammar-production')).toBeTruthy();
  });

  it('**級を超えて繋がない**（N5 の本文に N1 の文法・N1 語を当てない）', () => {
    expect(idx.edges.filter((x) => x.to === 'n5r-01').map((x) => x.from)).toEqual(['vc-01-001']);
  });

  it('教材の knowledge は explicit で、分野にも繋がる', () => {
    expect(idx.edges.filter((x) => x.to === 'n1l-01').map((x) => [x.from, x.evidence])).toEqual([['n1g-001', 'explicit'], ['vc-41-001', 'explicit']]);
    expect(idx.edges.find((x) => x.from === 'n1l-01' && x.layer === 'material-domain')).toMatchObject({ to: 'domain:work', evidence: 'explicit' });
  });

  it('経路: work → 語彙 → 文法 → 例文 → 読解 → 産出', () => {
    const p = learningPath(idx, { domain: 'work', level: 'N3' });
    expect(p.vocab).toEqual(expect.arrayContaining(['vc-01-001', 'vc-01-002']));
    expect(p.grammar).toEqual(['n3g-a']);
    expect(p.examples[0]).toMatchObject({ grammarId: 'n3g-a', viaWord: '資料' });
    expect(p.reading).toEqual(['n3r-01', 'n5r-01']);
    expect(p.production).toEqual([{ grammarId: 'n3g-a', themeJa: '会社で頼む', targetUse: '依頼' }]);
  });

  it('学習者の級より上の教材は経路に入らない（N1 の work 教材は N3 の学習者には出ない）', () => {
    const p = learningPath(idx, { domain: 'work', level: 'N3' });
    expect(p.listening).toEqual([]);
    expect(p.grammar).not.toContain('n1g-001');
  });

  it('その級で使える語が無ければ空のまま返す（無いものを在るように見せない）', () => {
    const p = learningPath(idx, { domain: 'work', level: 'N5' });
    expect(p.vocab).toEqual([]);
    expect(p.grammar).toEqual([]);
    expect(p.reading).toEqual([]);
  });

  it('1つの文法から辿れるものが出る', () => {
    const l = linksOfGrammar(idx, 'n3g-a');
    expect(l.vocab).toContain('vc-01-001');
    expect(l.reading).toEqual(['n3r-01']);
    expect(l.domains).toContain('work');
    expect(l.hasProduction).toBe(true);
  });
});

describe('**本番教材の全体に当てたQA**', () => {
  it('文法が孤立しない・辺に根拠がある・分野から全層へ届く', async () => {
    const idx = await loadCrossLinks();
    const c = crossLinkCoverage(idx, PRACTICAL_DOMAINS, 'N1');
    // 人が見るための実測（数値の意味は docs/ai-course/knowledge/PHASE4_CROSS_LINKS.md）
    console.info('[crossLinks]', JSON.stringify({ ...c, isolatedGrammar: c.isolatedGrammar.length, isolatedSample: c.isolatedGrammar.slice(0, 12) }));

    expect(unknownIds(idx)).toEqual([]);
    expect(c.grammar).toBeGreaterThan(500);
    // 語彙にも教材にも繋がらない文法は 5% 未満
    expect(c.isolatedGrammar.length / c.grammar).toBeLessThan(0.05);
    // 教材（読解・聴解）の 95% 以上が文法か語彙のどちらかへ繋がる
    expect(c.materialsWithAnyLink / c.materials).toBeGreaterThan(0.95);
    // 明示の辺が存在し（N1 の knowledge）、導出の辺はそれより多い
    expect(c.edges.explicit).toBeGreaterThan(100);
    expect(c.edges.derived).toBeGreaterThan(c.edges.explicit);
    // 10分野すべてで 語彙→文法→読解→聴解→産出 が組める
    expect(c.domainsComplete.length, `届かない分野: ${PRACTICAL_DOMAINS.filter((d) => !c.domainsComplete.includes(d)).join(',')}`).toBe(PRACTICAL_DOMAINS.length);
  }, 120000);

  it('「仕事で依頼する」の経路が N2 の学習者に実際に組める', async () => {
    const idx = await loadCrossLinks();
    const p = learningPath(idx, { domain: 'work', situation: 'requesting', level: 'N2' });
    expect(p.vocab.length).toBeGreaterThan(0);
    expect(p.grammar.length).toBeGreaterThan(0);
    expect(p.examples.length).toBeGreaterThan(0);
    expect(p.reading.length).toBeGreaterThan(0);
    expect(p.listening.length).toBeGreaterThan(0);
    expect(p.production.length).toBeGreaterThan(0);
    // N1 の教材が混ざらない
    for (const id of [...p.reading, ...p.listening]) expect(idx.materials.get(id)?.level).not.toBe('N1');
    for (const g of p.grammar) expect(idx.grammar.get(g)?.level).not.toBe('N1');
  }, 120000);
});
