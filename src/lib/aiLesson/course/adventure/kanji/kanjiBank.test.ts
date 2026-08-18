// 漢字バンクの全件検査（2026-08-18 の「答えが透ける問題を作らない」監査で追加）。
//
// 漢字バンクは**まだどの生成器からも参照されていない**。だから今のうちに、
// 出題を作った瞬間に壊れる形のデータを潰しておく。監査で実際に見つかったのは3つ:
//   ① kanjiN5a（数・曜日・時間）と kanjiN5d（場所・自然）の50字が全部 state:'draft' のままで、
//      `activeKanji()` が0件を返していた。＝N5の基本50字が1問も出せない状態だった。
//   ② 「前」が kanjiN5b と kanjiN5c の両方に active で入っていた。
//      出題キー `kanji-<aspect>:<char>:<i>` は字がキーなので、mastery台帳・错题本のキーが衝突する。
//   ③ chineseNote / mnemonicZh が読みを平文で書いている（例語の読み170件・音訓176件）。
//      読みを問う問題でこの2欄を回答前に出すと、字を知らなくても注記を読むだけで解ける。
//      欄は薄くしない（中国人学習者に一番効く欄）。代わりに「回答後だけ」を規約として固定する。
import { describe, it, expect } from 'vitest';
import {
  activeKanji, kanjiEntryIssues, kanjiQuestionKey, displayReading, readingIndex,
  kanjiReadingChoiceIssues, KANJI_READING_ASPECTS, KANJI_FIELDS_AFTER_ANSWER_ONLY,
  type KanjiEntry,
} from './kanjiTypes';
import { KANJI_N5_A } from './kanjiN5a';
import { KANJI_N5_B } from './kanjiN5b';
import { KANJI_N5_C } from './kanjiN5c';
import { KANJI_N5_D } from './kanjiN5d';
import { KANJI_N4_A } from './kanjiN4a';
import { KANJI_N4_B } from './kanjiN4b';
import { KANJI_N4_C } from './kanjiN4c';
import { KANJI_N4_D } from './kanjiN4d';

const BATCHES: [string, KanjiEntry[]][] = [
  ['n5a', KANJI_N5_A], ['n5b', KANJI_N5_B], ['n5c', KANJI_N5_C], ['n5d', KANJI_N5_D],
  ['n4a', KANJI_N4_A], ['n4b', KANJI_N4_B], ['n4c', KANJI_N4_C], ['n4d', KANJI_N4_D],
];
const ALL = BATCHES.flatMap(([, es]) => es);
const ACTIVE = activeKanji(ALL);

