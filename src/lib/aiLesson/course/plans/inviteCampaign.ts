/*
 * 招待リンク限定の「7日間の実力診断」キャンペーン（2026-09-11 CEO決定）。
 *
 * - 締め切りは**固定日**（一人ひとりの3日ではなく、全員同じ日）
 * - 残り枠の数字は出さない（「余裕がある」と見えると人気が無いように感じる）
 * - 定員（先着100）と締め切りの本当の判定はサーバーの招待コード（ai_course_invites の max_uses / expires_at）。
 *   ここは画面のカウントダウン用。発行時に同じ日を expires_at へ入れること
 *   （scripts/ai-course/issue-free-trial-invite.mjs --expires）。
 */

export const INVITE_CAMPAIGN = {
  /** 申し込みの締め切り（JST）。画面のカウントダウンはこれで数える */
  deadlineISO: '2026-09-14T23:59:59+09:00',
  /** 「限量100个账号」。表示だけ。実際の上限は招待コード側 */
  seats: 100,
  /** JLPT 本番日。「あと◯日」の計算に使う */
  examDateISO: '2026-12-06T00:00:00+09:00',
} as const;

export const daysUntil = (iso: string, now: Date = new Date()): number =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - now.getTime()) / 86_400_000));

export interface Countdown { days: number; hours: number; minutes: number; seconds: number; closed: boolean }

export const countdownTo = (iso: string, now: Date = new Date()): Countdown => {
  let ms = new Date(iso).getTime() - now.getTime();
  const closed = ms <= 0;
  ms = Math.max(0, ms);
  const days = Math.floor(ms / 86_400_000); ms -= days * 86_400_000;
  const hours = Math.floor(ms / 3_600_000); ms -= hours * 3_600_000;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { days, hours, minutes, seconds, closed };
};

/** URL の ?invite= から招待コードを拾う（学習コード・紹介コードと同じ文字集合） */
export const inviteCodeFromSearch = (search: string): string => {
  const v = new URLSearchParams(search).get('invite') ?? '';
  const n = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/.test(n) ? n : '';
};
