// 読解bankのruntime（COMPLETION §6）。
// バトルと同じ AdvBattleQuestion へ正規化して、未出判定・mastery台帳・位置シャッフルを共有する。
import type { AdvBattleQuestion } from '../advVariants';
import { SECTION_OF_SKILL } from '../advExamSkills';
import { N2_READING_SETS } from './n2ReadingSets';
import { N3_READING_SETS } from './n3ReadingSets';
import { READING_TYPE_LABELS, readingKeyOf, type ReadingSet, type ReadingType } from './readingTypes';

export { READING_TYPE_LABELS, readingKeyOf };
export type { ReadingSet, ReadingType };

export const ALL_READING_SETS: ReadingSet[] = [...N3_READING_SETS, ...N2_READING_SETS];

export const readingSetsFor = (level: 'N2' | 'N3'): ReadingSet[] =>
  ALL_READING_SETS.filter((s) => s.sourceLevel === level);

export const readingSetById = (setId: string): ReadingSet | undefined =>
  ALL_READING_SETS.find((s) => s.setId === setId);

/** 読解セット → バトル問題（本文は targetJapanese に載せて runner が表示する） */
export const readingToQuestion = (s: ReadingSet): AdvBattleQuestion => ({
  key: readingKeyOf(s),
  type: `read-${s.readingType}`,
  level: s.sourceLevel === 'N2' ? 'n2' : 'n3',
  skill: 'reading',
  examSection: SECTION_OF_SKILL.reading,
  targetJapanese: s.passageJa,
  questionJa: s.questionJa,
  questionZh: s.questionZh,
  choices: s.choices.map((c) => ({
    choiceId: c.choiceId,
    textJa: c.textJa,
    isCorrect: c.isCorrect,
    whyWrongJa: c.whyWrongJa,
    whyWrongZh: c.whyWrongZh,
  })),
  explanation: {
    meaningJa: s.explanationJa,
    meaningZh: s.explanationZh,
    whyCorrectJa: s.explanationJa,
    whyCorrectZh: s.explanationZh,
    exampleJa: s.rationaleSpan,
    exampleZh: null,
    sourceItemId: s.setId,
    sourceLabel: READING_TYPE_LABELS[s.readingType].ja,
  },
  sourceItemId: s.setId,
  difficulty: s.difficulty,
  timed: false,
  variantId: s.variantId,
  reviewState: s.reviewState,
  status: s.reviewState === 'authored' ? 'authored' : 'validated_beta',
});

/** targetId → 問題 のプール（バトルセレクタへ渡す形） */
export const readingPool = (level: 'N2' | 'N3'): Map<string, AdvBattleQuestion[]> => {
  const map = new Map<string, AdvBattleQuestion[]>();
  for (const s of readingSetsFor(level)) {
    const target = `read-${s.sourceLevel.toLowerCase()}-${s.readingType}`;
    const list = map.get(target) ?? [];
    list.push(readingToQuestion(s));
    map.set(target, list);
  }
  return map;
};

/** 読解のターゲットID一覧（Today Adventure / 模試の出題対象に使う） */
export const readingTargetIds = (level: 'N2' | 'N3'): string[] => [...readingPool(level).keys()];

export interface ReadingCoverage {
  level: 'N2' | 'N3';
  total: number;
  byType: Record<string, number>;
  typesBelowMinimum: string[];
  pass: boolean;
}

/** Pilot最低coverage（各主要type 6セット以上・合計30セット以上） */
export const readingCoverage = (level: 'N2' | 'N3'): ReadingCoverage => {
  const sets = readingSetsFor(level);
  const byType: Record<string, number> = {};
  for (const s of sets) byType[s.readingType] = (byType[s.readingType] ?? 0) + 1;
  const typesBelowMinimum = Object.entries(byType).filter(([, n]) => n < 6).map(([t]) => t);
  return {
    level, total: sets.length, byType, typesBelowMinimum,
    pass: sets.length >= 30 && typesBelowMinimum.length === 0,
  };
};
