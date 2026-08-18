// かな道場の範囲テスト（2026-08-18 拡張）。
// 拡張前は清音92字だけで、道場を全部終えても「がっこう」「きょう」「コーヒー」が読めず、
// そのまま基礎キャンプ（N5語彙の82.5%が漢字を含む）へ送られていた（CEO指摘）。
import { describe, it, expect } from 'vitest';
import { KANA_ROWS, buildRowQuiz, buildKanaCheck, KANA_CHECK_PASS } from './advKana';

const allChars = KANA_ROWS.flatMap((r) => r.chars);

/** レーベンシュタイン距離（最小対かどうかの判定に使う） */
const editDistance = (a: string, b: string): number => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
};
const groupOf = (g: string) => KANA_ROWS.filter((r) => (r.group ?? 'seion') === g);

describe('かな道場が濁音・拗音・促音・長音を含む', () => {
  it('4種すべてに行がある', () => {
    for (const g of ['seion', 'dakuon', 'youon', 'sokuon', 'chouon']) {
      expect(groupOf(g).length, `${g} の行が無い`).toBeGreaterThan(0);
    }
  });

  it('代表的な文字・語が実際に入っている', () => {
    const kanas = new Set(allChars.map((c) => c.kana));
    for (const k of ['が', 'ざ', 'だ', 'ば', 'ぱ', 'ガ', 'パ']) expect(kanas.has(k), `${k} が無い`).toBe(true);
    for (const k of ['きゃ', 'しゅ', 'ちょ', 'じゃ', 'ぴょ', 'キャ', 'ショ']) expect(kanas.has(k), `${k} が無い`).toBe(true);
    for (const k of ['がっこう', 'きって', 'コーヒー', 'おとうさん', 'せんせい']) expect(kanas.has(k), `${k} が無い`).toBe(true);
  });

  it('rowIdが重複していない（進捗の取り違えを防ぐ）', () => {
    const ids = KANA_ROWS.map((r) => r.rowId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('清音の行IDは拡張前と同じ（既存の進捗が無効にならない）', () => {
    const seionIds = groupOf('seion').map((r) => r.rowId).sort();
    const expected = [...Array(10)].map((_, i) => `h-${i + 1}`)
      .concat([...Array(10)].map((_, i) => `k-${i + 1}`)).sort();
    expect(seionIds).toEqual(expected);
  });
});

describe('問題の作りが学習として成立している', () => {
  it('全行の全問で、正解が選択肢に1つだけ入っている', () => {
    for (const row of KANA_ROWS) {
      for (const q of buildRowQuiz(row, 11)) {
        expect(q.choices.length, `${row.rowId}/${q.kana} の選択肢数`).toBe(4);
        expect(new Set(q.choices).size, `${row.rowId}/${q.kana} に重複選択肢`).toBe(4);
        expect(q.choices[q.answerIndex]).toBeTruthy();
      }
    }
  });

  it('日本語に存在しないローマ字（同じ字が3つ続く）を誤答に出さない', () => {
    const bad: string[] = [];
    for (const row of KANA_ROWS) {
      for (const q of buildRowQuiz(row, 11)) {
        for (const c of q.choices) if (/(.)\1\1/.test(c)) bad.push(`${q.kana}:${c}`);
      }
    }
    expect(bad, `不自然な誤答: ${bad.slice(0, 5).join(', ')}`).toEqual([]);
  });

  it('促音・長音の問題は最小対で出す（長さだけで当てられない）', () => {
    for (const row of KANA_ROWS.filter((r) => r.group === 'sokuon' || r.group === 'chouon')) {
      for (const q of buildRowQuiz(row, 5)) {
        const correct = q.choices[q.answerIndex];
        // 正解と2文字以内しか違わない誤答が最低1つある＝規則を確かめる問題になっている。
        // 前方一致で見ると eiga ⇄ eega のような正しい最小対を取りこぼすので編集距離で測る
        const close = q.choices.filter((c) => c !== correct && editDistance(c, correct) <= 2);
        expect(close.length, `${q.kana} の誤答が最小対になっていない: ${q.choices.join('/')}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('卒業チェックが道場の範囲を測る', () => {
  it('清音以外からも出題される（清音だけ読める人が全部飛ばせない）', () => {
    const kanas = new Set(allChars.filter((c) => {
      const row = KANA_ROWS.find((r) => r.chars.includes(c));
      return (row?.group ?? 'seion') !== 'seion';
    }).map((c) => c.kana));
    // seedを変えても必ず清音以外が混ざる
    for (const seed of [1, 7, 20260818, 99991]) {
      const q = buildKanaCheck(seed);
      expect(q.length).toBe(10);
      expect(q.some((x) => kanas.has(x.kana)), `seed=${seed} で清音以外が出ない`).toBe(true);
    }
  });

  it('合格ラインは10問中9問のまま', () => {
    expect(KANA_CHECK_PASS).toBe(9);
  });
});
