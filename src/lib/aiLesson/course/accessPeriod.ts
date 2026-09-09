/**
 * 利用期限の見せ方（2026-09-09 CEO指示）。
 *
 * 【なぜ要るか】
 * これまで期限を出していたのは PlanStatusChip だけで、対象は
 * **カタログにある購入プランの人**に限っていた（設計上わざとそうしていた）。
 * その結果、いまいる生徒13人のうち9人（手動発行・plan_id が null）と
 * Friends Beta の人には、**期限がどこにも表示されていなかった**。
 * 「いつまでも使えると思われたくない」（CEO）——ここを埋める。
 *
 * 【書き方の約束】
 * - 煽らない。残り日数は事実として出すだけで、「急いで！」とは書かない
 * - 期限が近いときだけ色を変える（7日以下＝注意、3日以下＝強め）
 * - **まだ始まっていない体験の残り日数は数えない。** 時計が動いていないのに
 *   減っていく数字を見せるのは嘘になる
 * - headline は**それ自体で意味が通る1行**にする（「利用期限：」まで含める）。
 *   表示側でラベルを足すと、状況によって「利用期限 利用期限を過ぎました」と重なる
 */

import { formatUntilJst } from './courseAccess';

export type PeriodLevel = 'normal' | 'soon' | 'last';

export interface PeriodNotice {
  level: PeriodLevel;
  /** 1行目。いつまで使えるか */
  headline: string;
  /** 2行目。補足（無いこともある） */
  sub: string | null;
}

/** 残り日数。切り上げ（今日を1日と数える）。過去なら0 */
export const daysLeft = (validUntilISO: string, nowISO: string): number => {
  const until = Date.parse(validUntilISO);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(until) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.ceil((until - now) / 86_400_000));
};

/** 残り時間（時間単位）。最終日に「あと1日」とだけ出すと粗すぎるので使う */
export const hoursLeft = (validUntilISO: string, nowISO: string): number => {
  const until = Date.parse(validUntilISO);
  const now = Date.parse(nowISO);
  if (!Number.isFinite(until) || !Number.isFinite(now)) return 0;
  return Math.max(0, Math.floor((until - now) / 3_600_000));
};

export const levelOf = (days: number): PeriodLevel =>
  days <= 3 ? 'last' : days <= 7 ? 'soon' : 'normal';

export interface PeriodInput {
  validUntilISO: string;
  /** 体験の開始時刻。null＝まだ始めていない（時計が動いていない） */
  trialStartedAtISO?: string | null;
  /** 体験の日数（AI体験パス=7）。null＝日数制ではない */
  trialDays?: number | null;
  nowISO: string;
  lang: 'ja' | 'zh';
  /**
   * 問い合わせ先（t.support.email）。期限切れのときだけ添える。
   * 「先生に言って」だけだと、先生と直接つながっていない人（自分で買った人・
   * 招待された人）には連絡先が無いことになる（2026-09-09 CEO指摘）。
   * 渡されなければ書かない（存在しない窓口を案内しない）。
   */
  supportEmail?: string | null;
}

/**
 * 期限の1行。**始まっていない体験は残り日数を数えない**（時計が動いていないため）。
 * 日付が壊れている行では null を返す（推測した日付を書かない）。
 */
export const accessPeriodNotice = (i: PeriodInput): PeriodNotice | null => {
  if (!Number.isFinite(Date.parse(i.validUntilISO))) return null;
  const zh = i.lang === 'zh';

  // まだ始めていない体験。残りではなく「始めたら何日ぶん」を伝える
  if (i.trialDays && !i.trialStartedAtISO) {
    return {
      level: 'normal',
      headline: zh
        ? `按下「开始体验」之后，可以使用${i.trialDays}天`
        : `「体験を始める」を押した日から${i.trialDays}日間使えます`,
      sub: zh
        ? `请在 ${formatUntilJst(i.validUntilISO, 'zh')} 之前开始`
        : `開始できるのは ${formatUntilJst(i.validUntilISO, 'ja')} までです`,
    };
  }

  const days = daysLeft(i.validUntilISO, i.nowISO);
  const until = formatUntilJst(i.validUntilISO, i.lang);

  if (days <= 0) {
    return {
      level: 'last',
      headline: zh ? '使用期限已到' : '利用期限を過ぎました',
      sub: i.supportEmail
        ? (zh ? `想继续的话，请告诉老师。发邮件也可以：${i.supportEmail}`
          : `続けたいときは先生に言ってください。メールでも大丈夫です：${i.supportEmail}`)
        : (zh ? '想继续的话，请告诉老师。' : '続けたいときは先生に言ってください。'),
    };
  }

  // 最終日は「あと1日」だと粗いので時間で言う
  if (days === 1) {
    const h = hoursLeft(i.validUntilISO, i.nowISO);
    return {
      level: 'last',
      headline: zh ? `使用期限：${until}（还剩约${Math.max(1, h)}小时）` : `利用期限：${until}（あと約${Math.max(1, h)}時間）`,
      sub: null,
    };
  }

  return {
    level: levelOf(days),
    headline: zh ? `使用期限：${until}（还剩${days}天）` : `利用期限：${until}（あと${days}日）`,
    sub: null,
  };
};
