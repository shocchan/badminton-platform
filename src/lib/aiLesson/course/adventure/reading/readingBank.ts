// 読解bankのruntime（COMPLETION §6）。
// バトルと同じ AdvBattleQuestion へ正規化して、未出判定・mastery台帳・位置シャッフルを共有する。
import type { AdvBattleQuestion } from '../advVariants';
import { SECTION_OF_SKILL } from '../advExamSkills';
import { N2_READING_SETS } from './n2ReadingSets';
import { N3_READING_SETS } from './n3ReadingSets';
// 拡張バッチ（FINAL COMPLETION §13）。type別にファイルを分けて増やしていく
import { N3_READING_SHORT_B } from './n3ReadingShortB';
import { N3_READING_MID_B } from './n3ReadingMidB';
import { N3_READING_LONG_B } from './n3ReadingLongB';
import { N3_READING_INFO_B } from './n3ReadingInfoB';
import { N3_READING_KEY_B } from './n3ReadingKeyB';
import { N2_READING_SHORT_B } from './n2ReadingShortB';
import { N2_READING_MID_B } from './n2ReadingMidB';
import { N2_READING_INT_B } from './n2ReadingIntB';
import { N2_READING_THEME_B } from './n2ReadingThemeB';
import { N2_READING_INFO_B } from './n2ReadingInfoB';
// N5/N4（2026-08-18 追加）。目標レベルにN5/N4を解禁したのに読解が0本だったため
import { N5_READING_SHORT_A } from './n5ReadingShortA';
import { N5_READING_SHORT_B } from './n5ReadingShortB';
import { N4_READING_INFO_B } from './n4ReadingInfoB';
import { N4_READING_KEY_B } from './n4ReadingKeyB';
import { N4_READING_MID_B } from './n4ReadingMidB';
import { N4_READING_SHORT_B } from './n4ReadingShortB';
import { N5_READING_INFO_B } from './n5ReadingInfoB';
import { N5_READING_KEY_B } from './n5ReadingKeyB';
import { N5_READING_MID_B } from './n5ReadingMidB';
import { N5_READING_INFO_A } from './n5ReadingInfoA';
import { N5_READING_KEY_A } from './n5ReadingKeyA';
import { N5_READING_MID_A } from './n5ReadingMidA';
import { N4_READING_SHORT_A } from './n4ReadingShortA';
import { N4_READING_INFO_A } from './n4ReadingInfoA';
import { N4_READING_KEY_A } from './n4ReadingKeyA';
import { N4_READING_MID_A } from './n4ReadingMidA';
import { READING_TYPE_LABELS, readingKeyOf, type ReadingSet, type ReadingType, type ReadingLevel } from './readingTypes';

export { READING_TYPE_LABELS, readingKeyOf };
export type { ReadingSet, ReadingType, ReadingLevel };

export const ALL_READING_SETS: ReadingSet[] = [
  ...N5_READING_SHORT_A,
  ...N5_READING_SHORT_B,
  ...N5_READING_INFO_B,
  ...N5_READING_KEY_B,
  ...N5_READING_MID_B, ...N5_READING_INFO_A, ...N5_READING_KEY_A, ...N5_READING_MID_A,
  ...N4_READING_SHORT_A,
  ...N4_READING_SHORT_B,
  ...N4_READING_MID_B,
  ...N4_READING_KEY_B,
  ...N4_READING_INFO_B, ...N4_READING_INFO_A, ...N4_READING_KEY_A, ...N4_READING_MID_A,
  ...N3_READING_SETS,
  ...N3_READING_SHORT_B, ...N3_READING_MID_B, ...N3_READING_LONG_B,
  ...N3_READING_INFO_B, ...N3_READING_KEY_B,
  ...N2_READING_SETS,
  ...N2_READING_SHORT_B, ...N2_READING_MID_B, ...N2_READING_INT_B,
  ...N2_READING_THEME_B, ...N2_READING_INFO_B,
];

export const readingSetsFor = (level: ReadingLevel): ReadingSet[] =>
  ALL_READING_SETS.filter((s) => s.sourceLevel === level);

export const readingSetById = (setId: string): ReadingSet | undefined =>
  ALL_READING_SETS.find((s) => s.setId === setId);

/** 読解セット → バトル問題（本文は targetJapanese に載せて runner が表示する） */
export const readingToQuestion = (s: ReadingSet): AdvBattleQuestion => ({
  key: readingKeyOf(s),
  type: `read-${s.readingType}`,
  // N5/N4 は基礎帯の問題として扱う（AdvBattleQuestion.level は foundation/n3/n2 の3値）
  level: s.sourceLevel === 'N2' ? 'n2' : s.sourceLevel === 'N3' ? 'n3' : 'foundation',
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
export const readingPool = (level: ReadingLevel): Map<string, AdvBattleQuestion[]> => {
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
export const readingTargetIds = (level: ReadingLevel): string[] => [...readingPool(level).keys()];

export interface ReadingCoverage {
  level: ReadingLevel;
  total: number;
  byType: Record<string, number>;
  typesBelowMinimum: string[];
  pass: boolean;
}

/** Pilot最低coverage（各主要type 6セット以上・合計30セット以上） */
export const readingCoverage = (level: ReadingLevel): ReadingCoverage => {
  const sets = readingSetsFor(level);
  const byType: Record<string, number> = {};
  for (const s of sets) byType[s.readingType] = (byType[s.readingType] ?? 0) + 1;
  const typesBelowMinimum = Object.entries(byType).filter(([, n]) => n < 6).map(([t]) => t);
  return {
    level, total: sets.length, byType, typesBelowMinimum,
    pass: sets.length >= 30 && typesBelowMinimum.length === 0,
  };
};
