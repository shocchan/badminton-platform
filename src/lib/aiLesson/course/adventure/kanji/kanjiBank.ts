// 漢字バンクのruntime（2026-08-18 新設）。
//
// 読解・聴解と同じく、AdvBattleQuestion へ正規化してバトルの仕組みに載せる
// （未出判定・攻略台帳・選択肢の位置シャッフルを共有するため）。
//
// 出題は「読み」の3観点のみ。字形（shape）と日中差（contrast）は**解説として出す**もので、
// 4択にすると答えが透ける（chineseNote に答えが書いてある）ので問題化しない。
// KANJI_FIELDS_AFTER_ANSWER_ONLY がその契約を持っている。
import type { AdvBattleQuestion } from '../advVariants';
import { SECTION_OF_SKILL } from '../advExamSkills';
import {
  activeKanji, displayReading, kanjiQuestionKey, kanjiQuestionType, readingIndex,
  kanjiReadingChoiceIssues, KANJI_READING_ASPECTS,
  type KanjiAspect, type KanjiEntry, type KanjiReadingChoices,
} from './kanjiTypes';
import { KANJI_N5_A } from './kanjiN5a';
import { KANJI_N5_B } from './kanjiN5b';
import { KANJI_N5_C } from './kanjiN5c';
import { KANJI_N5_D } from './kanjiN5d';
import { KANJI_N5_E } from './kanjiN5e';
import { KANJI_N4_A } from './kanjiN4a';
import { KANJI_N4_B } from './kanjiN4b';
import { KANJI_N4_C } from './kanjiN4c';
import { KANJI_N4_D } from './kanjiN4d';

export type KanjiLevel = 'N5' | 'N4';

export const ALL_KANJI: KanjiEntry[] = [
  ...KANJI_N5_A, ...KANJI_N5_B, ...KANJI_N5_C, ...KANJI_N5_D,
  ...KANJI_N5_E,
  ...KANJI_N4_A, ...KANJI_N4_B, ...KANJI_N4_C, ...KANJI_N4_D,
];

/** 出題に使える字（draft や重複除外を落とす） */
export const kanjiFor = (level: KanjiLevel): KanjiEntry[] =>
  activeKanji(ALL_KANJI).filter((e) => e.level === level);

/** 目標レベルで学ぶ字（N4目標はN5も含む。土台を飛ばさない） */
export const kanjiInScope = (target: KanjiLevel): KanjiEntry[] =>
  target === 'N5' ? kanjiFor('N5') : [...kanjiFor('N5'), ...kanjiFor('N4')];

export const kanjiByCharacter = (ch: string): KanjiEntry | undefined =>
  ALL_KANJI.find((e) => e.character === ch);

const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
};

/**
 * 誤答は**同じ観点の実在する読み**から引く（作り物の読みを出さない）。
 * 同じ読みを持つ字は除く（誤答が実は正解になるため）。
 */
const pickWrongs = (
  correct: string, pool: string[], seed: number,
): string[] => {
  const r = rng(seed);
  const cand = [...new Set(pool)].filter((x) => x !== correct);
  const out: string[] = [];
  let guard = 0;
  while (out.length < 3 && cand.length > 0 && guard < 500) {
    guard += 1;
    const x = cand[Math.floor(r() * cand.length)];
    if (!out.includes(x)) out.push(x);
  }
  return out;
};

