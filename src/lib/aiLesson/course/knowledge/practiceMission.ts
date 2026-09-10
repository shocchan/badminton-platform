/**
 * 文法の practice → AI会話ミッション（2026-09-10 Phase 6）。
 *
 * 文法の知識項目が既に持っている `practice`（テーマ・最初の一言・使う目的）と
 * `production`（期待する形）を、**既存の会話 runtime が読める Mission の形**にする。
 * 新しい会話 runtime は作らない。Mission の項目を埋めるだけ。
 *
 *   今日学んだ文法 → advconv-<grammarId> の会話 → report.targetUsage=self → conversation_success
 *
 * missionId の形:
 *   advconv-<grammarId>            … 文法の practice そのもの
 *   bizconv-<sceneId>:<grammarId>  … Business context の場面（Phase 5）で、その文法を使う
 * どちらも grammarId を含むので、会話の結果は knowledge へ戻せる（conversationKnowledge.grammarIdOfMission）。
 */
import type { Mission, MissionCategory } from '../types';
import type { BusinessScene } from './businessContext';

export interface PracticeSource {
  grammarId: string;
  pattern: string;
  reading?: string;
  level: string;
  meaningJa: string;
  explanationZh: string;
  nuance?: string;
  usageScene?: string;
  examplesJa: readonly string[];
  commonMistakesZh?: string;
  matchKeys?: readonly string[];
  production: { promptJa: string; promptZh: string; expected: readonly string[]; acceptable: readonly string[] };
  practice: { themeJa: string; starterJa: string; starterZh: string; targetUse: string };
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 期待する形・許容する形・照合キーから、発話判定の正規表現ソースを作る（2文字以上だけ） */
export const detectSourceFromKeys = (keys: readonly string[]): string => {
  const cleaned = keys.map((k) => k.replace(/[〜～\s]/g, '')).filter((k) => [...k].length >= 2);
  // て形は音便で「で」になる（読んでおく・遊んでしまう）。会話コースの detect と同じく両方を持つ
  const voiced = cleaned.filter((k) => k.startsWith('て')).map((k) => `で${k.slice(1)}`);
  const parts = [...new Set([...cleaned, ...voiced])]
    .sort((a, b) => [...b].length - [...a].length)
    .map(escapeRe);
  return parts.length > 0 ? parts.join('|') : '(?!)';
};

const difficultyOf = (level: string): Mission['difficulty'] =>
  level === 'N5' ? 1 : level === 'N4' ? 2 : level === 'N3' ? 3 : level === 'N2' ? 4 : 5;

const categoryOf = (level: string): MissionCategory => (level === 'N1' || level === 'N2') ? 'advanced' : 'workLife';

/** practice/production の中身から Mission の項目を埋める（共通部分） */
const baseMission = (d: PracticeSource, id: string, titleJa: string, titleZh: string, opening: string): Mission => {
  const keys = [...(d.matchKeys ?? []), ...d.production.expected, ...d.production.acceptable, d.pattern];
  const expected = d.production.expected[0] ?? d.pattern.replace(/[〜～]/g, '');
  return {
    id, week: 0, order: 0,
    titleJa, titleZh,
    category: categoryOf(d.level),
    difficulty: difficultyOf(d.level),
    targetExpression: d.pattern,
    targetExpressionReading: d.reading ?? d.pattern.replace(/[〜～]/g, ''),
    detect: detectSourceFromKeys(keys),
    meaningJa: d.meaningJa,
    meaningZh: d.explanationZh,
    usageNotesJa: d.nuance ?? d.usageScene ?? d.practice.targetUse,
    usageNotesZh: d.explanationZh,
    naturalExample: d.examplesJa[0] ?? expected,
    simpleExample: d.examplesJa[1] ?? d.examplesJa[0] ?? expected,
    commonMistakes: d.commonMistakesZh ? [d.commonMistakesZh] : [],
    openingQuestion: opening,
    followUpQuestions: [d.production.promptJa, `もう一度、「${d.pattern}」を使って言ってみてください。`],
    hintLevels: [
      `「${d.pattern}」を使って言ってみましょう。`,
      `使うのは「${d.pattern.replace(/[〜～]/g, '')}」です。`,
      `たとえば「${expected}」のような形です。`,
      `前半は「${expected.slice(0, Math.max(2, Math.floor([...expected].length / 2)))}…」`,
      `完成文：「${expected}」`,
      `「${expected}」と言ってみてください。`,
    ],
    chineseSupport: 'normal',
    correctionPriority: 'target',
    completionCriteria: `生徒が「${d.pattern}」を自分の文で1回使えたら完了。`,
    reviewPrompts: {
      day1: d.production.promptJa,
      day3: `別の場面で「${d.pattern}」を使ってみてください。`,
      day7: `「${d.pattern}」を使って、最近のことを話してください。`,
    },
    alternateScenes: [d.practice.themeJa],
    requiredPreviousItems: [],
    estimatedMinutes: 4,
    isPublished: true,
    curriculumVersion: 'adv-practice-2026-09-10',
  };
};

/** 文法の practice → Mission（advconv-<grammarId>） */
export const practiceMissionFromGrammar = (d: PracticeSource): Mission =>
  baseMission(d, `advconv-${d.grammarId}`, `今日の文法を使う：${d.practice.themeJa}`, `用今天的语法：${d.practice.starterZh}`, d.practice.starterJa);

/** Business の場面 × 文法 → Mission（bizconv-<sceneId>:<grammarId>） */
export const businessSceneMission = (scene: BusinessScene, d: PracticeSource): Mission =>
  baseMission(d, `bizconv-${scene.sceneId}:${d.grammarId}`, scene.titleJa, scene.titleZh, scene.starterJa);

/** 画面の場面一覧に出す形（AdvShell の convscenes と同じ項目） */
export interface PracticeSceneCard {
  id: string;
  titleJa: string;
  titleZh: string;
  targetExpression: string;
  /** 'grammar'＝今日の文法 / 'business'＝仕事の場面 */
  group: 'grammar' | 'business';
}

export const sceneCardOf = (m: Mission, group: PracticeSceneCard['group']): PracticeSceneCard =>
  ({ id: m.id, titleJa: m.titleJa, titleZh: m.titleZh, targetExpression: m.targetExpression, group });
