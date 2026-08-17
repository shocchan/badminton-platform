// 単元問題（n3unit）に「設問を読むだけで解ける問題」が無いこと。2026-08-17 CEO実機報告。
//
// 報告された実物:
//   「する」を使う自然な言い方はどれ？ → 日本に来る／**仕事をする**／学校に行く
// 誤答から対象語を除外するガード（複数正解の防止）がある以上、
// **対象語を含む選択肢＝正解**が構造的に確定し、日本語を知らなくても字面で解けていた。
import { describe, it, expect } from 'vitest';
import { N3_UNIT_SPECS } from './n3UnitSpecs';
import { buildUnitQuestions } from '../n3unit/unitRuntime';
import { allVocabularyItems } from '../foundationVocabBank';

const allChoiceQuestions = () => {
  const vocab = allVocabularyItems();
  const out: { unitId: string; q: ReturnType<typeof buildUnitQuestions>['diagnostic'][number] }[] = [];
  for (const spec of N3_UNIT_SPECS) {
    const set = buildUnitQuestions(spec, vocab);
    for (const q of [...set.diagnostic, ...set.byStage.understand, ...set.byStage.distinguish, ...set.byStage.apply]) {
      if (q.kind === 'choice') out.push({ unitId: spec.unitId, q });
    }
  }
  return out;
};

describe('設問を読むだけで解ける問題を出さない', () => {
  it('**設問の「」内の語が、正解の選択肢にだけ含まれている問題は0件**', () => {
    const leaked: string[] = [];
    for (const { unitId, q } of allChoiceQuestions()) {
      const correct = q.choices[q.answerIndex];
      const quoted = [...`${q.promptJa} ${q.promptZh}`.matchAll(/「([^」]{1,12})」/gu)].map((m) => m[1]);
      for (const w of quoted) {
        if (w.length < 2 || !correct.includes(w)) continue;
        if (q.choices.some((c, i) => i !== q.answerIndex && c.includes(w))) continue;
        leaked.push(`[${unitId}] ${q.promptJa} → 正解「${correct}」に「${w}」`);
        break;
      }
    }
    expect(leaked, `答えが見えている問題 ${leaked.length}件:\n${leaked.slice(0, 10).join('\n')}`).toEqual([]);
  }, 60_000);

  it('コロケーション問題は全選択肢が空欄形で揃っている（正解だけ形が違わない）', () => {
    const odd: string[] = [];
    let n = 0;
    for (const { unitId, q } of allChoiceQuestions()) {
      if (q.dimension !== 'collocation') continue;
      n += 1;
      if (!q.choices.every((c) => c.includes('＿＿'))) odd.push(`[${unitId}] ${q.choices.join(' / ')}`);
    }
    expect(n, 'コロケーション問題が1問も無い（生成が壊れている）').toBeGreaterThan(50);
    expect(odd, `空欄になっていない選択肢を含む問題 ${odd.length}件`).toEqual([]);
  }, 60_000);

  it('コロケーション問題が消えていない（漏洩を消すために出題を削っていない）', () => {
    // 2026-08-17 実測: 104問。空欄が作れない語は出さないので、ここが大きく減ったら要調査
    const n = allChoiceQuestions().filter(({ q }) => q.dimension === 'collocation').length;
    expect(n).toBeGreaterThanOrEqual(100);
  }, 60_000);
});
