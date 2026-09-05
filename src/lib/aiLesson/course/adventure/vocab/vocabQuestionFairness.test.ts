// 語彙問題の「公平さ」の受入テスト（2026-08-22 CEO指摘の問題設計監査）。
//
// 実機の問題バンク監査で見つかった、日本語を知らなくても当たる／知っていても外れる形を止める:
//   ① 正解だけが長い    … 「一番長いのを選ぶ」で当たる（意味問題 3,686 問中 778 問がこの形だった）
//   ② 同音異字が誤答に   … 「かみ」の表記問題に 神/髪/加味 が並ぶ＝正しい漢字を選んでも不正解
//   ③ 同表記異音が誤答に … 「一日」の読み問題に ついたち と いちにち が並ぶ＝同上
//   ④ 空欄にそのまま入る語が誤答に … 「新しい＿＿＿を買いました」に 靴/バッグ/ラケット＝正解が3つ
//   ⑤ 送り仮名の形で当たる … 「はがれる」の表記に 剥がれる/落ち着く/持ち込む/立ち寄る
//      （2026-08-29 lin さんのN2バトル実測。〜がれる で終わるのが1つしかない）
import { describe, it, expect } from 'vitest';
import { ALL_VOCAB_CONTENT } from './content/vocabContentBank';
import { activeContent } from './vocabContent';
import { buildVocabQuestions } from './vocabQuestions';

const charLen = (t: string): number => [...(t ?? '')].length;

const active = activeContent(ALL_VOCAB_CONTENT);
const questionsOf = (surface: string) => {
  const c = active.find((x) => x.surface === surface);
  if (!c) return [];
  return buildVocabQuestions(c, active, 7);
};
/** 全語ぶんの問題（重いので1回だけ作って使い回す） */
const allQuestions = active.flatMap((c, i) => buildVocabQuestions(c, active, i + 1));

describe('語彙問題の公平さ', () => {
  it('① 正解だけが飛び抜けて長い問題は、あっても全体の3%未満', () => {
    let flagged = 0;
    for (const q of allQuestions) {
      const texts = (q.choices ?? []).map((c) => c.textJa ?? '');
      if (texts.length < 2) continue;
      const lens = texts.map(charLen);
      const max = Math.max(...lens);
      const min = Math.min(...lens);
      const correct = (q.choices ?? []).find((c) => c.isCorrect);
      if (correct && charLen(correct.textJa) === max
        && lens.filter((l) => l === max).length === 1 && max >= min + 3) flagged += 1;
    }
    // 監査実測: 修正前 1,515 問（6.8%）→ 修正後 246 問（1.1%）。
    // 残りは単元教材側（cloze・rec など、この生成器の外）に由来する
    expect(flagged / allQuestions.length).toBeLessThan(0.03);
  });

  it('② 表記問題の誤答に同音異字が入らない（正しい漢字を選んで不正解にならない）', () => {
    const byReading = new Map<string, string[]>();
    for (const c of active) {
      const list = byReading.get(c.reading);
      if (list) { if (!list.includes(c.surface)) list.push(c.surface); } else byReading.set(c.reading, [c.surface]);
    }
    for (const q of allQuestions) {
      if (q.type !== 'vocab-orthography') continue;
      const correct = (q.choices ?? []).find((c) => c.isCorrect)?.textJa ?? '';
      const reading = active.find((c) => c.surface === correct)?.reading;
      if (!reading) continue;
      const homophones = (byReading.get(reading) ?? []).filter((s) => s !== correct);
      for (const ch of q.choices ?? []) {
        if (ch.isCorrect) continue;
        expect(homophones, `${q.questionJa} / ${ch.textJa}`).not.toContain(ch.textJa);
      }
    }
  });

  it('③ 読み問題の誤答に「同じ表記の別の読み」が入らない', () => {
    const bySurface = new Map<string, string[]>();
    for (const c of active) {
      const list = bySurface.get(c.surface);
      if (list) { if (!list.includes(c.reading)) list.push(c.reading); } else bySurface.set(c.surface, [c.reading]);
    }
    for (const q of allQuestions) {
      if (q.type !== 'vocab-reading') continue;
      const m = /「(.+?)」/.exec(q.questionJa ?? '');
      const others = m ? (bySurface.get(m[1]) ?? []) : [];
      if (others.length < 2) continue;
      const correct = (q.choices ?? []).find((c) => c.isCorrect)?.textJa ?? '';
      for (const ch of q.choices ?? []) {
        if (ch.isCorrect) continue;
        expect(others.filter((r) => r !== correct), `${q.questionJa} / ${ch.textJa}`).not.toContain(ch.textJa);
      }
    }
  });

  it('④ 文脈問題の誤答に「その空欄にそのまま入る語」が入らない', () => {
    const blanked = new Map<string, string[]>();
    for (const c of active) {
      if (!c.exampleJa.includes(c.surface)) continue;
      const key = c.exampleJa.replaceAll(c.surface, '＿＿＿');
      const list = blanked.get(key);
      if (list) { if (!list.includes(c.surface)) list.push(c.surface); } else blanked.set(key, [c.surface]);
    }
    for (const q of allQuestions) {
      if (q.type !== 'vocab-context') continue;
      const stem = (q.questionJa ?? '').split('\n')[0];
      const fits = (blanked.get(stem) ?? []);
      if (fits.length < 2) continue;
      const correct = (q.choices ?? []).find((c) => c.isCorrect)?.textJa ?? '';
      for (const ch of q.choices ?? []) {
        if (ch.isCorrect) continue;
        expect(fits.filter((s) => s !== correct), `${stem} / ${ch.textJa}`).not.toContain(ch.textJa);
      }
    }
  });

  it('同表記異音の語は、設問文だけで**どちらの語か**分かる（意味問題）', () => {
    // 「一日」= ついたち / いちにち。読みを添えないと正解が2つに割れる
    const qs = questionsOf('一日').filter((q) => q.type === 'vocab-meaning');
    for (const q of qs) expect(q.questionJa).toMatch(/（.+?）/);
  });
});

