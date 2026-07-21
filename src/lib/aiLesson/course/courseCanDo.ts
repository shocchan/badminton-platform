// 「できるようになったこと」（Can-do）の判定（純関数・§14/§23）。
//
// - Week番号や%ではなく「実際にできること」で成長を表す
// - 根拠（実発話・mastery・復習成功・定着）がある場合だけ「できる」と表示
// - 初回学習しただけで「完全に使える」とは言わない。状態に応じた誠実な表現にする

import { COURSE_MISSIONS, COURSE_WEEKS } from './courseData';
import { atLeast } from './courseEngine';
import type { CourseMasteryState, ItemProgress, MissionCategory } from './types';

/** mastery 状態ごとの誠実な達成表現（§23） */
export type CanDoStage = 'practiced' | 'withHint' | 'independent' | 'day1' | 'day3' | 'day7' | 'day30';

export const stageOfMastery = (s: CourseMasteryState): CanDoStage => {
  switch (s) {
    case 'initial':
    case 'understood': return 'practiced';
    case 'used_with_hint': return 'withHint';
    case 'used_independently': return 'independent';
    case 'reviewed_day1': return 'day1';
    case 'reviewed_day3': return 'day3';
    case 'retained_day7': return 'day7';
    case 'retained_day30': return 'day30';
  }
};

/** 「できるようになった」と胸を張れる段階か（自力使用以上） */
export const isAchieved = (s: CourseMasteryState): boolean => atLeast(s, 'used_independently');

// カテゴリ → できること（1文）。日本語UIは ja、中国語UIは zh。
export interface CanDoDef {
  id: string;              // = MissionCategory
  ja: string;
  zh: string;
}

export const CAN_DO_BY_CATEGORY: Record<MissionCategory, { ja: string; zh: string }> = {
  selfIntro: { ja: '自分のことを紹介できる', zh: '能介绍自己' },
  experience: { ja: '自分の経験を話せる', zh: '能讲自己的经历' },
  change: { ja: '以前と今の変化を説明できる', zh: '能说明以前和现在的变化' },
  habit: { ja: '習慣について理由をつけて話せる', zh: '能带着理由讲自己的习惯' },
  permission: { ja: '相手に丁寧にお願い・許可を求められる', zh: '能礼貌地请求或征得许可' },
  trouble: { ja: '困ったことを相談できる', zh: '能就困扰进行咨询' },
  opinion: { ja: '自分の意見と理由を伝えられる', zh: '能表达自己的意见和理由' },
  comparison: { ja: '2つを比べて選べる', zh: '能比较两者并做选择' },
  guess: { ja: '推測や可能性を言える', zh: '能表达推测和可能性' },
  workLife: { ja: '仕事や生活の場面で丁寧に話せる', zh: '能在工作和生活场景中礼貌地表达' },
  badminton: { ja: 'バドミントンで人と交流できる', zh: '能在羽毛球场合与人交流' },
  integrated: { ja: '複数の表現を混ぜて自由に会話できる', zh: '能综合运用多种表达自由对话' },
};

/** 会話の場面としての「聞き返し」能力（カテゴリ外だが can-do として扱う） */
export const CAN_DO_ASK_BACK = { id: 'askBack', ja: '分からない時に自然に聞き返せる', zh: '不明白时能自然地反问' };

export interface AchievedCanDo {
  id: string;
  ja: string;
  zh: string;
  stage: CanDoStage;
  /** その能力を代表する目標表現（例示用） */
  exampleExpression: string | null;
}

/**
 * 現在「できるようになったこと」。
 * カテゴリ内に自力使用以上の項目が1つでもあれば、そのカテゴリの can-do を達成とみなす。
 * stage はそのカテゴリで最も進んだ項目の段階。
 */
