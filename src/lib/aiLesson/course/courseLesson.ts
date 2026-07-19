// レッスン実行に関わる純ヘルパー（voiceペイロード生成・使用判定・XP・コスト）

import { DIFFICULTY_GUIDE } from './courseConfig';
import { estimateSessionCost } from './courseStats';
import type { LessonPlanStep, Learner, Mission } from './types';
import type { VoicePlanPayload } from '../voiceSession';

/** ミッション＋生徒設定＋難易度 → Edge Function へ渡す voice ペイロード */
export const buildVoicePayload = (
  mission: Mission,
  learner: Learner,
  step: LessonPlanStep,
): VoicePlanPayload & Record<string, unknown> => ({
  themeLabel: mission.titleJa,
  estimatedLevel: learner.estimatedLevel,
  zhSupport: learner.settings.zhSupport,
  correction: learner.settings.correction,
  target: {
    label: mission.targetExpression,
    example: mission.naturalExample,
    zhMeaning: mission.meaningZh,
    zhExample: mission.simpleExample,
  },
  // コース拡張フィールド（token関数が解釈）
  difficultyGuide: DIFFICULTY_GUIDE[learner.difficultyLevel]?.promptJa ?? '',
  lessonKind: step.kind,
  hideTarget: step.hideTarget,
  usageNotes: mission.usageNotesJa,
  commonMistakes: mission.commonMistakes.join(' / '),
  reviewPrompt:
    step.kind === 'review_day1' ? mission.reviewPrompts.day1
      : step.kind === 'review_day3' ? mission.reviewPrompts.day3
        : step.kind === 'review_day7' || step.kind === 'review_day30' ? mission.reviewPrompts.day7 : '',
  // 週間総合実践: その週の2〜4表現を会話の中で自然に使わせる（名前は先に見せない）
  weeklyTargets: (step.weeklyTargets ?? [])
    .map((m) => `${m.targetExpression}|${m.detect}`)
    .join('///'),
});

export interface ConversationTurn { role: 'student' | 'tutor'; text: string }

/**
 * 会話ログから目標表現の使用を保守的に判定する。
 * - 生徒の発話に検出パターンが出た回数
 * - 直前にゆい先生が同じ表現を言っていたら hint 扱い（お手本/復唱の直後）
 */
export const detectTargetUsage = (
  turns: ConversationTurn[],
  detectSource: string,
): { usage: 'self' | 'hint' | 'none'; count: number } => {
  let detect: RegExp;
  try { detect = new RegExp(detectSource); } catch { return { usage: 'none', count: 0 }; }
  let usage: 'self' | 'hint' | 'none' = 'none';
  let count = 0;
  let lastTutor = '';
  for (const t of turns) {
    if (t.role === 'tutor') { lastTutor = t.text; continue; }
    if (detect.test(t.text)) {
      count += 1;
      const here: 'self' | 'hint' = detect.test(lastTutor) ? 'hint' : 'self';
      if (usage !== 'self') usage = here;
    }
  }
  return { usage, count };
};

export const XP = {
  lessonComplete: 10,
  understood: 5,
  usedWithHint: 8,
  usedSelf: 12,
  reviewSuccess: 10,
  streakBonusMax: 5,
} as const;

export const calcLessonXp = (
  usage: 'self' | 'hint' | 'none',
  isReview: boolean,
  reviewSucceeded: boolean,
  streakDays: number,
): { earned: number; breakdown: { key: string; xp: number }[] } => {
  const breakdown: { key: string; xp: number }[] = [{ key: 'lessonComplete', xp: XP.lessonComplete }];
  if (usage === 'self') breakdown.push({ key: 'usedSelf', xp: XP.usedSelf });
  else if (usage === 'hint') breakdown.push({ key: 'usedWithHint', xp: XP.usedWithHint });
  else breakdown.push({ key: 'understood', xp: XP.understood });
  if (isReview && reviewSucceeded) breakdown.push({ key: 'reviewSuccess', xp: XP.reviewSuccess });
  const streakBonus = Math.min(Math.max(streakDays - 1, 0), XP.streakBonusMax);
  if (streakBonus > 0) breakdown.push({ key: 'streakBonus', xp: streakBonus });
  return { earned: breakdown.reduce((s, b) => s + b.xp, 0), breakdown };
};

export { estimateSessionCost };
