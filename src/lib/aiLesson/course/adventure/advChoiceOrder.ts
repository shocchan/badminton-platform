// 選択肢の提示順（ASSESSMENT INTEGRITY §11〜§14）。
//
// 鉄則:
// - 採点は **correctChoiceId** で行い、表示位置では判定しない
// - 表示順は attempt開始時に決定的シャッフル（同一attemptではrender/reloadで不変、新attemptでは変わる）
// - render中に Math.random() を呼ばない
// - battle全体で正解位置を均す（先頭偏り・3連続を防ぐ）
import type { AdvBattleQuestion, AdvChoice } from './advVariants';
import { hashSeed } from './advVariants';

/** seed付きFisher-Yates（再現可能） */
export const seededFisherYates = <T,>(arr: readonly T[], seed: number): T[] => {
  const a = [...arr];
  let s = (seed >>> 0) || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 0x100000000; };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** 1問の提示状態。保存対象（§12） */
export interface PresentedQuestion {
  key: string;
  /** 表示順のchoiceId列 */
  presentedChoiceOrder: string[];
  /** 正解のchoiceId（採点はこれだけを使う） */
  correctChoiceId: string;
  /** この問題の提示順を決めたseed */
  attemptSeed: number;
  /** 表示順に並べた選択肢 */
  choices: AdvChoice[];
}

/**
 * 1問の提示順を決める。
 * desiredCorrectPosition を渡すと、シャッフル後に正解をその位置へ入れ替える
 * （battle全体のバランス調整用。入れ替えも決定的）。
 */
export const presentQuestion = (
  q: AdvBattleQuestion, attemptSeed: number, desiredCorrectPosition?: number,
): PresentedQuestion => {
  const seed = hashSeed(`${attemptSeed}:${q.key}`);
  const shuffled = seededFisherYates(q.choices, seed);
  const correctChoiceId = q.choices.find((c) => c.isCorrect)?.choiceId ?? q.choices[0].choiceId;
  let ordered = shuffled;
  if (desiredCorrectPosition !== undefined && desiredCorrectPosition >= 0 && desiredCorrectPosition < shuffled.length) {
    const cur = shuffled.findIndex((c) => c.isCorrect);
    if (cur !== desiredCorrectPosition) {
      ordered = [...shuffled];
      [ordered[cur], ordered[desiredCorrectPosition]] = [ordered[desiredCorrectPosition], ordered[cur]];
    }
  }
  return {
    key: q.key,
    presentedChoiceOrder: ordered.map((c) => c.choiceId),
    correctChoiceId,
    attemptSeed: seed,
    choices: ordered,
  };
};

/**
 * battle全体の正解位置を均す（§13）。
 * - 各位置の出現数を均等に近づける
 * - 同じ位置が3問以上連続しない
 * - 選択肢数が異なる問題（3択）にも対応（位置は 0..len-1 に収める）
 */
export const balancedPositions = (choiceCounts: number[], seed: number): number[] => {
  const n = choiceCounts.length;
  if (n === 0) return [];
  const maxChoices = Math.max(...choiceCounts);
  // 位置プールを均等に作る（例: 20問4択 → 各位置5個）。
  // 問題数が選択肢数で割り切れないとき、余りが常に同じ位置に付くと
  // battle横断で特定位置が薄くなる（7問4択なら位置4が1/7に固定される）。
  // seedで開始位置を回転させ、多数battleの合計で均等になるようにする。
  const offset = (seed >>> 0) % maxChoices;
  const pool: number[] = [];
  for (let i = 0; i < n; i++) pool.push((i + offset) % maxChoices);
  const shuffled = seededFisherYates(pool, seed);

  const out: number[] = [];
  const used = [...shuffled];
  for (let i = 0; i < n; i++) {
    const limit = choiceCounts[i];
    // 3連続回避 + 選択肢数に収まる候補を先頭から探す
    let pick = -1;
    for (let k = 0; k < used.length; k++) {
      const cand = used[k];
      if (cand >= limit) continue;
      const streak = out.length >= 2 && out[out.length - 1] === cand && out[out.length - 2] === cand;
      if (streak) continue;
      pick = k;
      break;
    }
    if (pick === -1) {
      // 制約を満たす候補が無い場合は、範囲内で最も使用回数の少ない位置へ落とす
      const counts = new Array(limit).fill(0);
      for (const p of out) if (p < limit) counts[p] += 1;
      let best = 0;
      for (let p = 1; p < limit; p++) if (counts[p] < counts[best]) best = p;
      out.push(best);
      continue;
    }
    out.push(used[pick]);
    used.splice(pick, 1);
  }
  return out;
};

/** battleの全問を提示順つきで確定する（attempt開始時に1回だけ呼ぶ） */
export const presentBattle = (questions: AdvBattleQuestion[], attemptSeed: number): PresentedQuestion[] => {
  const positions = balancedPositions(questions.map((q) => q.choices.length), attemptSeed);
  return questions.map((q, i) => presentQuestion(q, attemptSeed, positions[i]));
};

/** 採点（choiceId比較。表示位置は一切使わない） */
export const isCorrectAnswer = (p: PresentedQuestion, pickedChoiceId: string | null): boolean =>
  pickedChoiceId !== null && pickedChoiceId === p.correctChoiceId;

/** 正解が表示上どの位置にあったか（統計・監査用） */
export const correctPositionOf = (p: PresentedQuestion): number =>
  p.presentedChoiceOrder.indexOf(p.correctChoiceId);

export interface DistributionStats {
  totalQuestions: number;
  positionCounts: number[];
  positionPct: number[];
  maxStreak: number;
  /** カイ二乗統計量（自由度=位置数-1） */
  chiSquare: number;
  pass: boolean;
  failures: string[];
}

/**
 * 正解位置分布の検査（§14）。
 * 判定: 各位置 20〜30%以内・3連続以上が過度に起きない・カイ二乗が閾値以内。
 */
export const analyzeDistribution = (
  battles: PresentedQuestion[][], positions = 4,
): DistributionStats => {
  const counts = new Array(positions).fill(0);
  let total = 0;
  let maxStreak = 0;
  for (const battle of battles) {
    let streak = 0; let prev = -1;
    for (const p of battle) {
      const pos = correctPositionOf(p);
      if (pos < 0 || pos >= positions) continue;
      counts[pos] += 1;
      total += 1;
      if (pos === prev) { streak += 1; } else { streak = 1; prev = pos; }
      if (streak > maxStreak) maxStreak = streak;
    }
  }
  const pct = counts.map((c) => (total === 0 ? 0 : (c / total) * 100));
  const expected = total / positions;
  const chiSquare = expected === 0 ? 0
    : counts.reduce((acc, c) => acc + ((c - expected) ** 2) / expected, 0);
  const failures: string[] = [];
  for (const [i, p] of pct.entries()) {
    if (p < 20 || p > 30) failures.push(`position${i + 1}=${p.toFixed(2)}% (allowed 20-30%)`);
  }
  if (maxStreak > 2) failures.push(`maxStreak=${maxStreak} (allowed <=2)`);
  // 自由度3・p=0.001 の臨界値 16.27 を上限に採る（大標本での厳しめ判定）
  if (chiSquare > 16.27) failures.push(`chiSquare=${chiSquare.toFixed(2)} (allowed <=16.27)`);
  return {
    totalQuestions: total,
    positionCounts: counts,
    positionPct: pct.map((p) => Math.round(p * 100) / 100),
    maxStreak,
    chiSquare: Math.round(chiSquare * 100) / 100,
    pass: failures.length === 0,
    failures,
  };
};
