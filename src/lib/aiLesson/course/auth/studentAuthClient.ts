// 生徒ログインの client 入口（PAID STUDENT PILOT §1・§3〜§5）。
//
// **画面から直接 fetch を書かない。** ここを唯一の入口にしておくと、
// 「どこかで生の fetch を書いてメールを載せる」経路が生まれない。
//
// client が知ってよいのは「ログインIDとパスワードを送る」ことだけ。
// ID→メールの解決も、失敗理由の出し分けも、すべて Worker 側で完結する。

import { supabase } from '../../../../services/supabaseClient';
import { canonicalLoginId } from './loginCredentials';

export type LoginOutcome =
  | { ok: true }
  | { ok: false; kind: 'invalid'; message: string }
  | { ok: false; kind: 'locked'; message: string; retryAfterSeconds: number }
  | { ok: false; kind: 'unavailable'; message: string };

interface Deps { fetchFn?: typeof fetch; baseUrl?: string }

const genericUnavailable = (lang: 'ja' | 'zh'): string =>
  lang === 'zh'
    ? '暂时无法登录。请稍后再试。'
    : 'いまログインできませんでした。少し時間をおいてもう一度お試しください。';

/**
 * ログイン。成功したら Supabase のセッションを client に載せる。
 *
 * Worker から受け取るのはトークンだけで、**メールアドレスは返ってこない**。
 * setSession でセッションを確立すれば、以降は既存のコースと同じ経路で動く。
 */
export const loginWithId = async (
  input: { loginId: string; password: string; lang: 'ja' | 'zh' },
  deps: Deps = {},
): Promise<LoginOutcome> => {
  const doFetch = deps.fetchFn ?? fetch;
  let res: Response;
  try {
    res = await doFetch(`${deps.baseUrl ?? ''}/api/ai-course/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        loginId: canonicalLoginId(input.loginId),
        password: input.password,
        lang: input.lang,
      }),
    });
  } catch {
    return { ok: false, kind: 'unavailable', message: genericUnavailable(input.lang) };
  }

  if (res.status === 429) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    return {
      ok: false, kind: 'locked',
      message: body.message ?? genericUnavailable(input.lang),
      retryAfterSeconds: Number(res.headers.get('Retry-After') ?? 900),
    };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    // 401 は「IDかパスワードが違う」の共通文言（理由を出し分けない）
    if (res.status === 401) {
      return { ok: false, kind: 'invalid', message: body.message ?? genericUnavailable(input.lang) };
    }
    return { ok: false, kind: 'unavailable', message: genericUnavailable(input.lang) };
  }

  const session = await res.json() as { accessToken: string; refreshToken: string };
  const { error } = await supabase.auth.setSession({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });
  if (error) return { ok: false, kind: 'unavailable', message: genericUnavailable(input.lang) };
  return { ok: true };
};

/**
 * パスワード再設定の依頼（§4）。
 * **登録の有無にかかわらず同じ結果**を返す。呼び出し側で分岐させない。
 */
export const requestPasswordReset = async (
  input: { email: string; lang: 'ja' | 'zh' },
  deps: Deps = {},
): Promise<{ message: string }> => {
  const doFetch = deps.fetchFn ?? fetch;
  const fallback = input.lang === 'zh'
    ? '已确认登记状况，如果符合条件，我们已发送重设邮件。'
    : '登録状況を確認し、該当する場合は再設定メールを送信しました。';
  try {
    const res = await doFetch(`${deps.baseUrl ?? ''}/api/ai-course/auth/reset-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input.email, lang: input.lang }),
    });
    const body = await res.json().catch(() => ({})) as { message?: string };
    return { message: body.message ?? fallback };
  } catch {
    // 通信失敗でも文言を変えない（登録の有無を推測させないため）
    return { message: fallback };
  }
};

/** ログインIDを忘れた場合の問い合わせ（§5）。応答は再設定と同じ形 */
export const requestLoginIdRecovery = async (
  input: { email: string; lang: 'ja' | 'zh' },
  deps: Deps = {},
): Promise<{ message: string }> => {
  const doFetch = deps.fetchFn ?? fetch;
  const fallback = input.lang === 'zh'
    ? '已确认登记状况，如果符合条件，我们已发送邮件。'
    : '登録状況を確認し、該当する場合はメールを送信しました。';
  try {
    const res = await doFetch(`${deps.baseUrl ?? ''}/api/ai-course/auth/recover-id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input.email, lang: input.lang }),
    });
    const body = await res.json().catch(() => ({})) as { message?: string };
    return { message: body.message ?? fallback };
  } catch {
    return { message: fallback };
  }
};

/** 新しいパスワードの適用（再設定リンクから戻ってきた画面で使う） */
export const applyNewPassword = async (newPassword: string): Promise<{ ok: boolean }> => {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  return { ok: !error };
};