const toQuestion = (
  e: KanjiEntry, aspect: KanjiAspect, index: number,
  subjectJa: string, promptZh: string, correct: string, wrongs: string[],
): AdvBattleQuestion | null => {
  const check: KanjiReadingChoices = { aspect, subject: subjectJa, correct, wrongs };
  // 「答えが透ける」形は**出さない**（存在するふりをしない・原則13）
  if (kanjiReadingChoiceIssues(check).length > 0) return null;

  const texts = [correct, ...wrongs];
  return {
    key: kanjiQuestionKey(aspect, e.character, index),
    type: kanjiQuestionType(aspect),
    level: 'foundation',
    skill: 'charactersVocabulary',
    examSection: SECTION_OF_SKILL.charactersVocabulary,
    targetJapanese: subjectJa,
    questionJa: `${subjectJa} の読み方はどれですか。`,
    questionZh: promptZh,
    choices: texts.map((t, i) => ({
      choiceId: `choice-${String.fromCharCode(97 + i)}`,
      textJa: t,
      isCorrect: i === 0,
      whyWrongJa: i === 0 ? undefined : `「${t}」は別の字・別の語の読みです。`,
      whyWrongZh: i === 0 ? undefined : `「${t}」是别的字或别的词的读音。`,
    })),
    explanation: {
      meaningJa: `${e.character}（${e.strokeCount}画・部首は${e.radical.form}「${e.radical.readingJa}」）`,
      meaningZh: e.meaningZh,
      whyCorrectJa: `${subjectJa} は「${correct}」と読みます。`,
      whyCorrectZh: e.chineseNote,       // 中国語話者向けの注意は**答えたあと**に出す
      exampleJa: e.words.map((w) => `${w.surface}（${w.reading}）`).join('・'),
      exampleZh: e.mnemonicZh,
      sourceItemId: e.entryId,
      sourceLabel: '漢字',
    },
    sourceItemId: e.entryId,
    difficulty: e.level === 'N5' ? 1 : 2,
    timed: false,
    variantId: `${e.entryId}-${aspect}-${index}`,
    reviewState: 'validated_beta',
    status: 'validated_beta',
  };
};

/** その字から作れる読み問題を全部作る（作れないものは黙って落とす） */
export const kanjiQuestionsFor = (e: KanjiEntry, all: KanjiEntry[], seed: number): AdvBattleQuestion[] => {
  const out: AdvBattleQuestion[] = [];
  const idx = (a: KanjiAspect) => [...readingIndex(all, a).keys()];

  e.onyomi.forEach((raw, i) => {
    const correct = displayReading(raw);
    const wrongs = pickWrongs(correct, idx('onyomi'), seed + i * 7 + 1);
    const q = toQuestion(e, 'onyomi', i, e.character,
      `「${e.character}」的音读是哪个？`, correct, wrongs);
    if (q) out.push(q);
  });

  e.kunyomi.forEach((raw, i) => {
    const correct = displayReading(raw);
    const wrongs = pickWrongs(correct, idx('kunyomi'), seed + i * 11 + 2);
    const q = toQuestion(e, 'kunyomi', i, e.character,
      `「${e.character}」的训读是哪个？`, correct, wrongs);
    if (q) out.push(q);
  });

  e.words.forEach((w, i) => {
    const wrongs = pickWrongs(w.reading, idx('wordreading'), seed + i * 13 + 3);
    const q = toQuestion(e, 'wordreading', i, w.surface,
      `「${w.surface}」怎么读？`, w.reading, wrongs);
    if (q) out.push(q);
  });
  return out;
};

/** targetId → 問題 のプール（バトルセレクタへ渡す形）。targetId は `kanji-n5` / `kanji-n4` */
export const kanjiPool = (target: KanjiLevel): Map<string, AdvBattleQuestion[]> => {
  const scope = kanjiInScope(target);
  const map = new Map<string, AdvBattleQuestion[]>();
  scope.forEach((e, i) => {
    const targetId = `kanji-${e.level.toLowerCase()}`;
    const list = map.get(targetId) ?? [];
    list.push(...kanjiQuestionsFor(e, scope, 20260818 + i * 31));
    map.set(targetId, list);
  });
  return map;
};

export const kanjiTargetIds = (target: KanjiLevel): string[] => [...kanjiPool(target).keys()];

export interface KanjiCoverage {
  level: KanjiLevel;
  characters: number;
  questions: number;
  aspects: Record<string, number>;
}

export const kanjiCoverage = (level: KanjiLevel): KanjiCoverage => {
  const scope = kanjiInScope(level);
  const qs = kanjiFor(level).flatMap((e, i) => kanjiQuestionsFor(e, scope, 20260818 + i * 31));
  const aspects: Record<string, number> = {};
  for (const q of qs) aspects[q.type] = (aspects[q.type] ?? 0) + 1;
  return { level, characters: kanjiFor(level).length, questions: qs.length, aspects };
};

export { KANJI_READING_ASPECTS };
export type { KanjiEntry };
