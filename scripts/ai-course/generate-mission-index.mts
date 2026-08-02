// 会話カリキュラムの「目次」を生成する（P0: 会話教材のclient bundle除去）。
//
// courseData.ts（60ミッションの教材本体）から、**メタデータだけ**を抜いた
// courseMissionIndex.generated.ts を作る。client はこの目次だけを bundle し、
// 本文（例文・ヒント6段階・導入質問・誤用集・復習プロンプト）はレッスン開始時に
// サーバーから現在ミッションぶんだけ受け取る。
//
// 目次に残すもの＝鍵付きステージの「身につく力」表示と同等のメタデータ:
//   id / week / order / タイトル / category / difficulty /
//   目標表現とその読み・検出パターン・一行gloss（言い直し・導入カードの表示に必要）
//
//   npx vite-node scripts/ai-course/generate-mission-index.mts

import { writeFileSync } from 'node:fs';
import { COURSE_MISSIONS, COURSE_WEEKS } from '../../src/lib/aiLesson/course/courseData';
import type { Mission } from '../../src/lib/aiLesson/course/types';

/** 本文フィールドを空にした Mission（型はそのまま＝呼び出し側の改修を最小にする） */
const toMeta = (m: Mission): Mission => ({
  id: m.id,
  week: m.week,
  order: m.order,
  titleJa: m.titleJa,
  titleZh: m.titleZh,
  category: m.category,
  difficulty: m.difficulty,
  targetExpression: m.targetExpression,
  targetExpressionReading: m.targetExpressionReading,
  detect: m.detect,
  meaningJa: m.meaningJa,
  meaningZh: m.meaningZh,
  chineseSupport: m.chineseSupport,
  correctionPriority: m.correctionPriority,
  requiredPreviousItems: m.requiredPreviousItems,
  estimatedMinutes: m.estimatedMinutes,
  isPublished: m.isPublished,
  curriculumVersion: m.curriculumVersion,
  // ── ここから本文。目次には入れない（サーバーがレッスン開始時に返す） ──
  usageNotesJa: '',
  usageNotesZh: '',
  naturalExample: '',
  simpleExample: '',
  commonMistakes: [],
  openingQuestion: '',
  followUpQuestions: [],
  hintLevels: [],
  completionCriteria: '',
  reviewPrompts: { day1: '', day3: '', day7: '' },
  alternateScenes: [],
});

const header = `// 自動生成（scripts/ai-course/generate-mission-index.mts）。**手で編集しない。**
//
// 会話カリキュラムの目次。本文フィールドは意図的に空（''/[]）で、
// レッスン開始時に /api/ai-course/activity/start {activity:'conversation'} が
// 現在ミッションの本文だけを返す（P0: 教材のclient bundle除去）。
// 目次の同期は courseMissionIndex.test.ts が検査する。
import type { CourseWeek, Mission } from './types';

`;

const body =
  `export const COURSE_WEEKS: CourseWeek[] = ${JSON.stringify(COURSE_WEEKS, null, 2)};\n\n` +
  `export const COURSE_MISSIONS: Mission[] = ${JSON.stringify(COURSE_MISSIONS.map(toMeta), null, 2)};\n`;

writeFileSync('src/lib/aiLesson/course/courseMissionIndex.generated.ts', header + body);
console.log(`✅ courseMissionIndex.generated.ts を生成（${COURSE_MISSIONS.length}ミッション・本文なし）`);
