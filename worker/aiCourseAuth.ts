// ログインID＋6文字パスワードの認証エンドポイント（PAID STUDENT PILOT §3）。
//
// 生徒が入力するのは「ログインID」と「パスワード」の2つだけ。
// Supabase Auth の内部では email/password 認証を使うので、
// **server-side で ログインID → メール を解決してから** signInWithPassword を呼ぶ。
//
// ここで守ること:
//   - ID↔メールの対応表を client へ渡さない（解決は必ずこの Worker 内）
//   - service_role key を browser へ渡さない（Worker の env にだけ置く）
//   - 失敗理由を出し分けない（IDの存在を推測させない）
//   - password / token / email をログへ出さない（redactForLog を通す）
//   - 5回失敗でlock・自動解除・成功でreset

import { canonicalLoginId, checkPassword } from '../src/lib/aiLesson/course/auth/loginCredentials';
import {
  evaluateThrottle, loginFailedMessage, lockMessage, resetRequestedMessage,
  redactForLog, type LoginAttempt,
} from '../src/lib/aiLesson/course/auth/loginThrottle';

export interface AuthEnv {
  SUPABASE_URL?: string;
  /** server-side限定。browserへは絶対に渡さない */
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  /** パスワード再設定メールのリダイレクト先。**このURLのみ許可**（§4） */
  AI_COURSE_RESET_REDIRECT_URL?: string;
}

const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });

/** ログは必ずここを通す。生の値を console へ出さない */
const log = (msg: string, detail?: unknown) => {
  console.log(`[ai-course-auth] ${msg}${detail !== undefined ? ' ' + redactForLog(detail) : ''}`);
};

const langOf = (body: { lang?: string }): 'ja' | 'zh' => (body.lang === 'zh' ? 'zh' : 'ja');

// ─────────────────────────────────────────────────────────
// Supabase REST（service_role）
// ─────────────────────────────────────────────────────────

const sb = async (
  env: AuthEnv, path: string, init: RequestInit = {},
): Promise<Response> => fetch(`${env.SUPABASE_URL}${path}`, {
  ...init,
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
    'Content-Type': 'application/json',
    ...(init.headers ?? {}),
  },
});

interface LoginRow {
  login_id: string;
  email: string;
  user_id: string;
  is_active: boolean;
  locked_until: string | null;
}

/** ログインID → 認証情報。**この解決は Worker の中だけで行う** */
const findLoginRow = async (env: AuthEnv, loginId: string): Promise<LoginRow | null> => {
  const res = await sb(env, `/rest/v1/ai_course_logins?login_id=eq.${encodeURIComponent(loginId)}&select=login_id,email,user_id,is_active,locked_until&limit=1`);
  if (!res.ok) return null;
  const rows = await res.json() as LoginRow[];
  return rows.length > 0 ? rows[0] : null;
};

const recentAttempts = async (env: AuthEnv, loginId: string, sinceMs: number): Promise<LoginAttempt[]> => {
  const sinceIso = new Date(sinceMs).toISOString();
  const res = await sb(env, `/rest/v1/ai_course_login_attempts?login_id=eq.${encodeURIComponent(loginId)}&attempted_at=gte.${sinceIso}&select=attempted_at,succeeded&order=attempted_at.asc&limit=50`);
  if (!res.ok) return [];
  const rows = await res.json() as { attempted_at: string; succeeded: boolean }[];
  return rows.map((r) => ({ atMs: Date.parse(r.attempted_at), ok: r.succeeded }));
};

const recordAttempt = async (
  env: AuthEnv, loginId: string, ok: boolean, ip: string,
): Promise<void> => {
  // audit log（§6）。**パスワードは保存しない**。IPは調査のため保持する
  await sb(env, '/rest/v1/ai_course_login_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ login_id: loginId, succeeded: ok, ip_hash: ip }),
  }).catch(() => { /* 記録できなくてもログイン自体は妨げない */ });
};