export const currentCanDos = (progresses: ItemProgress[]): AchievedCanDo[] => {
  const byCat = new Map<MissionCategory, { best: CourseMasteryState; expr: string | null }>();
  for (const p of progresses) {
    if (!isAchieved(p.masteryState)) continue;
    const mission = COURSE_MISSIONS.find((m) => m.id === p.itemId);
    if (!mission) continue;
    const cur = byCat.get(mission.category);
    if (!cur || stageRank(p.masteryState) > stageRank(cur.best)) {
      byCat.set(mission.category, { best: p.masteryState, expr: mission.targetExpression });
    }
  }
  const out: AchievedCanDo[] = [];
  byCat.forEach((v, cat) => {
    out.push({
      id: cat, ...CAN_DO_BY_CATEGORY[cat],
      stage: stageOfMastery(v.best), exampleExpression: v.expr,
    });
  });
  // 進んだ順に
  return out.sort((a, b) => stageOrder.indexOf(b.stage) - stageOrder.indexOf(a.stage));
};

const stageOrder: CanDoStage[] = ['practiced', 'withHint', 'independent', 'day1', 'day3', 'day7', 'day30'];
const stageRank = (s: CourseMasteryState) => stageOrder.indexOf(stageOfMastery(s));

/**
 * 今週できるようになったこと（最大 max 件、§20）。
 * 指定週の項目のうち、自力使用以上に到達したものの can-do を返す。
 */
export const canDosThisWeek = (progresses: ItemProgress[], week: number, max = 3): AchievedCanDo[] => {
  const weekIds = COURSE_MISSIONS.filter((m) => m.week === week).map((m) => m.id);
  const achieved = progresses.filter((p) => weekIds.includes(p.itemId) && isAchieved(p.masteryState));
  const out: AchievedCanDo[] = [];
  for (const p of achieved) {
    const mission = COURSE_MISSIONS.find((m) => m.id === p.itemId);
    if (!mission) continue;
    out.push({
      id: `${mission.id}`,
      ja: canDoLineForMission(mission.category, mission.targetExpression, 'ja'),
      zh: canDoLineForMission(mission.category, mission.targetExpression, 'zh'),
      stage: stageOfMastery(p.masteryState),
      exampleExpression: mission.targetExpression,
    });
  }
  return out.slice(0, max);
};

/** ミッション単位の「できること」1文（目標表現を添える） */
export const canDoLineForMission = (category: MissionCategory, expr: string, locale: 'ja' | 'zh'): string => {
  const base = CAN_DO_BY_CATEGORY[category];
  return locale === 'zh' ? `${base.zh}（${expr}）` : `${base.ja}（${expr}）`;
};

/**
 * 次にできるようになること（§20）。
 * 次に学ぶ／伸ばすカテゴリの can-do を1つ返す。nextMission のカテゴリを使う。
 */
export const nextAbility = (nextMissionId: string | null): { id: string; ja: string; zh: string } | null => {
  if (!nextMissionId) return null;
  const mission = COURSE_MISSIONS.find((m) => m.id === nextMissionId);
  if (!mission) return null;
  return { id: mission.category, ...CAN_DO_BY_CATEGORY[mission.category] };
};

/** 12週後に目指す会話（§24）。断定しない前提で表示側が注記を添える */
export const COURSE_GOAL_CANDOS: { ja: string; zh: string }[] = [
  { ja: '自分の経験を3〜5文で話せる', zh: '能用3〜5句话讲自己的经历' },
  { ja: '意見と理由をセットで伝えられる', zh: '能把意见和理由成套地表达' },
  { ja: '丁寧に依頼・相談できる', zh: '能礼貌地请求和咨询' },
  { ja: '日本人との会話を自分から続けられる', zh: '能主动把和日本人的对话继续下去' },
  { ja: '分からない時に自然に聞き返せる', zh: '不明白时能自然地反问' },
  { ja: 'バドミントンや日常生活で交流できる', zh: '能在羽毛球和日常生活中与人交流' },
];

/** 週の「ステージ名」（現在地カード用）。テーマから短い能力名を作る */
export const weekStageLabel = (week: number, locale: 'ja' | 'zh'): string => {
  const w = COURSE_WEEKS.find((x) => x.week === week);
  if (!w) return '';
  return locale === 'zh' ? w.themeZh : w.themeJa;
};
