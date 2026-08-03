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
import { defaultAdvProfile } from '../src/lib/aiLesson/course/adventure/advProfile';

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
  env: AdminEnv, path: string, method: string, body?: unknown, prefer = 'return=representation',
): Promise<{ ok: boolean; status: number; text: string }> => {
  const res = await fetch(`${env.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ''}`,
      'Content-Type': 'application/json',
      Prefer: prefer,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
  const newLoginId = canonicalLoginId(generateLoginId((max) => {
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
  //
  // 1人につき1つのログインID（user_id に一意制約）。
  // **同じ生徒へ再発行するときは、IDを変えずパスワードだけ新しくする。**
  // 「パスワードを無くした」で作り直すたびIDが変わると、
  // 生徒が控えたIDが使えなくなり、古いIDの問い合わせも増える。
  const existingRes = await rest(
    env, `/rest/v1/ai_course_logins?user_id=eq.${userId}&select=login_id&limit=1`, 'GET',
  );
  let loginId = newLoginId;
  try {
    const prev = (JSON.parse(existingRes.text) as { login_id: string }[])[0]?.login_id;
    if (prev) loginId = prev;
  } catch { /* 無ければ新規のIDを使う */ }

  const logins = await rest(env, '/rest/v1/ai_course_logins', 'POST', {
    login_id: loginId, user_id: userId, email, account_purpose: purpose, is_active: true,
    // 一時ロック中でも、先生が発行し直したら入れるようにする
    locked_until: null,
  }, 'return=minimal,resolution=merge-duplicates');
  if (!logins.ok) {
    log('login row failed', { status: logins.status });
    return json({ error: 'login_row_failed' }, 500);
  }

  // ── 学習者 ──
  //
  // **発行した生徒は最初から冒険（V2）で始める。**
  // `?v2=1` と「冒険モードV2（ベータ）を始めますか？」の入場画面は、
  // 旧コースの既存learnerを勝手に移行しないための入口。
  // ここで作る生徒には旧コースの学習データが無いので、通す意味がないうえ、
  // 通すと旧コースのホーム（ナビ5項目）に着地してしまう。
  const nowISO = new Date().toISOString();

  // **既に学習している生徒の settings を上書きしない。**
  // パスワードを無くした生徒への再発行でも通る道なので、ここで既定値を書くと
  // 診断・攻略ルート・定着の記録が消える。既存なら触らない。
  const priorRes = await rest(
    env, `/rest/v1/ai_learners?user_id=eq.${userId}&select=id,settings&limit=1`, 'GET',
  );
  interface PriorLearner { id: string; settings?: { adventureV2?: { enabled?: boolean } } }
  let prior: PriorLearner | null = null;
  try { prior = (JSON.parse(priorRes.text) as PriorLearner[])[0] ?? null; } catch { prior = null; }

  if (!prior) {
    // 新規。冒険（V2）で始める（`?v2=1` の入場画面は旧learnerを勝手に移行しない
    // ための入口で、学習データが無いこの生徒には通す意味がない）
    const created = await rest(env, '/rest/v1/ai_learners', 'POST', {
      user_id: userId, display_name: displayName, preferred_language: 'ja',
      estimated_level: level, difficulty_level: 2, current_week: 1, is_active: true,
      hearing: {}, settings: { adventureV2: { ...defaultAdvProfile(nowISO), enabled: true } },
      admin_overrides: {},
    }, 'return=minimal');
    if (!created.ok) {
      log('learner create failed', { status: created.status });
      return json({ error: 'learner_failed' }, 500);
    }
  } else if (prior.settings?.adventureV2?.enabled !== true) {
    // 既存だが冒険が無効。**印だけ**立てる（他の学習データはそのまま）
    await rest(env, `/rest/v1/ai_learners?id=eq.${prior.id}`, 'PATCH', {
      settings: {
        ...(prior.settings ?? {}),
        adventureV2: { ...defaultAdvProfile(nowISO), ...(prior.settings?.adventureV2 ?? {}), enabled: true },
      },
      is_active: true, updated_at: nowISO,
    }, 'return=minimal');
  }

  // 利用権は learner_id で持つ（user_id ではない）
  const learnerRes = await rest(env, `/rest/v1/ai_learners?user_id=eq.${userId}&select=id&limit=1`, 'GET');
  let learnerId: string | null;
  try { learnerId = (JSON.parse(learnerRes.text) as { id: string }[])[0]?.id ?? null; } catch { learnerId = null; }
  if (!learnerId) {
    log('learner lookup failed', { status: learnerRes.status });
    return json({ error: 'learner_failed' }, 500);
  }

  // ── 利用権（期間制。開始日から months か月） ──
  //
  // 台帳は「購入 → 利用権」の2段。利用権は purchase_id を必ず持つ（一意制約が
  // 二重付与の最終防波堤）ので、決済を通していない発行でも購入行を1つ作る。
  // amount: 0 は「この発行では課金していない」という記録そのもの。
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + months);
  const orderId = `issued-${learnerId}-${start.toISOString().slice(0, 10)}-${planId}`;

  const purchase = await rest(env, '/rest/v1/ai_plan_purchases', 'POST', {
    order_id: orderId, plan_id: planId, plan_version: 1, amount: 0, currency: 'JPY',
    email, lang: 'ja', terms_version: 'issued-by-teacher', gateway_id: 'manual',
    reference: purpose, status: 'granted', learner_id: learnerId,
  }, 'return=minimal,resolution=merge-duplicates');
  if (!purchase.ok) {
    log('purchase row failed', { status: purchase.status });
    return json({ error: 'entitlement_failed' }, 500);
  }

  const ent = await rest(env, '/rest/v1/ai_plan_entitlements', 'POST', {
    id: orderId, learner_id: learnerId, plan_id: planId, plan_version: 1,
    purchase_id: orderId,
    granted_at: start.toISOString(),
    expires_at: end.toISOString(),
    // 期間制なので時間の上限は付けない（active_seconds = null）
    active_seconds: null,
    period_ends_at: end.toISOString(),
    status: 'active',
  }, 'return=minimal,resolution=merge-duplicates');
  if (!ent.ok) {
    log('entitlement row failed', { status: ent.status });
    return json({ error: 'entitlement_failed' }, 500);
  }

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