describe('⑤ 送り仮名の形だけで当てられないこと（2026-08-29）', () => {
  it('表記問題の選択肢は、送り仮名がすべて同じ（読みの末尾と見比べて消せない）', () => {
    const orth = allQuestions.filter((q) => q.type === 'vocab-orthography');
    expect(orth.length).toBeGreaterThan(100); // 観点ごと消してしまっていないこと
    const okuri = (t: string): string => /[ぁ-ん]+$/.exec(t)?.[0] ?? '';
    const bad = orth.filter((q) => new Set((q.choices ?? []).map((c) => okuri(c.textJa))).size > 1);
    expect(bad.map((q) => `${q.targetJapanese}: ${(q.choices ?? []).map((c) => c.textJa).join('/')}`)).toEqual([]);
  });

  it('表記問題の選択肢は字数もそろっている（長さで当てられない）', () => {
    const orth = allQuestions.filter((q) => q.type === 'vocab-orthography');
    const bad = orth.filter((q) => new Set((q.choices ?? []).map((c) => [...c.textJa].length)).size > 1);
    expect(bad.map((q) => `${q.targetJapanese}: ${(q.choices ?? []).map((c) => c.textJa).join('/')}`)).toEqual([]);
  });

  it('送り仮名のある語の読み問題は、誤答も同じ送り仮名で終わる', () => {
    const reading = allQuestions.filter((q) => q.type === 'vocab-reading');
    expect(reading.length).toBeGreaterThan(100);
    const bad: string[] = [];
    for (const q of reading) {
      const correct = (q.choices ?? []).find((c) => c.isCorrect);
      if (!correct) continue;
      // 見出し（targetJapanese）の末尾かな＝画面に出ている送り仮名
      const okuri = /[ぁ-ん]+$/.exec(q.targetJapanese ?? '')?.[0];
      if (!okuri) continue;
      for (const c of q.choices ?? []) {
        if (!c.textJa.endsWith(okuri)) bad.push(`${q.targetJapanese}: ${c.textJa}`);
      }
    }
    expect(bad).toEqual([]);
  });
});
