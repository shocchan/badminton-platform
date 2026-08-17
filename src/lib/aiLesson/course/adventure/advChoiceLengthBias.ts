// 選択肢の長さバイアス検査（ASSESSMENT INTEGRITY・監査P0 2026-08-17）。
//
// 背景: 正解の選択肢が構造的に最長だと、本文・音声を理解せず
// 「一番長い選択肢を選ぶ」だけで偶然水準(25%)を大きく超えて正解できてしまう
// （監査時実測: 読解65%・聴解64.7%）。逆に正解が最長になることを完全に避けると、
// 今度は「最長を避ける」戦略が有利になる。
// → 正解の長さ順位が偶然と区別できない分布であることを機械で保証する。
//
// 判定:
// - 「正解が唯一最長」のセット比率が 25% + z·σ（z=2.58 ≒ 両側1%）を超えたらFAIL
// - 同比率が10%を下回ってもFAIL（逆戦略「最長を避ける」の防止）
// - 「正解が唯一最短」も同じ基準（短さで当てられる逆バイアスの防止）
import type { ReadingSet } from './reading/readingTypes';

export interface LengthBiasChoice { textJa: string; isCorrect: boolean }
export interface LengthBiasSet { setId: string; choices: LengthBiasChoice[] }

/** 正解選択肢の長さ順位カテゴリ */
export type CorrectLengthCategory = 'uniqueLongest' | 'uniqueShortest' | 'middle';

export const correctLengthCategory = (choices: LengthBiasChoice[]): CorrectLengthCategory => {
  const lens = choices.map((c) => c.textJa.length);
  const max = Math.max(...lens);
  const min = Math.min(...lens);
  const correct = choices.find((c) => c.isCorrect);
  if (!correct) return 'middle';
  const L = correct.textJa.length;
  if (L === max && lens.filter((x) => x === max).length === 1) return 'uniqueLongest';
  if (L === min && lens.filter((x) => x === min).length === 1) return 'uniqueShortest';
  return 'middle';
};

export interface LengthBiasStats {
  n: number;
  uniqueLongestIds: string[];
  uniqueShortestIds: string[];
  /** 「正解が唯一最長」のセット比率（%） */
  uniqueLongestPct: number;
  uniqueShortestPct: number;
  /** 「一番長い選択肢を選ぶ」戦略の期待正解率（%・同着はランダム扱い） */
  pickLongestAccuracyPct: number;
  pickShortestAccuracyPct: number;
}

export const lengthBiasStats = (sets: LengthBiasSet[]): LengthBiasStats => {
  const uniqueLongestIds: string[] = [];
  const uniqueShortestIds: string[] = [];
  let longestScore = 0;
  let shortestScore = 0;
  for (const s of sets) {
    const cat = correctLengthCategory(s.choices);
    if (cat === 'uniqueLongest') uniqueLongestIds.push(s.setId);
    if (cat === 'uniqueShortest') uniqueShortestIds.push(s.setId);
    const lens = s.choices.map((c) => c.textJa.length);
    const max = Math.max(...lens);
    const min = Math.min(...lens);
    const longest = s.choices.filter((c) => c.textJa.length === max);
    const shortest = s.choices.filter((c) => c.textJa.length === min);
    if (longest.some((c) => c.isCorrect)) longestScore += 1 / longest.length;
    if (shortest.some((c) => c.isCorrect)) shortestScore += 1 / shortest.length;
  }
  const n = sets.length;
  const pct = (x: number) => (n === 0 ? 0 : Math.round((x / n) * 1000) / 10);
  return {
    n,
    uniqueLongestIds,
    uniqueShortestIds,
    uniqueLongestPct: pct(uniqueLongestIds.length),
    uniqueShortestPct: pct(uniqueShortestIds.length),
    pickLongestAccuracyPct: pct(longestScore),
    pickShortestAccuracyPct: pct(shortestScore),
  };
};

/**
 * 偶然水準25%からの許容上限（%）。
 * 二項分布の正規近似: 25 + z·√(0.25·0.75/n)·100。z=2.58 ≒ 両側1%。
 * n=220 → 32.5%、n=44 → 41.8%、n=20 → 50.0%。
 */
export const chanceUpperBoundPct = (n: number, z = 2.58): number =>
  n === 0 ? 100 : Math.round((25 + z * Math.sqrt((0.25 * 0.75) / n) * 100) * 10) / 10;

/** 逆戦略（最長/最短を避ける）が成立しないための下限（%） */
export const CHANCE_LOWER_BOUND_PCT = 10;

const normalize = (t: string): string => t.replace(/\s/g, '');

/**
 * 「正解だけが本文に逐語一致する」読解セットを列挙する。
 * 本文と選択肢の文字列照合だけで（読解せずに）解けてしまうため、
 * 正解が逐語一致するなら誤答も最低1つは本文の別箇所に逐語一致していること。
 */
export const verbatimOnlyCorrectIds = (sets: ReadingSet[]): string[] => {
  const out: string[] = [];
  for (const s of sets) {
    const passage = normalize(s.passageJa);
    const correct = s.choices.find((c) => c.isCorrect);
    if (!correct) continue;
    if (!passage.includes(normalize(correct.textJa))) continue;
    const wrongMatches = s.choices.filter((c) => !c.isCorrect && passage.includes(normalize(c.textJa)));
    if (wrongMatches.length === 0) out.push(s.setId);
  }
  return out;
};
