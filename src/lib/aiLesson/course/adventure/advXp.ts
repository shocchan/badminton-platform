// XP（経験値）＝努力の通貨（2026-08-16 CEO指示「やればやるほどUPして満足するまで学べる」）。
//
// 鉄則（原則13との整合）:
// - XPは**攻略・mastery・準備度に一切影響しない**。実力の見える化（攻略率・定着・準備度）とは別軸
// - だからこそ上限なし・同じ日に何度でも増える（おかわりバトル・模試・かな道場すべて対象）
// - 「XPが高い＝合格できる」とは言わない・見せない
export const XP_RULES = {
  /** バトル1回（勝敗問わず参加でもらえる） */
  battle: 5,
  /** バトル80%以上のボーナス */
  battleWinBonus: 5,
  /** 今日の冒険のstep 1つ（締めくくり時にまとめて加算） */
  questStep: 10,
  /** ミニ模試1回完了 */
  mock: 15,
  /** かな道場1行修了 */
  kanaRow: 5,
  /** かなチェック合格（卒業） */
  kanaGraduate: 10,
} as const;

export const xpForBattle = (scorePct: number): number =>
  XP_RULES.battle + (scorePct >= 80 ? XP_RULES.battleWinBonus : 0);

/** レベルは100XPごと（Lv.1スタート）。冒険の実感用で、学習ロジックには使わない */
export const levelOf = (xp: number): number => 1 + Math.floor(Math.max(0, xp) / 100);

/** 次のレベルまでの残りXP */
export const xpToNextLevel = (xp: number): number => 100 - (Math.max(0, xp) % 100);
