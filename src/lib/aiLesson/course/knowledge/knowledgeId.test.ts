/*
 * 知識項目のID（2026-09-10 Phase 1）。
 *
 * ここで守りたいのは1つだけ:
 *   **実在するIDが全部読めること。読めない形を勝手に解釈しないこと。**
 *
 * 作り物のIDではなく、**本番で使われている教材データそのもの**を通す。
 * 学習履歴（AdvMasteryLedger）は既存IDをそのままキーにしているので、
 * ここで読めないIDが1つでもあると、その項目は知識グラフから落ちる。
 */
import { describe, it, expect } from 'vitest';
import {
  parseKnowledgeId, isKnowledgeId, knowledgeKindOf, knowledgeLevelOf,
  isHigherLevel, LEVEL_ORDER,
} from './knowledgeId';
import { N1_GRAMMAR_DRAFTS_UNIT1 } from '../n1GrammarDraftsUnit1';
import { N2_GRAMMAR_DRAFTS } from '../n2GrammarDrafts';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N3_ITEMS } from '../foundationVocabN3';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';
import { WORLD_AREAS } from '../rpg/worldAtlas';

describe('形ごとの読み取り', () => {
  it('文法は番号式も綴り式も読める（歴史的に混在している）', () => {
    expect(parseKnowledgeId('n2g-001')).toEqual({ raw: 'n2g-001', kind: 'grammar', level: 'N2' });
    expect(parseKnowledgeId('n3g-kke')).toEqual({ raw: 'n3g-kke', kind: 'grammar', level: 'N3' });
    expect(parseKnowledgeId('n5g-desu')).toEqual({ raw: 'n5g-desu', kind: 'grammar', level: 'N5' });
    expect(parseKnowledgeId('n1g-150')).toEqual({ raw: 'n1g-150', kind: 'grammar', level: 'N1' });
  });

  it('**単元は文法より先に判定する**（n5g-unit-1 は文法の形にも当てはまる）', () => {
    expect(knowledgeKindOf('n5g-unit-1')).toBe('unit');
    expect(knowledgeKindOf('n3g-unit-7')).toBe('unit');
    expect(knowledgeKindOf('n3u-01-self')).toBe('unit');
    // 単元と項目を取り違えると、束の攻略記録と項目の記録が混ざる
    expect(knowledgeKindOf('n5g-desu')).toBe('grammar');
  });

  it('語彙は級を返さない（IDにはバッチ番号しか入っていない）', () => {
    expect(parseKnowledgeId('vc-01-001')).toEqual({ raw: 'vc-01-001', kind: 'vocab', level: null });
    expect(parseKnowledgeId('fi-komaru')).toEqual({ raw: 'fi-komaru', kind: 'foundation', level: null });
  });

  it('地域も読める', () => {
    expect(knowledgeKindOf('area01-minato')).toBe('area');
  });

  it('**知らない形は解釈しない**（間違った級で教材が出るほうが、出ないより悪い）', () => {
    for (const bad of ['', '  ', 'n6g-abc', 'n2g', 'vc-1-1', 'grammar_n3_temoraou', 'あ', 'N2']) {
      expect(parseKnowledgeId(bad), bad).toBe(null);
      expect(isKnowledgeId(bad), bad).toBe(false);
    }
  });

  it('前後の空白は落とす（貼り付けで混ざる）', () => {
    expect(knowledgeKindOf('  n2g-001  ')).toBe('grammar');
  });
});

describe('**本番の教材データが全部読める**', () => {
  const allGrammar = [
    ...(N1_GRAMMAR_DRAFTS_UNIT1 as { grammarId: string }[]),
    ...(N2_GRAMMAR_DRAFTS as { grammarId: string }[]),
    ...(N3_GRAMMAR_DRAFTS as { grammarId: string }[]),
  ];

  it(`文法 ${''}項目が1つ残らず読める`, () => {
    expect(allGrammar.length).toBeGreaterThan(200);
    const unread = allGrammar.filter((g) => knowledgeKindOf(g.grammarId) !== 'grammar');
    expect(unread.map((g) => g.grammarId), '読めない文法ID').toEqual([]);
  });

  it('文法IDから読める級が、データの級と一致する', () => {
    const withLevel = [
      ...(N2_GRAMMAR_DRAFTS as { grammarId: string; level?: string }[]),
      ...(N3_GRAMMAR_DRAFTS as { grammarId: string; level?: string }[]),
    ].filter((g) => g.level);
    expect(withLevel.length).toBeGreaterThan(200);
    for (const g of withLevel) {
      expect(knowledgeLevelOf(g.grammarId), g.grammarId).toBe(g.level);
    }
  });

  it('基礎語彙（fi-）が全部読める', () => {
    const items = N3_ITEMS as { id: string }[];
    expect(items.length).toBeGreaterThan(50);
    const unread = items.filter((i) => knowledgeKindOf(i.id) !== 'foundation');
    expect(unread.map((i) => i.id), '読めない基礎語彙ID').toEqual([]);
  });

  it('N3単元が全部読める', () => {
    const units = N3_UNIT_SPECS as { unitId: string }[];
    expect(units.length).toBe(12);
    for (const u of units) expect(knowledgeKindOf(u.unitId), u.unitId).toBe('unit');
  });

  it('冒険の地域が全部読める', () => {
    const areas = WORLD_AREAS as { areaId: string }[];
    expect(areas.length).toBeGreaterThan(5);
    for (const a of areas) expect(knowledgeKindOf(a.areaId), a.areaId).toBe('area');
  });
});

describe('級の並び', () => {
  it('N5がいちばん下、N1がいちばん上', () => {
    expect(LEVEL_ORDER).toEqual(['N5', 'N4', 'N3', 'N2', 'N1']);
    expect(isHigherLevel('N1', 'N2')).toBe(true);
    expect(isHigherLevel('N5', 'N4')).toBe(false);
    expect(isHigherLevel('N3', 'N3')).toBe(false);
  });
});
