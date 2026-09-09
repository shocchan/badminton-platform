/**
 * 利用期限が切れた人に、何を見せるか（2026-09-09 CEO指示）。
 *
 * 【なぜ要るか】
 * これまで期限切れ画面は、**体験パスの人だけ**がその場の3択（購入）へ進めて、
 * それ以外は全員「先生に連絡してください」＋ログアウトの行き止まりだった。
 * ところが自分で買った人（1か月プラン・Friends Beta）は**先生と直接の接点がない**。
 * 「レッスン受けてない人は直接自分とやりとりすることないから」（CEO）——
 * その人たちに連絡先のない連絡指示を出すのは、ただの行き止まり。
 *
 * 【どう分けるか】
 * 人のレッスンが含まれる契約か（＝先生と直接つながっているか）だけで分ける。
 * プラン名でハードコードせず、カタログの `lessonCount` から導く（商品が増えても壊れない）。
 *
 *   coached   … 手動発行（plan_id が null＝先生が手で開通した人）と、
 *               人のレッスンを含むプラン。先生に直接言うのがいちばん早い
 *   selfServe … 自分で買った人・招待された人。その場で選べるようにする
 *
 * どちらにも問い合わせ先（info@kawabado.com）は出す。迷った人が止まらないように。
 */

import { planById } from './planCatalog';

export type ExpiredAudience = 'coached' | 'selfServe';

/**
 * 期限切れの人をどちらの扱いにするか。
 *
 * - `null`（手動発行）は coached。先生が手で開通した人＝WeChatでつながっている
 * - カタログにあって `lessonCount > 0` のプラン（6か月伴走コース）も coached
 * - それ以外（体験パス・1か月プラン・カタログ外の friends-beta 等）は selfServe
 */
export const expiredAudienceOf = (planId: string | null | undefined): ExpiredAudience => {
  if (!planId) return 'coached';
  const plan = planById(planId);
  // カタログに無い plan_id（friends-beta など）は、先生の個別レッスンを含まない＝selfServe。
  // ここで coached に倒すと、また連絡先のない「先生に連絡してください」に戻ってしまう
  if (!plan) return 'selfServe';
  return plan.lessonCount > 0 ? 'coached' : 'selfServe';
};

/**
 * 体験パスをやり切った直後か（＝「終了」ではなく「完走」として迎える画面）。
 * 期限切れ画面の見出しをここで切り替える。
 */
export const isTrialCompletion = (planId: string | null | undefined): boolean =>
  planId === 'ai-trial-pass';
