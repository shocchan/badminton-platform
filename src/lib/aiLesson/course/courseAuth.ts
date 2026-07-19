// コースの認証ヘルパー（Supabase メールOTP）
// 方針:
// - 既存の一般ユーザー認証・管理者認証には触れない。supabase-js の auth をそのまま使う
// - 初回のみ「招待コード + メール」→ 6桁OTP → セッション永続（端末に保持、自動ログイン）
// - 招待コードの厳密な検証は ai-lesson-token / DB 側でも行う（フロントは入口のふるい）
// - 管理者判定は ai_admins テーブル（RLSで自分の行だけ見える）

import { supabase } from '../../../services/supabaseClient';

export interface AuthUser {
  id: string;
  email: string | null;
}

export const getSession = async (): Promise<AuthUser | null> => {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  return u ? { id: u.id, email: u.email ?? null } : null;
};

/** Edge Function へ本人確認のために渡す JWT。ログへは出さない */
export const getAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

export const onAuthChange = (cb: (user: AuthUser | null) => void): (() => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
};

/** OTP送信の結果。理由は安全なコードのみ（Supabaseの生メッセージは扱わない） */
export type OtpSendCode =
  | 'invalid_invite'      // 招待コードが違う / 未登録なのに招待コードなし
  | 'otp_cooldown'        // 60秒の再送間隔
  | 'otp_hourly_limit'    // 1時間の送信上限
  | 'invalid_email'
  | 'network'
  | 'unknown';

export interface OtpSendResult {
  ok: boolean;
  code?: OtpSendCode;
  /** 再送可能になるまでの秒数 */
  retryAfter?: number;
}

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * OTPをメールで送る。
 * supabase.auth.signInWithOtp は使わない（招待コードを知らない人が
 * ブラウザから直接呼んで登録できてしまうため）。必ず ai-course-auth を通す。
 * - 初回: inviteCode を渡す。サーバー側でDB照合し、成功時のみ登録許可が出る
 * - 継続: inviteCode 不要。既に learner があるメールにだけ送られる
 */
export const sendEmailOtp = async (email: string, inviteCode?: string): Promise<OtpSendResult> => {
  if (!SUPA_URL || !ANON_KEY) return { ok: false, code: 'unknown' };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-course-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ email: email.trim(), code: inviteCode?.trim() || undefined }),
    });
    if (res.ok) return { ok: true };
    const data = await res.json().catch(() => ({}));
    return {
      ok: false,
      code: (data?.error as OtpSendCode) ?? 'unknown',
      retryAfter: typeof data?.retryAfter === 'number' ? data.retryAfter : undefined,
    };
  } catch {
    return { ok: false, code: 'network' };
  }
};

/** メール+6桁コードで検証してログイン */
export const verifyEmailOtp = async (email: string, token: string): Promise<{ ok: boolean; error?: string }> => {
  const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  return error ? { ok: false, error: error.message } : { ok: true };
};

export const signOut = async (): Promise<void> => {
  await supabase.auth.signOut();
};

/** 現在ユーザーが管理者か（ai_admins に自分のメールがあるか） */
export const isCourseAdmin = async (): Promise<boolean> => {
  const { data } = await supabase.from('ai_admins').select('email').limit(1);
  return Array.isArray(data) && data.length > 0;
};
