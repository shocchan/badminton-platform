// 診断の選択肢シャッフルの受入テスト（CEO指摘: 正解が1番に偏っていた）。
// いちばん守りたいこと:
// - 正解位置が先頭に固まらない（ばらける）
// - シャッフルは決定的（同じ問題は何度開いても同じ並び＝reloadで答えの位置が変わらない）
// - answerIndex が並び替え後も正しい選択肢を指す
import { describe, it, expect } from 'vitest';
import { selectDiagnosisQuestions, type DiagnosisPools, type DiagQuestion } from './advDiagnosis';

const q = (key: string, level: DiagQuestion['level'], skill: DiagQuestion['skill']): DiagQuestion => ({
  key, level, skill,
  promptJa: '', promptZh: `问题${key}`,
  choices: [`正解-${key}`, 'b', 'c', 'd'],
  answerIndex: 0, // 全問「執筆順で1番が正解」という偏った素材
  explanationZh: '',
  refId: key,
});

const pools: DiagnosisPools = {
  foundationVocab: Array.from({ length: 6 }, (_, i) => q(`fv${i}`, 'foundation', 'vocabulary')),
  n3Vocab: Array.from({ length: 6 }, (_, i) => q(`nv${i}`, 'n3', 'vocabulary')),
  n3Grammar: Array.from({ length: 8 }, (_, i) => q(`ng${i}`, 'n3', 'grammar')),
  n2Grammar: Array.from({ length: 8 }, (_, i) => q(`n2g${i}`, 'n2', 'grammar')),
};

describe('診断の選択肢シャッフル', () => {
  it('**正解位置が先頭に固まらない**（全問1番正解の素材でも位置がばらける）', () => {
    const qs = selectDiagnosisQuestions(pools, 'N3', 'jlpt', 20260731);
    expect(qs.length).toBeGreaterThanOrEqual(10);
    const positions = new Set(qs.map((x) => x.answerIndex));
    expect(positions.size).toBeGreaterThanOrEqual(3); // 4択で最低3種類の位置に散る
    expect(qs.filter((x) => x.answerIndex === 0).length).toBeLessThan(qs.length / 2);
  });

  it('answerIndexは並び替え後も正解選択肢を指す', () => {
    const qs = selectDiagnosisQuestions(pools, 'N3', 'jlpt', 20260731);
    for (const x of qs) expect(x.choices[x.answerIndex]).toBe(`正解-${x.key}`);
  });

  it('シャッフルは決定的（同じseedなら並びが再現する）', () => {
    const a = selectDiagnosisQuestions(pools, 'N3', 'jlpt', 20260731);
    const b = selectDiagnosisQuestions(pools, 'N3', 'jlpt', 20260731);
    expect(a.map((x) => x.choices.join('|'))).toEqual(b.map((x) => x.choices.join('|')));
  });
});
