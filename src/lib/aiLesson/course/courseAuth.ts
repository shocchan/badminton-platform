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

export const onAuthChange = (cb: (user: AuthUser | null) => void): (() => void) => {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    const u = session?.user;
    cb(u ? { id: u.id, email: u.email ?? null } : null);
  });
  return () => data.subscription.unsubscribe();
};

/** 6桁OTPをメールで送る。shouldCreateUser=true で新規も可（招待コードは呼び出し側で検証済み前提） */
export const sendEmailOtp = async (email: string): Promise<{ ok: boolean; error?: string }> => {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
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
