// コースの認証ヘルパー（Supabase メールOTP）
// 方針:
// - 既存の一般ユーザー認証・管理者認証には触れない。supabase-js の auth をそのまま使う
// - 初回のみ「招待コード + メール」→ 6桁OTP → セッション永続（端末に保持、自動ログイン）
// - 招待コードの厳密な検証は ai-lesson-token / DB 側でも行う（フロントは入口のふるい）
// - 管理者判定は ai_admins テーブル（RLSで自分の行だけ見える）

import { supabase } from '../../../services/supabaseClient';
import { isValidLearningCode, normalizeLearningCode } from './learningCode';

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

/**
 * ID欄の入力を正規化する。フルの `kaiwa@id.badminton-platform.pages.dev` を
 * 貼る人が実際にいる（2026-08-16 CEO報告）ため、自ドメイン部分は黙って剥がして受け入れる。
 * 別ドメインのメールはIDではないのでそのまま返す（＝検証で弾かれる）
 */
export const normalizeStudentIdInput = (raw: string): string => {
  const v = raw.trim().toLowerCase();
  return v.endsWith(`@${STUDENT_ID_DOMAIN}`) ? v.slice(0, -(`@${STUDENT_ID_DOMAIN}`.length)) : v;
};

/**
 * ID欄の入力を、認証に使うメールアドレスへ変換する。受け付けるのは2種類:
 *
 *   1. 学習者ID（`summer` など）… 自ドメインを足す。これまでの生徒はこちら
 *   2. **メールアドレス**（`someone@example.com`）… そのまま使う。
 *      2026-09-09 CEO決定で、購入者のIDは申込時のメールアドレスになった
 *      （合成メールでは再設定メールが送れず、バド側のマイページにも出なかった）
 *
 * どちらでもなければ null＝ログインを試みない。
 */
export const loginEmailFor = (raw: string): string | null => {
  const normalized = normalizeStudentIdInput(raw);
  if (isValidStudentId(normalized)) return studentIdToEmail(normalized);
  // ざっくりしたメールの形だけ見る。厳密な判定はサーバーに任せる
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
};

export const signInWithStudentId = async (id: string, password: string): Promise<{ ok: boolean }> => {
  const email = loginEmailFor(id);
  if (!email || password.length === 0) return { ok: false };
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { ok: !error };
};

/**
 * 学習コードでログインする（2026-09-09 P0-2）。
 *
 * サーバー（ai-course-code-login）がコードを照合し、Supabaseの正規経路
 * （admin/generate_link → hashed_token）で単回・短命のトークンを返す。
 * ここはそれをセッションに換えるだけ。**パスワードは一切扱わない。**
 *
 * 失敗理由は意図的に粗い（存在しないのか失効なのかをクライアントへ教えない）。
 */
export type CodeLoginCode = 'invalid_code' | 'too_many_attempts' | 'unavailable' | 'network';

export const signInWithLearningCode = async (
  code: string,
): Promise<{ ok: boolean; code?: CodeLoginCode; retryAfter?: number }> => {
  if (!SUPA_URL || !ANON_KEY) return { ok: false, code: 'unavailable' };
  const normalized = normalizeLearningCode(code);
  if (!isValidLearningCode(normalized)) return { ok: false, code: 'invalid_code' };
  try {
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-course-code-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON_KEY },
      body: JSON.stringify({ code: normalized }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data?.ok !== true || typeof data?.tokenHash !== 'string') {
      return {
        ok: false,
        code: (data?.code as CodeLoginCode) ?? 'invalid_code',
        retryAfter: typeof data?.retryAfter === 'number' ? data.retryAfter : undefined,
      };
    }
    const { error } = await supabase.auth.verifyOtp({ token_hash: data.tokenHash, type: 'magiclink' });
    return error ? { ok: false, code: 'unavailable' } : { ok: true };
  } catch {
    return { ok: false, code: 'network' };
  }
};

/** ログイン中の本人がパスワードを変更する（8文字以上。メール不要） */
export const updatePassword = async (newPassword: string): Promise<{ ok: boolean; error?: string }> => {
  if (newPassword.length < 8) return { ok: false, error: 'too_short' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: error.message } : { ok: true };
};

export const signOut = async (): Promise<void> => {
  // 未送信の学習記録（オフライン・通信失敗でpending退避されたもの）を先に送り切る。
  // これをせずキャッシュを消すと、その回の進捗の唯一のコピーが消える（2026-08-15 監査P1）
  const { courseRepository, clearCourseLocalCache } = await import('./courseRepository');
  try { await courseRepository.flushPending(); } catch { /* オフラインでも後続は実行する */ }
  await supabase.auth.signOut();
  // 端末ローカルの学習キャッシュも消す（次にログインする別ユーザーへ漏らさない）
  clearCourseLocalCache();
};

/** 現在ユーザーが管理者か（ai_admins に自分のメールがあるか） */
export const isCourseAdmin = async (): Promise<boolean> => {
  const { data } = await supabase.from('ai_admins').select('email').limit(1);
  return Array.isArray(data) && data.length > 0;
};
