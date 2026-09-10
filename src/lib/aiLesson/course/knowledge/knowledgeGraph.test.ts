/*
 * 知識のつながり（2026-09-10 Phase 1）。
 *
 * 守りたいこと:
 *   ・**元データを1文字も変えずに**、表示文字列をIDへ解決できる
 *   ・当てずっぽうで繋がない（解決できないものは解決できないと返す）
 *   ・いまの被覆率を数字で固定し、**下がったら気づける**ようにする
 */
import { describe, it, expect } from 'vitest';
import {
  patternKey, buildPatternIndex, resolvePattern, buildGrammarGraph, graphCoverage,
  type GrammarLike,
} from './knowledgeGraph';
import { N2_GRAMMAR_DRAFTS } from '../n2GrammarDrafts';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';

const real: GrammarLike[] = [
  ...(N2_GRAMMAR_DRAFTS as unknown as GrammarLike[]),
  ...(N3_GRAMMAR_DRAFTS as unknown as GrammarLike[]),
];

describe('patternKey', () => {
  it('波ダッシュ・空白・別表記のゆれを吸収する', () => {
    expect(patternKey('〜あげく')).toBe('あげく');
    expect(patternKey('～あげく')).toBe('あげく');
    expect(patternKey('〜一方/一方で')).toBe('一方');
    expect(patternKey('〜 うちに ')).toBe('うちに');
  });

  it('空文字でも落ちない', () => {
    expect(patternKey('')).toBe('');
    expect(patternKey(undefined as unknown as string)).toBe('');
  });
});

describe('resolvePattern', () => {
  const items: GrammarLike[] = [
    { grammarId: 'n2g-001', pattern: '〜あげく', level: 'N2' },
    { grammarId: 'n3g-toki', pattern: '〜とき', level: 'N3' },
    { grammarId: 'n2g-youda', pattern: '〜ようだ', level: 'N2' },
    { grammarId: 'n3g-youda', pattern: '〜ようだ', level: 'N3' },
  ];
  const index = buildPatternIndex(items);

  it('表示文字列からIDを引ける', () => {
    expect(resolvePattern(index, '〜あげく')).toBe('n2g-001');
    expect(resolvePattern(index, 'あげく')).toBe('n2g-001');
  });

  it('**当たらなければ null**（近い項目へ当てずっぽうで繋がない）', () => {
    expect(resolvePattern(index, '〜結果')).toBe(null);
    expect(resolvePattern(index, '')).toBe(null);
  });

  it('同じ表現が級をまたぐときは、呼び元と同じ級を選ぶ', () => {
    expect(resolvePattern(index, '〜ようだ', 'N3')).toBe('n3g-youda');
    expect(resolvePattern(index, '〜ようだ', 'N2')).toBe('n2g-youda');
  });
});

describe('buildGrammarGraph', () => {
  it('似た表現とlinkを辺にする', () => {
    const items: GrammarLike[] = [
      { grammarId: 'n2g-001', pattern: '〜あげく', similarPatterns: ['〜末に'], vocabularyLinks: ['fi-komaru'] },
      { grammarId: 'n2g-sueni', pattern: '〜末に' },
    ];
    const { edges, unresolved } = buildGrammarGraph(items);
    expect(edges).toContainEqual({ from: 'n2g-001', to: 'n2g-sueni', kind: 'related', via: '〜末に' });
    expect(edges).toContainEqual({ from: 'n2g-001', to: 'fi-komaru', kind: 'vocab' });
    expect(unresolved).toEqual([]);
  });

  it('解決できない表現は unresolved に残す（＝教材の穴の一覧になる）', () => {
    const items: GrammarLike[] = [
      { grammarId: 'n2g-001', pattern: '〜あげく', similarPatterns: ['〜結果'] },
    ];
    const { edges, unresolved } = buildGrammarGraph(items);
    expect(edges).toEqual([]);
    expect(unresolved).toEqual([{ from: 'n2g-001', display: '〜結果' }]);
  });

  it('自分自身へは繋がない', () => {
    const items: GrammarLike[] = [
      { grammarId: 'n2g-001', pattern: '〜あげく', similarPatterns: ['〜あげく'] },
    ];
    expect(buildGrammarGraph(items).edges).toEqual([]);
  });

  it('**読めないIDの語彙リンクは辺にしない**（壊れた辺を作らない）', () => {
    const items: GrammarLike[] = [
      { grammarId: 'n2g-001', pattern: '〜あげく', vocabularyLinks: ['fi-komaru', 'こわれたID', ''] },
    ];
    const edges = buildGrammarGraph(items).edges.filter((e) => e.kind === 'vocab');
    expect(edges.map((e) => e.to)).toEqual(['fi-komaru']);
  });
});

describe('**本番の教材でどれだけ繋がっているか**', () => {
  /*
   * 2026-09-10 の実測を下限として固定する。
   * 下がったら「辺が減った」＝関連・対比・推薦が痩せたということなので気づける。
   * 上がるぶんには構わない（Phase 2 で教材を足せば上がる）。
   */
  const built = buildGrammarGraph(real);
  const cov = graphCoverage(real, built);

  it('N2＋N3の254項目が対象', () => {
    expect(cov.items).toBeGreaterThanOrEqual(254);
  });

  it('関連の辺が200本以上ある', () => {
    expect(cov.relatedEdges).toBeGreaterThanOrEqual(200);
  });

  it('表示文字列の解決率が45%以上', () => {
    expect(cov.relatedResolveRate).toBeGreaterThanOrEqual(0.45);
  });

  it('語彙への辺が400本以上ある', () => {
    expect(cov.vocabEdges).toBeGreaterThanOrEqual(400);
  });

  it('**解決できない表現が残っているのは正常**（教材にまだ無い表現の一覧）', () => {
    expect(built.unresolved.length).toBeGreaterThan(0);
    // 中身が「表示文字列」であって、IDが混ざっていないこと
    for (const u of built.unresolved.slice(0, 50)) {
      expect(u.display.length, u.display).toBeGreaterThan(0);
    }
  });
});
