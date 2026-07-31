// 今日の冒険の生成（§13）。第一CTAは常に一つ。
// 優先順位: ①期限切れ/当日復習 ②最大の弱点 ③試験日残 ④未習得の目標教材 ⑤会話転用 ⑥多様性 ⑦前日重複回避。
// 生成結果は必ず why / 所要 / 対象能力 / 対象表現 / 成功条件 / 次の一歩 を持つ。
import type {
  AdvGoalType, AdvQuestStep, AdvRoute, AdvRouteStage, AdvSkill, AdvTodayQuest, AdventureV2Profile,
} from './advTypes';
import { seededShuffle } from './advDiagnosis';
import { currentStageOf } from './advRoute';
import { masteredStageIds } from './advMastery';

export interface QuestContentAvailability {
  /** stage内で未攻略のgrammarId（学習順） */
  nextGrammarIds: string[];
  /** stage内で未攻略のunitId */
  nextUnitIds: string[];
  /** 今日の対象にできる会話テーマ（targetUse表現つき） */
  conversationTargets: { refId: string; expression: string; themeJa: string; themeZh: string }[];
}

export interface GenerateQuestInput {
  profile: AdventureV2Profile;
  route: AdvRoute;
  dueReviewCount: number;
  weakGrammarIds: string[];
  dateKey: string;
  nowISO: string;
  availability: QuestContentAvailability;
  /** 試験日までの残日数（examDate未設定は null） */
  daysToExam: number | null;
}

const est = (kind: AdvQuestStep['kind']): number =>
  kind === 'review_due' ? 3
  : kind === 'weak_reinforce' ? 4
  : kind === 'grammar_new' ? 5
  : kind === 'vocab_new' ? 4
  : kind === 'battle' ? 6
  : kind === 'reading_short' ? 5
  : kind === 'conversation_mission' ? 4
  : 2; // restate

const step = (
  kind: AdvQuestStep['kind'], refIds: string[], titleJa: string, titleZh: string,
  tier?: AdvQuestStep['tier'],
): AdvQuestStep => ({ kind, refIds, titleJa, titleZh, estMinutes: est(kind), tier });

/** stageに応じた新規学習ステップ（±会話転用） */
const stageSteps = (
  stage: AdvRouteStage, avail: QuestContentAvailability, seed: number,
): { learn: AdvQuestStep | null; battle: AdvQuestStep | null; conv: AdvQuestStep | null; expressions: string[] } => {
  const g = avail.nextGrammarIds[0];
  const u = avail.nextUnitIds[0];
  const convPick = seededShuffle(avail.conversationTargets, seed)[0] ?? null;
  const isConvStage = stage.kind === 'conversation_start' || stage.kind === 'conversation_growth';

  if (isConvStage) {
    return {
      learn: convPick ? step('vocab_new', [convPick.refId], `表現の準備：${convPick.expression}`, `准备表达：${convPick.expression}`) : null,
      battle: null,
      conv: convPick
        ? step('conversation_mission', [convPick.refId], `AI会話：${convPick.themeJa}`, `AI会话：${convPick.themeZh}`)
        : step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务'),
      expressions: convPick ? [convPick.expression] : [],
    };
  }
  const learn = g
    ? step('grammar_new', [g], '新しい文法を学ぶ', '学习新语法')
    : u ? step('vocab_new', [u], '単元のことばを学ぶ', '学习单元词汇') : null;
  const battleRef = g ?? u ?? stage.stageId;
  return {
    learn,
    battle: step('battle', [battleRef], '問題バトル', '问题战斗', 'normal'),
    conv: convPick
      ? step('conversation_mission', [convPick.refId, ...(g ? [g] : [])], `AI会話で使う：${convPick.themeJa}`, `在AI会话中使用：${convPick.themeZh}`)
      : null,
    expressions: convPick ? [convPick.expression] : [],
  };
};

/**
 * 今日の冒険を生成する（決定的: dateKey+profileでseed固定）。
 * dailyMinutes 5/15/30 で構成が変わる（§13の時間別テンプレに準拠しつつ固定メニュー化を避ける）。
 */
