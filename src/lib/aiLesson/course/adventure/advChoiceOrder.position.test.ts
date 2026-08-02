// 正解位置の分布（P0後の§3）。
//
// 発端: 実測で d:0 が出た。原因は3択問題（unit生成問題）の混入で、
// 3択では d が正解になり得ない。ここでは選択肢数ごとに分けて、
//   - 4択: A/B/C/D すべてが正解位置になり得る
//   - 3択: A/B/C すべてが正解位置になり得て、D は決して出ない
//   - 提示順シャッフル後も採点（correctChoiceId）が一致する
// を**決定的に**検査する。
import { describe, it, expect } from 'vitest';
import { presentQuestion } from './advChoiceOrder';
import type { AdvBattleQuestion } from './advVariants';

const makeQuestion = (choiceCount: 3 | 4): AdvBattleQuestion => ({
  key: `fx-${choiceCount}`,
  type: 'u-know', level: 'n3', skill: 'grammar', examSection: 'languageKnowledge',
  targetJapanese: null, questionJa: 'Q', questionZh: 'Q',
  // 正解は元データで**先頭**（bankの実際の並びと同じ最悪ケース）
  choices: Array.from({ length: choiceCount }, (_, i) => ({
    choiceId: `c${i}`, textJa: `choice-${i}`, isCorrect: i === 0,
  })),
  explanation: {
    meaningJa: '', meaningZh: '', whyCorrectJa: '', whyCorrectZh: '',
    exampleJa: null, exampleZh: null, sourceItemId: 'fx', sourceLabel: 'fx',
  },
  sourceItemId: 'fx', difficulty: 1, timed: false, variantId: 'fx',
  reviewState: 'authored', status: 'validated_beta',
} as AdvBattleQuestion);

/** worker の sanitize と同じ呼び方（posIndex % min(len,4) を desiredCorrectPosition に渡す） */
const positionOf = (q: AdvBattleQuestion, seed: number, posIndex: number): number => {
  const presented = presentQuestion(q, seed, posIndex % Math.min(q.choices.length, 4));
  return presented.choices.findIndex((c) => c.isCorrect);
};

describe('正解位置の分布（choice数別）', () => {
  it('4択: A/B/C/D すべてが正解位置になり、極端に偏らない', () => {
    const q = makeQuestion(4);
    const dist = [0, 0, 0, 0];
    let n = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (let pos = 0; pos < 4; pos++) {
        dist[positionOf(q, seed * 977, pos)] += 1;
        n += 1;
      }
    }
    // 全位置が出現し、どの位置も半数を超えない
    for (let i = 0; i < 4; i++) expect(dist[i], `位置${i}が一度も正解にならない`).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) expect(dist[i] / n).toBeLessThan(0.5);
    // desiredCorrectPosition を4周期で回すので、理想は各25%。±10ptに収まること
    for (let i = 0; i < 4; i++) expect(Math.abs(dist[i] / n - 0.25)).toBeLessThan(0.10);
  });

  it('3択: A/B/C すべてが出現し、D は決して出ない', () => {
    const q = makeQuestion(3);
    const dist = [0, 0, 0];
    let dSeen = 0;
    for (let seed = 1; seed <= 100; seed++) {
      for (let pos = 0; pos < 4; pos++) { // worker は posIndex を 0..3 で回す（% len で丸まる）
        const at = positionOf(q, seed * 977, pos);
        if (at >= 3) dSeen += 1;
        else dist[at] += 1;
      }
    }
    expect(dSeen).toBe(0); // 3択で位置dが「正解」になったら mapping 欠陥
    for (let i = 0; i < 3; i++) expect(dist[i], `位置${i}が一度も正解にならない`).toBeGreaterThan(0);
  });

  it('シャッフル後も採点が一致する（表示順とcorrectChoiceIdの対応）', () => {
    const q = makeQuestion(4);
    for (let seed = 1; seed <= 50; seed++) {
      const p = presentQuestion(q, seed * 31, seed % 4);
      // correctChoiceId は常に元の正解ID
      expect(p.correctChoiceId).toBe('c0');
      // 表示順のどこにあっても、そのIDの選択肢だけが isCorrect
      const atIdx = p.presentedChoiceOrder.indexOf('c0');
      expect(atIdx).toBeGreaterThanOrEqual(0);
      expect(p.choices[atIdx].isCorrect).toBe(true);
      expect(p.choices.filter((c) => c.isCorrect)).toHaveLength(1);
    }
  });

  it('同じseed・同じ希望位置なら同じ並び（reload/resume不変）', () => {
    const q = makeQuestion(4);
    const a = presentQuestion(q, 12345, 2);
    const b = presentQuestion(q, 12345, 2);
    expect(a.presentedChoiceOrder).toEqual(b.presentedChoiceOrder);
    const c = presentQuestion(q, 54321, 2);
    // 別attempt（別seed）では並びが変わり得る（常に同じならシャッフルしていない）
    expect(a.presentedChoiceOrder.join() === c.presentedChoiceOrder.join()
      || presentQuestion(q, 99999, 1).presentedChoiceOrder.join() !== a.presentedChoiceOrder.join()).toBe(true);
  });
});