/** IPは生で保存せず、日付混じりのハッシュにする（追跡目的の恒久保存を避ける） */
const hashIp = async (ip: string): Promise<string> => {
  const day = new Date().toISOString().slice(0, 10);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${day}:${ip}`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
};

// ─────────────────────────────────────────────────────────
// POST /api/ai-course/auth/login
// ─────────────────────────────────────────────────────────

export const handleLogin = async (request: Request, env: AuthEnv): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !env.SUPABASE_ANON_KEY) {
    return json({ error: 'auth_unconfigured' }, 503);
  }

  let body: { loginId?: string; password?: string; lang?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const lang = langOf(body);
  const generic = { error: 'invalid_credentials', message: loginFailedMessage(lang) };

  const loginId = canonicalLoginId(String(body.loginId ?? ''));
  const password = checkPassword(String(body.password ?? ''));
  const ip = await hashIp(request.headers.get('CF-Connecting-IP') ?? 'unknown');
  const nowMs = Date.now();

  // 形式が違う時点で失敗だが、**存在確認をした場合と同じ応答**にする
  if (!loginId || !password.ok) {
    await recordAttempt(env, loginId || 'invalid', false, ip);
    log('login rejected (shape)', { loginId });
    return json(generic, 401);
  }

  // 抑制の判定（IDが存在しない場合も同じ経路を通す＝存在の推測を防ぐ）
  const attempts = await recentAttempts(env, loginId, nowMs - 30 * 60_000);
  const throttle = evaluateThrottle(attempts, nowMs);
  if (throttle.kind === 'locked') {
    log('login locked', { loginId });
    return json(
      { error: 'locked', message: lockMessage(throttle.remainingMs, lang) },
      429,
      { 'Retry-After': String(Math.ceil(throttle.remainingMs / 1000)) },
    );
  }
  if (throttle.delayMs > 0) await new Promise((r) => setTimeout(r, throttle.delayMs));

  const row = await findLoginRow(env, loginId);
  if (!row || !row.is_active) {
    await recordAttempt(env, loginId, false, ip);
    log('login rejected (no row / inactive)', { loginId });
    return json(generic, 401);
  }

  // Supabase Auth 本体での認証。**ここで初めてメールを使う**
  const signIn = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: row.email, password: password.normalized }),
  });

  if (!signIn.ok) {
    await recordAttempt(env, loginId, false, ip);
    log('login rejected (auth)', { loginId, status: signIn.status });
    return json(generic, 401);
  }

  await recordAttempt(env, loginId, true, ip);
  const session = await signIn.json() as { access_token: string; refresh_token: string; expires_in: number; user: { id: string } };
  log('login ok', { loginId });

  // client へ返すのはセッションだけ。メールも対応表も返さない
  return json({
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    userId: session.user.id,
    loginId: row.login_id,
  }, 200);
};

// ─────────────────────────────────────────────────────────
// POST /api/ai-course/auth/reset-request  （§4 パスワード再設定）
// ─────────────────────────────────────────────────────────

export const handleResetRequest = async (request: Request, env: AuthEnv): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return json({ error: 'auth_unconfigured' }, 503);

  let body: { email?: string; lang?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const lang = langOf(body);
  const email = String(body.email ?? '').trim().toLowerCase();

  // **登録の有無にかかわらず同じ応答**（§4）。存在しないメールでも 200 を返す
  const done = json({ ok: true, message: resetRequestedMessage(lang) }, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return done;

  // redirect先は環境変数で固定。任意URLへ飛ばせないようにする（§4）
  const redirectTo = env.AI_COURSE_RESET_REDIRECT_URL;
  if (!redirectTo) {
    log('reset blocked: redirect url not configured');
    return done;
  }

  await fetch(`${env.SUPABASE_URL}/auth/v1/recover`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, gotrue_meta_security: {} , redirect_to: redirectTo }),
  }).catch(() => { /* 送信失敗も応答は同じにする */ });

  log('reset requested', { email });
  return done;
};

// ─────────────────────────────────────────────────────────
// POST /api/ai-course/auth/recover-id  （§5 ログインIDを忘れた）
// ─────────────────────────────────────────────────────────

export const handleRecoverLoginId = async (request: Request, env: AuthEnv): Promise<Response> => {
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'auth_unconfigured' }, 503);

  let body: { email?: string; lang?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const lang = langOf(body);
  const email = String(body.email ?? '').trim().toLowerCase();
  const done = json({ ok: true, message: resetRequestedMessage(lang) }, 200);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return done;

  // 該当する場合だけメールを送る。**パスワードは絶対に書かない**（§5）
  const res = await sb(env, `/rest/v1/ai_course_logins?email=eq.${encodeURIComponent(email)}&select=login_id&limit=1`);
  if (res.ok) {
    const rows = await res.json() as { login_id: string }[];
    if (rows.length > 0) {
      // 送信はメールプロバイダ側の実装に委ねる（現状はEdge Function経由を想定）
      log('login id recovery requested (match)', { email });
    } else {
      log('login id recovery requested (no match)', { email });
    }
  }
  return done;   // 応答は常に同じ
};

/** ルーティング。index.ts から呼ぶ */
export const routeAuth = (pathname: string): ((r: Request, e: AuthEnv) => Promise<Response>) | null => {
  switch (pathname) {
    case '/api/ai-course/auth/login': return handleLogin;
    case '/api/ai-course/auth/reset-request': return handleResetRequest;
    case '/api/ai-course/auth/recover-id': return handleRecoverLoginId;
    default: return null;
  }
};