export const generateTodayQuest = (input: GenerateQuestInput): AdvTodayQuest => {
  const { profile, route, dueReviewCount, weakGrammarIds, dateKey, availability, daysToExam } = input;
  const minutes = profile.dailyMinutes ?? 15;
  const goalType: AdvGoalType = profile.goalType ?? 'jlpt';
  const seed = [...`${dateKey}:${profile.targetJlpt ?? goalType}`].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

  const done = masteredStageIds(profile.mastery, route.stages.map((s) => s.stageId), input.nowISO);
  const stage = currentStageOf(route, done) ?? route.stages[route.stages.length - 1];
  const parts = stageSteps(stage, availability, seed);

  // 前日と同じ主対象を避ける（§13⑦）。避けられない場合はそのまま（コンテンツが1つしか無いとき）
  const lastTargets = new Set(profile.lastQuest?.dateKey === prevDateKey(dateKey) ? profile.lastQuest.primaryTargets : []);
  if (parts.learn && parts.learn.refIds.every((r) => lastTargets.has(r)) && availability.nextGrammarIds.length > 1) {
    const alt = availability.nextGrammarIds.find((g) => !lastTargets.has(g));
    if (alt) parts.learn = { ...parts.learn, refIds: [alt] };
  }

  const steps: AdvQuestStep[] = [];
  const push = (s: AdvQuestStep | null | undefined) => { if (s) steps.push(s); };

  // ① 復習は常に先頭（期限切れ/当日分がある場合）
  if (dueReviewCount > 0) push(step('review_due', [], `復習 ${Math.min(dueReviewCount, 9)}件`, `复习 ${Math.min(dueReviewCount, 9)}项`));

  if (minutes === 5) {
    // 5分: 復習＋弱点1つ or 新規のどちらか＋ミニ会話（会話goalのみ）
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 1), '弱点を1つつぶす', '攻克1个弱点'));
    else push(parts.learn);
    if (goalType !== 'jlpt') push(parts.conv);
  } else if (minutes === 15) {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 2), '弱点補強', '弱点补强'));
    push(parts.learn);
    push(parts.battle);
    if (goalType !== 'jlpt' || parts.expressions.length > 0) push(parts.conv);
    push(step('restate', [], '言い直し', '改口练习'));
  } else {
    if (weakGrammarIds.length > 0) push(step('weak_reinforce', weakGrammarIds.slice(0, 3), '弱点補強', '弱点补强'));
    push(parts.learn);
    push(parts.battle);
    // 試験が近い（45日未満）なら読解/混合を足す（§13③）
    if (goalType !== 'conversation' && daysToExam !== null && daysToExam < 45) {
      push(step('reading_short', [stage.stageId], '短文読解', '短文阅读'));
    }
    push(parts.conv);
    push(step('restate', [], '言い直し', '改口练习'));
  }

  // 空クエスト防止: 最低1ステップ（コンテンツ枯渇時は復習/会話へ）
  if (steps.length === 0) push(step('conversation_mission', [stage.areaId], 'AI会話ミッション', 'AI会话任务'));

  const estimatedMinutes = steps.reduce((n, s) => n + s.estMinutes, 0);
  const targetSkills: AdvSkill[] = stage.kind === 'conversation_start' || stage.kind === 'conversation_growth'
    ? ['conversation', 'vocabulary']
    : goalType === 'hybrid' ? ['grammar', 'conversation'] : ['grammar', 'vocabulary'];

  const why = buildWhy(goalType, stage, dueReviewCount, weakGrammarIds.length, daysToExam);

  return {
    questId: `quest-${dateKey}`,
    dateKey,
    goalType,
    primaryTargets: [...new Set(steps.flatMap((s) => s.refIds))].slice(0, 4),
    steps,
    whyJa: why.ja, whyZh: why.zh,
    estimatedMinutes,
    targetSkills,
    targetExpressions: parts.expressions,
    successConditionJa: parts.battle ? 'バトルで80%以上、会話で今日の表現を1回使う' : '今日の表現を会話で1回使う',
    successConditionZh: parts.battle ? '战斗拿到80%以上，并在会话中用一次今天的表达' : '在会话中用一次今天的表达',
    nextStepJa: '明日は今日の復習から始まります',
    nextStepZh: '明天从复习今天的内容开始',
  };
};

const prevDateKey = (dateKey: string): string => {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const buildWhy = (
  goal: AdvGoalType, stage: AdvRouteStage, due: number, weak: number, daysToExam: number | null,
): { ja: string; zh: string } => {
  const bits: string[] = [];
  const bitsZh: string[] = [];
  if (due > 0) { bits.push('忘れる前の復習が最優先'); bitsZh.push('优先在遗忘前复习'); }
  if (weak > 0) { bits.push('直近の誤答を先につぶす'); bitsZh.push('先攻克最近的错题'); }
  bits.push(`現在地「${stage.titleJa}」を進める`);
  bitsZh.push(`推进当前位置「${stage.titleZh}」`);
  if (goal !== 'conversation' && daysToExam !== null) {
    bits.push(`試験まで${daysToExam}日`); bitsZh.push(`距离考试${daysToExam}天`);
  }
  return { ja: bits.join('。') + '。', zh: bitsZh.join('。') + '。' };
};
