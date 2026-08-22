// 「選択肢の長さで当てられるか」を種類ごとに測る（2026-08-22）。
//
// questionAudit の correct_longest は**1問ずつ**の形しか見ない。だが本当に問題なのは
// 「一番長い選択肢を選ぶ」戦略が偶然（4択=25%）を超えて当たること。
// 正解が唯一最長になる問題が一定割合あるのは**むしろ正常**（避けすぎると逆戦略が有利になる）。
// ここでは advChoiceLengthBias の基準（25% ± 二項分布の許容幅）で種類ごとに合否を出す。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/length-bias-report.ts
import { vocabPool } from '../../src/lib/aiLesson/course/adventure/vocab/vocabQuestions';
import { loadGrammarPools } from '../../src/lib/aiLesson/course/adventure/advContent';
import {
  lengthBiasStats, chanceUpperBoundPct, type LengthBiasSet,
} from '../../src/lib/aiLesson/course/adventure/advChoiceLengthBias';
import type { AdvBattleQuestion } from '../../src/lib/aiLesson/course/adventure/advVariants';

const all = new Map<string, AdvBattleQuestion>();
for (const level of ['N3', 'N2'] as const) {
  for (const qs of vocabPool(level).values()) for (const q of qs) all.set(q.key, q);
}
const pools = await loadGrammarPools();
for (const qs of pools.byItem.values()) for (const q of qs) all.set(q.key, q);

const byType = new Map<string, LengthBiasSet[]>();
for (const q of all.values()) {
  const choices = (q.choices ?? []).map((c) => ({ textJa: c.textJa ?? '', isCorrect: !!c.isCorrect }));
  if (choices.length < 3) continue;
  const list = byType.get(q.type) ?? [];
  list.push({ setId: q.key, choices });
  byType.set(q.type, list);
}

/**
 * 偶然水準は選択肢の数で変わる（4択=25%・3択=33.3%）。単元教材は3択が多いので、
 * 25%固定で見ると「長さで当てられる」と誤って判定してしまう。セットごとの 1/選択肢数 の平均を使う
 */
const chancePct = (sets: LengthBiasSet[]): number =>
  Math.round((sets.reduce((a, s) => a + 1 / s.choices.length, 0) / Math.max(1, sets.length)) * 1000) / 10;

const rows: string[] = [];
let ng = 0;
// 「唯一最長がある問題に限れば、それが正解である率」。全部同じ長さに揃えた種類は
// 唯一最長がめったに出ないので、全体の比率だけ見ると誤解する。条件付きで見るのが正しい
const conditional = (sets: LengthBiasSet[]): { hasUnique: number; correctPct: number } => {
  let has = 0; let hit = 0;
  for (const s of sets) {
    const lens = s.choices.map((c) => c.textJa.length);
    const max = Math.max(...lens);
    if (lens.filter((x) => x === max).length !== 1) continue;
    has += 1;
    if (s.choices.find((c) => c.textJa.length === max)?.isCorrect) hit += 1;
  }
  return { hasUnique: has, correctPct: has === 0 ? 0 : Math.round((hit / has) * 1000) / 10 };
};

const header = '種類'.padEnd(20) + '問数'.padStart(7) + '  唯一最長%  最長を選ぶ%  偶然%  上限%  最短を選ぶ%  唯一最長あり/正解%  判定';
console.log(header);
console.log('-'.repeat(header.length + 8));
for (const [type, sets] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const s = lengthBiasStats(sets);
  const ch = chancePct(sets);
  // 4択基準の許容幅を、その種類の実際の偶然水準にずらす
  const upper = Math.round((chanceUpperBoundPct(s.n) - 25 + ch) * 10) / 10;
  // 判定は「長さの戦略が偶然を超えて当たるか」だけを見る（唯一最長の比率そのものは手段であって目的ではない）
  const bad = s.pickLongestAccuracyPct > upper || s.pickShortestAccuracyPct > upper;
  if (bad) ng += 1;
  const line = `${type.padEnd(20)}${String(s.n).padStart(7)}  ${String(s.uniqueLongestPct).padStart(9)}  `
    + `${String(s.pickLongestAccuracyPct).padStart(10)}  ${String(chancePct(sets)).padStart(5)}  ${String(upper).padStart(5)}  `
    + `${String(s.pickShortestAccuracyPct).padStart(10)}  `
    + `${String(conditional(sets).hasUnique).padStart(8)}/${String(conditional(sets).correctPct).padStart(5)}  ${bad ? 'NG' : 'ok'}`;
  console.log(line);
  rows.push(line);
}
console.log(`\nNGの種類: ${ng}`);
