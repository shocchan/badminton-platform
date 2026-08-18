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

// ---------------------------------------------------------------------------
// 逐語一致「長さ」の検査（2026-08-18 追加）。
//
// verbatimOnlyCorrectIds は「選択肢の全文が本文に含まれるか」しか見ないので、
// 誤答が1つでも短く一致していればPASSしてしまう。実際 n4r-info-09 は
// 正解が18字まるごと本文にあるのに、9字の誤答が一致していたためPASSしていた。
// → 一致の**長さ**で測り直す。「本文と最も長く一致する選択肢を選ぶ」だけの
//   戦略が偶然水準を超えるなら、本文を読まなくても解けているということ。
//   （監査時実測 2026-08-18: 新規N5/N4 47.3%・既存N3/N2 37.0%・偶然25%）
// ---------------------------------------------------------------------------

/** a と b の最長共通部分文字列（連続一致）の長さ */
export const longestCommonRun = (a: string, b: string): number => {
  if (a.length === 0 || b.length === 0) return 0;
  let prev = new Uint16Array(b.length + 1);
  let cur = new Uint16Array(b.length + 1);
  let best = 0;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : 0;
      if (cur[j] > best) best = cur[j];
    }
    const t = prev; prev = cur; cur = t;
    cur.fill(0);
  }
  return best;
};

/** 正解だけが突出して長く本文と一致しているセット（許容差を超えたもの） */
export interface VerbatimRunOutlier {
  setId: string;
  /** 正解と本文の最長一致長 */
  correctRun: number;
  /** 誤答3つの最長一致長のうち最大 */
  wrongRunMax: number;
  margin: number;
}

export interface VerbatimRunStats {
  n: number;
  /** 「本文と最も長く一致する選択肢を選ぶ」戦略の期待正解率（%・同着はランダム扱い） */
  pickLongestRunAccuracyPct: number;
  outliers: VerbatimRunOutlier[];
}

/**
 * 許容差 maxMargin: 正解の一致長が誤答の最大より何文字長いところまで許すか。
 * 読解では正解が本文を言い換える以上、数文字の差はどうしても出る。
 * 5文字以上開いていると「本文を眺めて一番同じ形の選択肢を選ぶ」で当たるので、既定は4。
 */
export const verbatimRunStats = (sets: ReadingSet[], maxMargin = 4): VerbatimRunStats => {
  const outliers: VerbatimRunOutlier[] = [];
  let score = 0;
  for (const s of sets) {
    const passage = normalize(s.passageJa);
    const runs = s.choices.map((c) => longestCommonRun(passage, normalize(c.textJa)));
    const max = Math.max(...runs);
    const winners = s.choices.filter((_, i) => runs[i] === max);
    if (winners.some((c) => c.isCorrect)) score += 1 / winners.length;
    const ci = s.choices.findIndex((c) => c.isCorrect);
    if (ci < 0) continue;
    const wrongRunMax = Math.max(...runs.filter((_, i) => i !== ci));
    const margin = runs[ci] - wrongRunMax;
    if (margin > maxMargin) outliers.push({ setId: s.setId, correctRun: runs[ci], wrongRunMax, margin });
  }
  const n = sets.length;
  return {
    n,
    pickLongestRunAccuracyPct: n === 0 ? 0 : Math.round((score / n) * 1000) / 10,
    outliers,
  };
};
