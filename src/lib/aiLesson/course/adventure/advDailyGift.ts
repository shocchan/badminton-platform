// 今日のことば＝その日に配るひとつを決める（2026-09-07）。
//
// 決め方の要件:
//   1. **同じ日に何度開いても同じ**（引き直しでガチャにしない。学習の材料であって運試しではない）
//   2. **人によってずれる**（同じ日に全員が同じ言葉だと、先生が個別に話しづらい）
//   3. **40日間は繰り返さない**（PROVERBS の件数ぶん一巡してから戻る）
//   4. 乱数を使わない＝保存しなくても再現できる。日付と学習者IDだけで決まる
import { PROVERBS, type Proverb } from './advProverbs';

const DAY_MS = 86400000;

/** 文字列 → 0以上の整数（安定・短い。暗号用途ではない） */
const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/** 1970-01-01 からの日数（YYYY-MM-DD をUTCで解釈） */
const dayIndex = (dateKey: string): number => Math.floor(Date.parse(dateKey) / DAY_MS);

/**
 * その日のことば。dateKey が壊れていたら先頭を返す（画面を空にしない）。
 * learnerSeed は学習者ID等。省略すると全員同じ並びになる。
 */
export const todayProverb = (dateKey: string, learnerSeed = ''): Proverb => {
  const day = dayIndex(dateKey);
  if (!Number.isFinite(day)) return PROVERBS[0];
  // 学習者ごとに開始位置をずらし、そこから1日ずつ進む＝一巡するまで重複しない
  const offset = learnerSeed ? hash(learnerSeed) % PROVERBS.length : 0;
  const i = (((day + offset) % PROVERBS.length) + PROVERBS.length) % PROVERBS.length;
  return PROVERBS[i];
};

/** 今日ぶんの通し番号（「40のうち◯個目」の表示に使う。1始まり） */
export const proverbOrdinal = (dateKey: string, learnerSeed = ''): number => {
  const p = todayProverb(dateKey, learnerSeed);
  return PROVERBS.findIndex((x) => x.id === p.id) + 1;
};

export const PROVERB_TOTAL = PROVERBS.length;
