// 選択肢の位置の偏り（2026-09-06 CEO指摘「単語学習の答えが全部1つ目になっている」）。
//
// 生成器は「正解＋ダミー」の順で配列を作る。表示する側がシャッフルを通し忘れると、
// **正解が必ず1番目**になり、語を知らなくても満点が取れる。
// 画面ごとに作り直さず、必ず presentBattle を通すことを、この検査で固定する。
import { describe, it, expect } from 'vitest';
import { pickLearnSession } from './vocabLearnData';
import { buildAssessQuestions } from '../../quality/assessQuestionEngine';
import { allVocabularyItems } from '../../foundationVocabBank';

describe('新しいことばを覚える: 選択肢の位置', () => {
  it('**正解が1番目に偏らない**（40セッション400問で実測）', () => {
    const pos = [0, 0, 0, 0];
    let n = 0;
    for (let s = 0; s < 40; s += 1) {
      for (const q of pickLearnSession('N1', {}, 1000 + s).session.questions) {
        const i = q.choices.findIndex((c) => c.isCorrect);
        expect(i, '正解が選択肢に無い').toBeGreaterThanOrEqual(0);
        pos[i] += 1; n += 1;
      }
    }
    expect(n).toBeGreaterThan(300);
    // 均等なら各25%。どの位置も15%〜40%に収まっていれば「位置で当てる」は成立しない
    for (const [i, c] of pos.entries()) {
      const pct = Math.round((c / n) * 100);
      expect(pct, `位置${i + 1}が${pct}%（${pos.join('/')}）`).toBeGreaterThanOrEqual(15);
      expect(pct, `位置${i + 1}が${pct}%（${pos.join('/')}）`).toBeLessThanOrEqual(40);
    }
  });

  it('同じseedなら同じ並び（開き直しても問題が変わらない）', () => {
    const a = pickLearnSession('N1', {}, 555).session.questions.map((q) => q.choices.map((c) => c.textJa).join('|'));
    const b = pickLearnSession('N1', {}, 555).session.questions.map((q) => q.choices.map((c) => c.textJa).join('|'));
    expect(a).toEqual(b);
  });
});

describe('単元パネルの問題: 選択肢の位置', () => {
  it('**選択式の問題で正解が1番目に偏らない**（並べ替えは対象外）', () => {
    const items = allVocabularyItems();
    const byLen = new Map<number, number[]>();
    for (const it of items) {
      for (const q of buildAssessQuestions(it, items, {} as never)) {
        if (q.kind !== 'choice' || !Array.isArray(q.choices)) continue;
        const len = q.choices.length;
        const row = byLen.get(len) ?? new Array(len).fill(0);
        row[q.answerIndex] += 1;
        byLen.set(len, row);
      }
    }
    for (const [len, row] of byLen) {
      const n = row.reduce((a, b) => a + b, 0);
      if (n < 30) continue; // 数が少ない形は偶然のばらつきが大きいので見ない
      const worst = Math.round((Math.max(...row) / n) * 100);
      const even = Math.round(100 / len);
      expect(worst, `${len}択の最頻位置が${worst}%（均等なら${even}%・${row.join('/')}）`)
        .toBeLessThanOrEqual(even + 15);
    }
  });
});
