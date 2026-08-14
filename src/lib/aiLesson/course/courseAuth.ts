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

/**
 * ID＋パスワードログイン。
 * IDは内部的に `${id}@id.badminton-platform.pages.dev` へ変換してSupabaseのパスワード認証を使う。
 * - ドメインは自社Pages配下（MXなし）＝メールが実際に送られることはない
 * - `.invalid` は使わない（QA fixture専用の目印。実生徒に使うとseed系ガードを素通りする）
 * - アカウントは先生側スクリプト（create-student-login.mjs）でのみ作成。自己登録経路は無い
 */
export const STUDENT_ID_DOMAIN = 'id.badminton-platform.pages.dev';
export const isValidStudentId = (id: string): boolean => /^[a-z][a-z0-9]{1,19}$/.test(id.trim().toLowerCase());
export const studentIdToEmail = (id: string): string => `${id.trim().toLowerCase()}@${STUDENT_ID_DOMAIN}`;

export const signInWithStudentId = async (id: string, password: string): Promise<{ ok: boolean }> => {
  if (!isValidStudentId(id) || password.length === 0) return { ok: false };
  const { error } = await supabase.auth.signInWithPassword({ email: studentIdToEmail(id), password });
  return { ok: !error };
};

/** ログイン中の本人がパスワードを変更する（8文字以上。メール不要） */
export const updatePassword = async (newPassword: string): Promise<{ ok: boolean; error?: string }> => {
  if (newPassword.length < 8) return { ok: false, error: 'too_short' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
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
