// 漢字カリキュラムがアプリに繋がっていることの回帰テスト（2026-08-18 新設）。
//
// 「漢字を教える場が無く、語彙問題の読み方として出るだけ」だったのを、
// 字ごとに積み上げる導線として独立させた。
// データを作っただけで**どこからも参照されていない**状態（生成直後がまさにそうだった）を
// 二度と作らないよう、出題まで通ることをここで固定する。
import { describe, it, expect } from 'vitest';
import {
  ALL_KANJI, kanjiFor, kanjiInScope, kanjiPool, kanjiTargetIds, kanjiCoverage, kanjiQuestionsFor,
} from './kanjiBank';
import { activeKanji, kanjiReadingChoiceIssues, KANJI_FIELDS_AFTER_ANSWER_ONLY } from './kanjiTypes';

describe('漢字が出題まで届く', () => {
  it('N5・N4とも出題可能な字がある', () => {
    expect(kanjiFor('N5').length).toBeGreaterThan(80);
    expect(kanjiFor('N4').length).toBeGreaterThan(80);
  });

  it('N4目標はN5の字も範囲に入る（土台を飛ばさない）', () => {
    expect(kanjiInScope('N4').length).toBe(kanjiFor('N5').length + kanjiFor('N4').length);
    expect(kanjiInScope('N5').length).toBe(kanjiFor('N5').length);
  });

  it('プールが空でない（押しても0問の行き止まりを作らない）', () => {
    for (const lv of ['N5', 'N4'] as const) {
      const pool = kanjiPool(lv);
      expect(kanjiTargetIds(lv).length).toBeGreaterThan(0);
      for (const [targetId, qs] of pool) {
        expect(qs.length, `${targetId} の問題が0`).toBeGreaterThan(20);
      }
    }
  });

  it('3つの観点すべてから問題が出る', () => {
    for (const lv of ['N5', 'N4'] as const) {
      const c = kanjiCoverage(lv);
      for (const t of ['kanji-onyomi', 'kanji-kunyomi', 'kanji-wordreading']) {
        expect(c.aspects[t], `${lv} の ${t} が0問`).toBeGreaterThan(20);
      }
    }
  });
});

describe('漢字の問題が「答えが透ける」形になっていない', () => {
  const scope = kanjiInScope('N4');
  const all = scope.flatMap((e, i) => kanjiQuestionsFor(e, scope, 20260818 + i * 31));

  it('全問が選択肢の機械検査を通っている', () => {
    // 生成器が kanjiReadingChoiceIssues を通していない問題を出していないか、出力側から再確認する
    const bad: string[] = [];
    for (const q of all) {
      const correct = q.choices.find((c) => c.isCorrect);
      const wrongs = q.choices.filter((c) => !c.isCorrect).map((c) => c.textJa);
      const issues = kanjiReadingChoiceIssues({
        aspect: q.type.replace('kanji-', '') as never,
        subject: q.targetJapanese ?? '', correct: correct!.textJa, wrongs,
      });
      if (issues.length > 0) bad.push(issues[0]);
    }
    expect(bad.slice(0, 5), `${bad.length}件`).toEqual([]);
  });

  it('選択肢がちょうど4つ・正解ちょうど1つ・重複なし', () => {
    for (const q of all) {
      expect(q.choices).toHaveLength(4);
      expect(q.choices.filter((c) => c.isCorrect)).toHaveLength(1);
      expect(new Set(q.choices.map((c) => c.textJa)).size).toBe(4);
    }
  });

  it('問われている字・語そのものに正解が書かれていない', () => {
    // 設問の言い回し（「〜の読み方はどれですか。」）は全問共通なので手がかりにならない。
    // 「読み方」の"み"が正解「み」と一致するような偶然の一致を漏れと数えないため、
    // 問題ごとに変わる部分＝**問われている字・語**だけを見る
    const leaked = all.filter((q) => {
      const correct = q.choices.find((c) => c.isCorrect)!.textJa;
      return (q.targetJapanese ?? '').includes(correct);
    });
    expect(leaked.map((q) => `${q.key}:${q.targetJapanese}→${q.choices.find((c) => c.isCorrect)!.textJa}`).slice(0, 5)).toEqual([]);
  });

  it('設問の言い回しが全問で同じ（言い回しの違いが手がかりにならない）', () => {
    const shapes = new Set(all.map((q) => (q.questionJa ?? '').replace(q.targetJapanese ?? '', '§')));
    expect([...shapes]).toEqual(['§ の読み方はどれですか。']);
  });

  it('中国語話者向けの注記は「答えたあと」にしか出さない', () => {
    // chineseNote / mnemonicZh は解説欄にだけ入れる契約。設問・選択肢に混ぜると答えが割れる
    expect([...KANJI_FIELDS_AFTER_ANSWER_ONLY]).toContain('chineseNote');
    for (const q of all.slice(0, 200)) {
      const e = ALL_KANJI.find((x) => x.entryId === q.sourceItemId);
      if (!e || !e.chineseNote) continue;
      expect((q.questionJa ?? '').includes(e.chineseNote)).toBe(false);
      expect(q.choices.some((c) => c.textJa.includes(e.chineseNote))).toBe(false);
    }
  });
});

describe('データそのものの健全性', () => {
  it('出題対象の字に重複が無い', () => {
    const chars = activeKanji(ALL_KANJI).map((e) => e.character);
    expect(new Set(chars).size, `重複: ${chars.filter((c, i) => chars.indexOf(c) !== i).join('・')}`).toBe(chars.length);
  });

  it('画数が現実的な範囲（1〜30画）', () => {
    for (const e of activeKanji(ALL_KANJI)) {
      expect(e.strokeCount, `${e.character} の画数`).toBeGreaterThanOrEqual(1);
      expect(e.strokeCount, `${e.character} の画数`).toBeLessThanOrEqual(30);
    }
  });

  it('中国語話者向けの注記が全字に入っている（この欄が一番の価値）', () => {
    const empty = activeKanji(ALL_KANJI).filter((e) => !e.chineseNote || e.chineseNote.length < 5);
    expect(empty.map((e) => e.character)).toEqual([]);
  });
});
