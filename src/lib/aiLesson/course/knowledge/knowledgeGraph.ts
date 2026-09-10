/**
 * 知識のつながり（2026-09-10 Phase 1）。
 *
 * 【いま教材が持っている「辺」】
 * 文法1項目は、すでに関連情報を持っている:
 *   similarPatterns  … 似た表現。ただし**表示用の文字列**（「〜結果」「〜末に」）
 *   contrast         … 使い分けの説明文（中国語）
 *   vocabularyLinks  … 関連語彙。こちらは**すでにID**（fi-komaru）
 *
 * つまり「関連」は書かれているのに、**半分はIDになっていない**ので機械が辿れない。
 * この層は、既存データを1文字も書き換えずに、**表示文字列をIDへ解決する**。
 *
 * 【なぜデータ側を書き換えないか】
 * similarPatterns は画面にそのまま出ている文字列でもある。IDへ置き換えると
 * 表示が壊れる。**元データは表示のため、この層は機械のため**、と役割を分ける。
 * 解決できない辺は「解決できない」と正直に返す（当てずっぽうで繋がない）。
 *
 * 【解決できないものが残るのは正常】
 * 「〜結果」「〜前に」のように、表現としては存在するが**教材の項目にはまだ無い**ものがある。
 * これは欠陥ではなく、そのままカリキュラムの穴の一覧になる（Phase 2 の入力）。
 */

import { parseKnowledgeId, type KnowledgeLevel } from './knowledgeId';

/** 辺の種類。いまの教材が実際に持っているものだけを定義する（将来の空欄を作らない） */
export type EdgeKind =
  | 'related'   // 似た表現（similarPatterns 由来）
  | 'vocab';    // 関連語彙（vocabularyLinks 由来）

export interface KnowledgeEdge {
  from: string;
  to: string;
  kind: EdgeKind;
  /** 元になった表示文字列（related のみ）。何を根拠に繋いだかを残す */
  via?: string;
}

/** 辺を作るために最低限必要な、文法項目の形 */
export interface GrammarLike {
  grammarId: string;
  pattern?: string;
  level?: string;
  similarPatterns?: readonly string[];
  vocabularyLinks?: readonly string[];
  contrast?: string;
}

/**
 * 表現の照合キー。
 * 「〜あげく」「あげく」「〜一方/一方で」が同じものを指すので、
 * 波ダッシュ・空白を落とし、スラッシュ以降（別表記）は切る。
 */
export const patternKey = (s: string): string =>
  (s ?? '').replace(/[〜～\s]/g, '').replace(/[／/].*$/, '').trim();

export interface PatternIndex {
  /** 照合キー → 文法ID（複数当たることがある） */
  byKey: Map<string, string[]>;
}

export const buildPatternIndex = (items: readonly GrammarLike[]): PatternIndex => {
  const byKey = new Map<string, string[]>();
  for (const g of items) {
    const k = patternKey(g.pattern ?? '');
    if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), g.grammarId]);
  }
  return { byKey };
};

/**
 * 表示文字列を文法IDへ解決する。
 * - 当たらなければ null（**当てずっぽうで近い項目へ繋がない**）
 * - 複数当たったら、**級が近いほうを選ぶ**。それでも決まらなければ最初の1つ
 *   （同じ表現が級をまたいで載っていることがあるため。例: 〜ようだ）
 */
export const resolvePattern = (
  index: PatternIndex,
  display: string,
  fromLevel?: KnowledgeLevel | null,
): string | null => {
  const hits = index.byKey.get(patternKey(display));
  if (!hits || hits.length === 0) return null;
  if (hits.length === 1) return hits[0];
  if (!fromLevel) return hits[0];
  const rank = (id: string): number => {
    const lv = parseKnowledgeId(id)?.level;
    return lv === fromLevel ? 0 : 1;
  };
  return [...hits].sort((a, b) => rank(a) - rank(b))[0];
};

export interface GraphBuildResult {
  edges: KnowledgeEdge[];
  /** 解決できなかった表示文字列（＝教材にまだ無い表現）。Phase 2 の入力になる */
  unresolved: { from: string; display: string }[];
}

/**
 * 既存の文法データから辺を作る。**元データは読むだけ**。
 */
export const buildGrammarGraph = (items: readonly GrammarLike[]): GraphBuildResult => {
  const index = buildPatternIndex(items);
  const edges: KnowledgeEdge[] = [];
  const unresolved: { from: string; display: string }[] = [];

  for (const g of items) {
    const fromLevel = parseKnowledgeId(g.grammarId)?.level ?? null;

    for (const display of g.similarPatterns ?? []) {
      const to = resolvePattern(index, display, fromLevel);
      if (!to) { unresolved.push({ from: g.grammarId, display }); continue; }
      if (to === g.grammarId) continue;   // 自分自身へは繋がない
      edges.push({ from: g.grammarId, to, kind: 'related', via: display });
    }

    for (const to of g.vocabularyLinks ?? []) {
      // 語彙リンクは既にID。読めないものは繋がない（壊れた辺を作らない）
      if (!parseKnowledgeId(to)) continue;
      edges.push({ from: g.grammarId, to, kind: 'vocab' });
    }
  }

  return { edges, unresolved };
};

export interface GraphCoverage {
  items: number;
  relatedEdges: number;
  vocabEdges: number;
  /** 表示文字列のうち、IDへ解決できた割合（0〜1） */
  relatedResolveRate: number;
  /** 1本も辺を持たない項目（孤立している＝推薦にも比較にも出てこない） */
  isolated: string[];
}

/** いまどれだけ繋がっているかを測る。**改善したかどうかを数字で言えるようにする** */
export const graphCoverage = (
  items: readonly GrammarLike[], built: GraphBuildResult,
): GraphCoverage => {
  const withEdge = new Set<string>();
  for (const e of built.edges) { withEdge.add(e.from); if (e.kind === 'related') withEdge.add(e.to); }
  const related = built.edges.filter((e) => e.kind === 'related').length;
  const attempted = related + built.unresolved.length;
  return {
    items: items.length,
    relatedEdges: related,
    vocabEdges: built.edges.filter((e) => e.kind === 'vocab').length,
    relatedResolveRate: attempted === 0 ? 0 : related / attempted,
    isolated: items.map((g) => g.grammarId).filter((id) => !withEdge.has(id)),
  };
};
