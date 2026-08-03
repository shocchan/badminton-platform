// 先生（運営）が生徒アカウントを発行するためのエンドポイント（PAID STUDENT PILOT §10）。
//
// ここは**生徒には見せない運営用**。守ること:
//   - 管理パスフレーズを知らないと1バイトも動かない（env に置き、browser へは渡さない）
//   - service_role は Worker の中だけで使う
//   - ログインIDとパスワードは**この応答でだけ**返す（保存も再表示もしない）
//   - パスワードは Supabase Auth が hash して持つ。こちらの表には置かない
//   - 総当たり対策として、失敗した発行試行にも待ちを入れる

import {
  generatePasswordSecure, generateLoginId, canonicalLoginId,
} from '../src/lib/aiLesson/course/auth/loginCredentials';
import { redactForLog } from '../src/lib/aiLesson/course/auth/loginThrottle';

export interface AdminEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  /** 運営用の合言葉。**これが未設定なら発行口は存在しない（404）** */
  AI_COURSE_ADMIN_PASSPHRASE?: string;
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

const log = (msg: string, detail?: unknown) => {
  console.log(`[ai-course-admin] ${msg}${detail !== undefined ? ' ' + redactForLog(detail) : ''}`);
};

const sql = async (env: AdminEnv, query: string): Promise<{ ok: boolean; text: string }> => {
  // PostgREST 経由ではなく RPC 相当の直接SQLは使えないため、REST で組み立てる
  const res = await fetch(`${env.SUPABASE_URL}${query}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
    },
  });
  return { ok: res.ok, text: await res.text() };
};

const rest = async (
  env: AdminEnv, path: string, method: string, body: unknown, prefer = 'return=representation',
): Promise<{ ok: boolean; status: number; text: string }> => {
  const res = await fetch(`${env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
};

/**
 * POST /api/ai-course/admin/issue-student
 *
 * 入力: passphrase / email / displayName / purpose / planId / startDate / months
 * 出力: loginId・password（**この1回だけ**）
 */
export const handleIssueStudent = async (request: Request, env: AdminEnv): Promise<Response> => {
  // 合言葉が設定されていない環境では、この口は存在しないものとして扱う
  if (!env.AI_COURSE_ADMIN_PASSPHRASE) return json({ error: 'not_found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'admin_unconfigured' }, 503);

  let body: {
    passphrase?: string; email?: string; displayName?: string;
    purpose?: string; planId?: string; startDate?: string; months?: number; level?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }

  // 合言葉の照合。違うときは少し待たせてから同じ応答を返す（総当たりを鈍らせる）
  if (body.passphrase !== env.AI_COURSE_ADMIN_PASSPHRASE) {
    await new Promise((r) => setTimeout(r, 1500));
    log('issue rejected: bad passphrase');
    return json({ error: 'unauthorized' }, 401);
  }

  const email = String(body.email ?? '').trim().toLowerCase();
  const displayName = String(body.displayName ?? '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !displayName) {
    return json({ error: 'bad_request', message: 'メールアドレスと登録名が必要です。' }, 400);
  }

  const purpose = body.purpose === 'owner_pilot_test' ? 'owner_pilot_test' : 'paid_student';
  const planId = String(body.planId ?? 'six_month_coaching');
  const months = Number(body.months ?? 6);
  const startDate = String(body.startDate ?? new Date().toISOString().slice(0, 10));
  const level = String(body.level ?? 'N3');

  const password = generatePasswordSecure();
  const loginId = canonicalLoginId(generateLoginId((max) => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0] % max;
  }));

  // ── Auth ユーザー（メールは送らない。確認済み扱いで作る） ──
  const found = await sql(env, `/auth/v1/admin/users?filter=${encodeURIComponent(email)}`);
  let userId: string | null = null;
  if (found.ok) {
    try {
      userId = (JSON.parse(found.text).users ?? []).find((u: { email: string; id: string }) => u.email === email)?.id ?? null;
    } catch { /* 見つからない扱い */ }
  }

  if (userId) {
    const upd = await rest(env, `/auth/v1/admin/users/${userId}`, 'PUT',
      { password, email_confirm: true }, 'return=minimal');
    if (!upd.ok) return json({ error: 'user_update_failed' }, 500);
  } else {
    const created = await rest(env, '/auth/v1/admin/users', 'POST',
      { email, password, email_confirm: true });
    if (!created.ok) {
      log('user create failed', { status: created.status });
      return json({ error: 'user_create_failed' }, 500);
    }
    try { userId = JSON.parse(created.text).id; } catch { userId = null; }
  }
  if (!userId) return json({ error: 'user_create_failed' }, 500);

  // ── ログインIDの対応 ──
  const logins = await rest(env, '/rest/v1/ai_course_logins', 'POST', {
    login_id: loginId, user_id: userId, email, account_purpose: purpose, is_active: true,
  }, 'return=minimal,resolution=merge-duplicates');
  if (!logins.ok) {
    log('login row failed', { status: logins.status });
    return json({ error: 'login_row_failed' }, 500);
  }

  // ── 学習者 ──
  await rest(env, '/rest/v1/ai_learners', 'POST', {
    user_id: userId, display_name: displayName, preferred_language: 'ja',
    estimated_level: level, difficulty_level: 2, current_week: 1, is_active: true,
    hearing: {}, settings: {}, admin_overrides: {},
  }, 'return=minimal,resolution=merge-duplicates');

  // ── 利用権（期間制。開始日から months か月） ──
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  await rest(env, '/rest/v1/ai_course_entitlements', 'POST', {
    user_id: userId, plan_id: planId,
    starts_at: start.toISOString(), expires_at: end.toISOString(), is_active: true,
  }, 'return=minimal,resolution=merge-duplicates');

  log('student issued', { loginId, purpose });

  // **パスワードを返すのはこの1回だけ。** 保存も再表示もしない
  return json({
    loginId,
    password,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    planId,
    purpose,
  }, 200);
};

export const routeAdmin = (pathname: string): ((r: Request, e: AdminEnv) => Promise<Response>) | null =>
  pathname === '/api/ai-course/admin/issue-student' ? handleIssueStudent : null;
