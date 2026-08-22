// ミッション定義の入力型と、Mission への組み立て。
// courseData.ts（基礎60本）と courseDataAdvanced.ts（上級30本）の両方から使うので、
// 双方向importにならないようここへ切り出した（2026-08-23）。
import type { Mission, MissionCategory } from './types';

export const CURRICULUM_VERSION = 'v1';

/** ミッション定義の入力（必須項目のみ。残りは makeMission がデフォルト補完） */
export interface MissionInput {
  week: number;
  order: number;
  titleJa: string;
  titleZh: string;
  category: MissionCategory;
  difficulty: 1 | 2 | 3 | 4 | 5;
  target: string;
  reading: string;
  detect: string;
  meaningJa: string;
  meaningZh: string;
  usageJa: string;
  usageZh: string;
  natural: string;
  simple: string;
  mistakes: string[];
  opening: string;
  followUps: string[];
  hints: string[];
  scenes: string[];
  chineseSupport?: 'minimal' | 'normal' | 'rich';
  correctionPriority?: 'meaning' | 'target' | 'both';
  requires?: string[];
}

export const makeMission = (m: MissionInput): Mission => ({
  id: `w${String(m.week).padStart(2, '0')}m${m.order}`,
  week: m.week,
  order: m.order,
  titleJa: m.titleJa,
  titleZh: m.titleZh,
  category: m.category,
  difficulty: m.difficulty,
  targetExpression: m.target,
  targetExpressionReading: m.reading,
  detect: m.detect,
  meaningJa: m.meaningJa,
  meaningZh: m.meaningZh,
  usageNotesJa: m.usageJa,
  usageNotesZh: m.usageZh,
  naturalExample: m.natural,
  simpleExample: m.simple,
  commonMistakes: m.mistakes,
  openingQuestion: m.opening,
  followUpQuestions: m.followUps,
  hintLevels: m.hints,
  chineseSupport: m.chineseSupport ?? 'normal',
  correctionPriority: m.correctionPriority ?? 'both',
  completionCriteria: `生徒が「${m.target}」を最低1回、自分の言葉で（または復唱で）使えたら完了。`,
  reviewPrompts: {
    day1: `「${m.target}」の意味をもう一度確認し、文の一部を補完させ、短く復唱させる。`,
    day3: `「${m.target}」を別の場面（${m.scenes[0] ?? 'ちがう話題'}）で使わせる。ヒントは減らす。`,
    day7: `自由な会話の中で「${m.target}」を自力で使えるか確認する。表現名は先に見せない。`,
  },
  alternateScenes: m.scenes,
  requiredPreviousItems: m.requires ?? [],
  estimatedMinutes: 3,
  isPublished: true,
  curriculumVersion: CURRICULUM_VERSION,
});

