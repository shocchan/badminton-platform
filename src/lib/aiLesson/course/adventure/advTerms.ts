// 用語辞書（UX CLARITY §10）。同じ意味に複数の名前を使わない。
//
// 確定した用語（ja / zh）:
// - 冒険   : 今日行う一連の学習       / 冒险
// - バトル : 問題演習                 / 战斗
// - 攻略率 : 単元ごとの定着            / 攻略率
// - 準備度 : 試験全体の技能評価        / 准备度
// - 攻略ルート : 目的地までの道        / 攻略路线
// - 復習   : 間隔反復                  / 复习
// - ボス   : 複数技能を含む区切りの試験 / Boss
//
// 使わない語（重複・曖昧のため廃止）:
// - 「挑戦」（Mapの全カードに並んでいた。現在地=「ここから続ける」／先=「内容を見る」へ）
// - 「復習の庭」（「今日の復習」と役割が重複して見える。二次メニューでは「復習の一覧」）
// - 「門」（N2の門 のみ固有名として残す。一般名詞としては使わない）
// - 「模擬ボス」（技能が揃わない限り使わない。§5の battleScopeName で機械決定）

export interface Term { ja: string; zh: string; }

export const TERMS = {
  /** 今日行う一連の学習 */
  adventure: { ja: '冒険', zh: '冒险' },
  todayAdventure: { ja: '今日の冒険', zh: '今天的冒险' },
  /** 問題演習 */
  battle: { ja: 'バトル', zh: '战斗' },
  /** 単元ごとの定着 */
  masteryRate: { ja: '攻略率', zh: '攻略率' },
  /** 試験全体の技能評価 */
  readiness: { ja: '準備度', zh: '准备度' },
  /** 目的地までの道 */
  route: { ja: '攻略ルート', zh: '攻略路线' },
  /** 間隔反復 */
  review: { ja: '復習', zh: '复习' },
  todayReview: { ja: '今日の復習', zh: '今天的复习' },
  reviewList: { ja: '復習の一覧', zh: '复习列表' },
  /** 複数技能を含む区切りの試験 */
  boss: { ja: 'ボス', zh: 'Boss' },
  /** 現在地 / 目的地 */
  currentLocation: { ja: '現在地', zh: '当前位置' },
  destination: { ja: '最終目的地', zh: '最终目的地' },
  nextPoint: { ja: '次の地点', zh: '下一个地点' },
  /** CTA */
  continueHere: { ja: 'ここから続ける', zh: '从这里继续' },
  viewContents: { ja: '内容を見る', zh: '查看内容' },
  startToday: { ja: '今日の冒険を始める', zh: '开始今天的冒险' },
  continueNext: { ja: '続ける', zh: '继续' },
  /** 状態 */
  cleared: { ja: '攻略済み', zh: '已攻克' },
  recommended: { ja: 'おすすめ', zh: '推荐' },
  viewable: { ja: '閲覧できます', zh: '可以查看' },
  notReady: { ja: '総合模試はまだ準備できません', zh: '综合模拟考尚未准备好' },
  undetermined: { ja: '未判定', zh: '未判定' },
  provisional: { ja: '暫定', zh: '暂定' },
  /** 二次メニュー */
  otherLearning: { ja: 'ほかの学習を見る', zh: '查看其他学习内容' },
  seeRoute: { ja: '攻略ルートを見る', zh: '查看攻略路线' },
  seeReadiness: { ja: '成長・準備度を見る', zh: '查看成长・准备度' },
  seeReviewList: { ja: '復習の一覧を見る', zh: '查看复习列表' },
  seeTeacherPrep: { ja: '先生レッスンの準備', zh: '真人课的准备' },
  /** 今鍛えている試験科目 */
  nowTraining: { ja: '今鍛えている試験力', zh: '正在锻炼的考试能力' },
  todayGoal: { ja: '今日のゴール', zh: '今天的目标' },
} as const satisfies Record<string, Term>;

export type TermKey = keyof typeof TERMS;

export const t = (key: TermKey, lang: 'ja' | 'zh'): string => TERMS[key][lang];
