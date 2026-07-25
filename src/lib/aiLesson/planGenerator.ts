// ヒアリング回答 → 個別学習プランのルールベース生成
// AIは使わない（決定的・説明可能・オフラインで動く）。プロンプト設計の土台にもなる。

import type { HearingAnswers, LearningPlan, TargetExpression } from './types';

/** 推定レベル（表示用ラベルは ja/zh 共通で通じる「N表記」を使う） */
const estimateLevel = (a: HearingAnswers): string => {
  switch (a.level) {
    case 'belowN4': return 'N5〜N4';
    case 'n4': return 'N4';
    case 'n3': return 'N3';
    case 'n2': return 'N2';
    case 'n1': return 'N1';
    case 'unknown':
      // 不明なら目標から仮置き（会話の中で調整する前提）
      if (a.goal === 'n1') return 'N2前後（仮）';
      if (a.goal === 'n2') return 'N3前後（仮）';
      return 'N4〜N3（仮）';
  }
};

/** レベル帯ごとの目標表現。会話の中で1回以上使わせるターゲット */
const TARGETS: Record<string, TargetExpression> = {
  belowN4: {
    label: '「〜てもいいですか」',
    detect: /てもいいですか|でもいいですか/,
    example: 'ちょっと休んでもいいですか。',
    zhMeaning: '「〜てもいいですか」＝可以…吗？（请求许可）',
    zhExample: '可以稍微休息一下吗?',
  },
  n4: {
    label: '「〜たことがあります」',
    detect: /たことがあり|たことがある|だことがあり|だことがある/,
    example: '日本の大会に出たことがあります。',
    zhMeaning: '「〜たことがあります」＝曾经…过（表达经历）',
    zhExample: '我参加过日本的比赛。',
  },
  n3: {
    label: '「〜ようになりました」',
    detect: /ようになりました|ようになった/,
    example: '毎週練習して、スマッシュが打てるようになりました。',
    zhMeaning: '「〜ようになりました」＝变得能…了（表示能力或习惯的变化）',
    zhExample: '每周练习之后，我变得会打杀球了。',
  },
  n2: {
    label: '「〜わけではありません」',
    detect: /わけではありません|わけではない|わけじゃない/,
    example: '毎日練習できるわけではありませんが、続けています。',
    zhMeaning: '「〜わけではありません」＝并不是…（部分否定）',
    zhExample: '虽然并不是每天都能练习，但我一直在坚持。',
  },
  n1: {
    label: '「〜ざるを得ません」',
    detect: /ざるを得|ざるをえ/,
    example: '仕事が忙しくて、練習を休まざるを得ませんでした。',
    zhMeaning: '「〜ざるを得ない」＝不得不…（无奈的选择）',
    zhExample: '因为工作太忙，不得不请假没去练习。',
  },
};

const pickTarget = (a: HearingAnswers): TargetExpression => {
  // レベル不明時は目標から推定したレベル帯を使う
  let band: keyof typeof TARGETS;
  switch (a.level) {
    case 'belowN4': band = 'belowN4'; break;
    case 'n4': band = 'n4'; break;
    case 'n3': band = 'n3'; break;
    case 'n2': band = 'n2'; break;
    case 'n1': band = 'n1'; break;
    case 'unknown':
      band = a.goal === 'n1' ? 'n2' : a.goal === 'n2' ? 'n3' : 'n4';
      break;
  }
  return TARGETS[band];
};

/** 優先課題3件: ①本人の困りごと ②目標由来 ③場面/共通 */
const pickPriorities = (a: HearingAnswers): string[] => {
  const keys: string[] = [a.struggle];
  const isJlpt = a.goal === 'n1' || a.goal === 'n2' || a.goal === 'n3';
  keys.push(isJlpt ? 'jlptSpeak' : 'sceneVocab');
  // 3件目: 困りごとと重複しない共通課題
  keys.push(a.struggle === 'explain' ? 'sceneVocab' : keys.includes('sceneVocab') ? 'output' : 'explain');
  // 重複除去して3件に
  return [...new Set(keys)].slice(0, 3);
};

/** 学習配分（合計100%を維持する） */
const buildAllocation = (a: HearingAnswers): LearningPlan['allocation'] => {
  const alloc = { conversation: 50, grammar: 20, vocab: 15, review: 15 };
  if (a.struggle === 'grammar') { alloc.grammar += 10; alloc.conversation -= 10; }
  if (a.struggle === 'vocab') { alloc.vocab += 10; alloc.conversation -= 10; }
  const isJlpt = a.goal === 'n1' || a.goal === 'n2' || a.goal === 'n3';
  if (isJlpt) { alloc.grammar += 5; alloc.review += 5; alloc.conversation -= 10; }
  return alloc;
};

/** 週間回数: 短く頻繁に。緊張・瞬発力タイプは回数多め */
const weeklySessions = (a: HearingAnswers): number => {
  if (a.struggle === 'nervous' || a.struggle === 'recall') return 5;
  if (a.goal === 'work' || a.scene === 'interview') return 5;
  return 4;
};

export const generatePlan = (a: HearingAnswers): LearningPlan => ({
  mainGoal: a.goal,
  estimatedLevel: estimateLevel(a),
  priorityIssueKeys: pickPriorities(a),
  weeklySessions: weeklySessions(a),
  sessionMinutes: 3, // MVPは3分コースを推奨起点にする
  allocation: buildAllocation(a),
  correction: a.correction,
  zhSupport: a.zhSupport,
  themeKey: a.scene,
  target: pickTarget(a),
});
