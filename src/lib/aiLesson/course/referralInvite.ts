/*
 * 生徒本人の招待リンク（2026-09-13 CEO決定）: 友達を無料7日に招待すると、
 * 友達が1日目の診断を終えた時点で本人の受講期限が +7日（上限3人）。
 *
 * DB: ai_my_referral_invite()（コードが無ければ作る）・20260913140000。
 * ここは読み取りと、コピーする文面。画面は components/ai-course/InviteFriendsPopup.tsx。
 * 旧・紹介制度（?ref=・有料購入で報酬）とは別物。混ぜない。
 */
import { supabase } from '../../../services/supabaseClient';

export interface MyReferralInvite {
  code: string;
  expiresAtISO: string | null;
  /** 延長済みの人数 */
  rewarded: number;
  cap: number;
  days: number;
  /** 登録したが、まだ1日目の診断を終えていない人数 */
  waiting: number;
}

export const fetchMyReferralInvite = async (): Promise<MyReferralInvite | null> => {
  const { data, error } = await supabase.rpc('ai_my_referral_invite');
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  const d = data as Record<string, unknown>;
  return {
    code: String(d.code ?? ''),
    expiresAtISO: typeof d.expiresAt === 'string' ? d.expiresAt : null,
    rewarded: Number(d.rewarded ?? 0),
    cap: Number(d.cap ?? 3),
    days: Number(d.days ?? 7),
    waiting: Number(d.waiting ?? 0),
  };
};

export const inviteUrl = (code: string, lang: 'ja' | 'zh', origin = 'https://kawabado.com'): string =>
  `${origin}/${lang}/invite?invite=${code}`;

/**
 * WeChat にそのまま貼れる文面（リンク込み）。
 * 送る相手は中国語話者なので、**画面の言語に関係なく中文・/zh のリンク**（2026-09-13 CEO指示）。
 * 日本語は先生の確認用に残す（forceZh=false のとき）
 */
export const inviteMessage = (code: string, lang: 'ja' | 'zh', forceZh = true): string => {
  const useZh = forceZh || lang === 'zh';
  const url = inviteUrl(code, useZh ? 'zh' : 'ja');
  if (useZh) {
    return [
      '我在用一个日语学习系统「你的日语搭档」。',
      '第1天8分钟测出你现在的位置（词汇・语法），之后每天10分钟只做你缺的。',
      '用我的链接可以免费学7天，不用付款、不会自动续费：',
      url,
    ].join('\n');
  }
  return [
    '日本語学習システム「日本語の相棒」を使っています。',
    '1日目に8分で現在地（ことば・文法）が分かって、あとは毎日10分、足りない所だけ。',
    'このリンクから7日間無料で使えます（支払いなし・自動更新なし）:',
    url,
  ].join('\n');
};

/**
 * ポップは**しばらく毎回のログインで出す**（2026-09-13 CEO指示）。閉じたらそのタブ（セッション）では出さない。
 * 渡す storage は sessionStorage。やめるときはここを localStorage に戻すだけ
 */
const SEEN_KEY = 'kawabado.aiCourse.inviteFriends.seen.v2';
export const inviteFriendsSeen = (storage: Pick<Storage, 'getItem'> | null): boolean => {
  try { return !!storage?.getItem(SEEN_KEY); } catch { return true; }
};
export const markInviteFriendsSeen = (storage: Pick<Storage, 'setItem'> | null): void => {
  try { storage?.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* private mode */ }
};

/** 招待ページ用: コードの期限・満員（誰のコードかは返らない）。未ログインで呼べる */
export const fetchInvitePublicInfo = async (code: string): Promise<{ active: boolean; full: boolean; expiresAtISO: string | null } | null> => {
  const { data, error } = await supabase.rpc('ai_invite_public_info', { p_code: code });
  if (error || !data || (data as { ok?: boolean }).ok !== true) return null;
  const d = data as Record<string, unknown>;
  return { active: d.active === true, full: d.full === true, expiresAtISO: typeof d.expiresAt === 'string' ? d.expiresAt : null };
};