describe('漢字バンクの状態', () => {
  it('**どのバッチも active_beta が0件でない**（draft のまま置き去りにしない）', () => {
    const empty = BATCHES.filter(([, es]) => activeKanji(es).length === 0).map(([n]) => n);
    expect(empty, `active_beta が0件のバッチ: ${empty.join(', ')}（promoteKanjiBatch を通し忘れている）`).toEqual([]);
  });

  // 字を増やすのは自由。**減らして検査を通すのを禁じる**ための下限
  //（2026-08-18 実測: 全220字・active 219字＝重複の「前」1字だけを外している）。
  it('字数が減っていない（下限: 全220字・active 219字）', () => {
    expect(ALL.length).toBeGreaterThanOrEqual(220);
    expect(ACTIVE.length).toBeGreaterThanOrEqual(219);
  });

  it('機械検査に落ちる active エントリが0件', () => {
    const bad = ACTIVE.filter((e) => kanjiEntryIssues(e).length > 0)
      .map((e) => `${e.character}: ${kanjiEntryIssues(e).join(' / ')}`);
    expect(bad).toEqual([]);
  });

  it('**active な字が重複しない**（出題キーは字がキーなので台帳が衝突する）', () => {
    const seen = new Map<string, string[]>();
    for (const e of ACTIVE) seen.set(e.character, [...(seen.get(e.character) ?? []), e.batchId]);
    const dup = [...seen.entries()].filter(([, bs]) => bs.length > 1);
    expect(
      dup.map(([c, bs]) => `${c}(${bs.join('/')}) → キー ${kanjiQuestionKey('onyomi', c, 0)} が衝突`),
    ).toEqual([]);
  });

  it('entryId が一意', () => {
    const ids = ALL.map((e) => e.entryId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('漢字から問題を作っても答えが透けない', () => {
  it('**注記は回答前に出せない**（読みを平文で書いているエントリが実在する）', () => {
    // ここは「注記から読みを消せ」という検査ではない。消すと注記の価値が無くなる。
    // 「読みが書いてある以上、回答前には出せない」という前提が生きていることを固定する検査。
    const revealing = ACTIVE.filter((e) => {
      const note = `${e.chineseNote}${e.mnemonicZh}`;
      return e.words.some((w) => note.includes(w.reading))
        || [...e.onyomi, ...e.kunyomi].some((r) => displayReading(r).length >= 2 && note.includes(displayReading(r)));
    });
    // 実測（2026-08-18）: 219字中172字。ここが0になったら注記が痩せている＝別の劣化。
    expect(revealing.length).toBeGreaterThan(100);
    expect(KANJI_FIELDS_AFTER_ANSWER_ONLY).toEqual(['chineseNote', 'mnemonicZh']);
  });

  it('**誤答を素朴に他の字から引くと二重正解になる**（生成器が readingIndex を通す必要がある）', () => {
    // シ＝四子紙仕試思始止使 のように、同じ読みを持つ字が実在する。
    // 「他の字の読みをそのまま誤答にする」実装は正解が2つある問題を作ってしまう。
    const shared = [...readingIndex(ACTIVE, 'onyomi').entries()].filter(([, cs]) => new Set(cs).size > 1);
    expect(shared.length, '音読みを共有する字が消えている（検査の前提が変わった）').toBeGreaterThan(20);
    // 二重正解は kanjiReadingChoiceIssues が捕まえる
    const [reading, chars] = shared[0];
    expect(kanjiReadingChoiceIssues({
      aspect: 'onyomi', subject: chars[0], correct: reading, wrongs: [reading, 'ホゲ', 'フガ'],
    })).toContainEqual(expect.stringContaining('誤答に正解と同じ読みがある'));
  });

  it('選択肢の「形」で当てられる組み合わせを弾く', () => {
    // ① カタカナ（音読み）とひらがな（訓読み）の混在
    expect(kanjiReadingChoiceIssues({
      aspect: 'onyomi', subject: '山', correct: 'サン', wrongs: ['やま', 'かわ', 'そら'],
    })).toContainEqual(expect.stringContaining('カタカナとひらがなが混ざっている'));
    // ② 送り仮名の「・」が1つだけ残っている
    expect(kanjiReadingChoiceIssues({
      aspect: 'kunyomi', subject: '高', correct: 'たか・い', wrongs: ['ひくい', 'ながい', 'みじかい'],
    })).toContainEqual(expect.stringContaining('「・」が残っている'));
    // ③ 長さが極端に不揃い（正解5かな vs 誤答1かな＝3.2倍超）
    expect(kanjiReadingChoiceIssues({
      aspect: 'wordreading', subject: '日曜日', correct: 'にちようび', wrongs: ['ひ', 'か', 'め'],
    })).toContainEqual(expect.stringContaining('かな数が不揃い'));
    // ④ そろっていれば通る
    expect(kanjiReadingChoiceIssues({
      aspect: 'kunyomi', subject: '高', correct: displayReading('たか・い'), wrongs: ['ひくい', 'ながい', 'みじかい'],
    })).toEqual([]);
  });

  it('okurigana 観点だけは「・」を残してよい（そこが問題の中身なので）', () => {
    const issues = kanjiReadingChoiceIssues({
      aspect: 'okurigana', subject: '高', correct: 'たか・い', wrongs: ['たかい・', 'た・かい', 'たかい'],
    });
    expect(issues.filter((m) => m.includes('「・」が残っている'))).toEqual([]);
  });

  it('読みを問う観点が3つ定義されている', () => {
    expect(KANJI_READING_ASPECTS).toEqual(['onyomi', 'kunyomi', 'wordreading']);
  });
});
