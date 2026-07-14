import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_FAILS = 10;          // これ以上の連続失敗でロック
const LOCK_MINUTES = 15;       // ロック時間（自動解除）
const WINDOW_MINUTES = 15;     // 失敗カウントのリセット窓
const OTP_TTL_MINUTES = 10;    // メールOTPの有効時間
const OTP_MAX_ATTEMPTS = 5;    // OTP誤入力の上限

const sha256 = async (s: string) => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const RESEND = Deno.env.get("RESEND_API_KEY");
  const db = {
    apikey: SERVICE,
    Authorization: `Bearer ${SERVICE}`,
    "Content-Type": "application/json",
  };

  try {
    const body = await req.json();
    const action = body.action ?? "login";

    // ───────── OTP検証（管理者の2段階目） ─────────
    if (action === "verify") {
      const { challenge_id, code } = body;
      if (!challenge_id || !code) return json({ error: "コードを入力してください" }, 400);

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/admin_login_challenges?id=eq.${challenge_id}&select=*`,
        { headers: db },
      );
      const ch = (await res.json())?.[0];
      if (!ch || ch.consumed_at) return json({ error: "セッションが無効です。最初からやり直してください。" }, 400);
      if (new Date(ch.expires_at) < new Date()) return json({ error: "コードの有効期限が切れました。もう一度ログインしてください。" }, 400);
      if (ch.attempts >= OTP_MAX_ATTEMPTS) return json({ error: "試行回数の上限に達しました。もう一度ログインしてください。" }, 429);

      if (await sha256(String(code)) !== ch.code_hash) {
        await fetch(`${SUPABASE_URL}/rest/v1/admin_login_challenges?id=eq.${challenge_id}`, {
          method: "PATCH", headers: db, body: JSON.stringify({ attempts: ch.attempts + 1 }),
        });
        return json({ error: "コードが正しくありません。", remaining: OTP_MAX_ATTEMPTS - ch.attempts - 1 }, 401);
      }

      // 検証成功 → チャレンジを消費し、保持していたセッションを返す
      await fetch(`${SUPABASE_URL}/rest/v1/admin_login_challenges?id=eq.${challenge_id}`, {
        method: "PATCH", headers: db, body: JSON.stringify({ consumed_at: new Date().toISOString() }),
      });
      return json({ session: ch.session });
    }

    // ───────── ログイン（パスワード検証 + ロック） ─────────
    const { email, password } = body;
    if (!email || !password) return json({ error: "メールアドレスとパスワードを入力してください" }, 400);
    const emailKey = String(email).toLowerCase().trim();

    // ロック状態を確認
    const laRes = await fetch(
      `${SUPABASE_URL}/rest/v1/login_attempts?email=eq.${encodeURIComponent(emailKey)}&select=*`,
      { headers: db },
    );
    const la = (await laRes.json())?.[0];
    if (la?.locked_until && new Date(la.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(la.locked_until).getTime() - Date.now()) / 60000);
      return json({ error: `ログイン試行が多すぎます。約${mins}分後にもう一度お試しください。`, locked: true }, 429);
    }

    // GoTrue でパスワード検証
    const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailKey, password }),
    });
    const token = await tokenRes.json();

    if (!tokenRes.ok || !token.access_token) {
      // 失敗を記録し、必要ならロック
      const now = new Date();
      const windowExpired = la && (now.getTime() - new Date(la.first_fail_at).getTime()) > WINDOW_MINUTES * 60000;
      const failCount = (windowExpired || !la) ? 1 : la.fail_count + 1;
      const lockedUntil = failCount >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60000).toISOString() : null;
      const row = {
        email: emailKey,
        fail_count: failCount,
        first_fail_at: (windowExpired || !la) ? now.toISOString() : la.first_fail_at,
        locked_until: lockedUntil,
        updated_at: now.toISOString(),
      };
      await fetch(`${SUPABASE_URL}/rest/v1/login_attempts`, {
        method: "POST",
        headers: { ...db, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify(row),
      });
      if (lockedUntil) return json({ error: `ログイン試行が多すぎます。約${LOCK_MINUTES}分後にもう一度お試しください。`, locked: true }, 429);
      return json({ error: "メールアドレスまたはパスワードが間違っています" }, 401);
    }

    // 成功 → 失敗カウントをクリア
    await fetch(`${SUPABASE_URL}/rest/v1/login_attempts?email=eq.${encodeURIComponent(emailKey)}`, {
      method: "DELETE", headers: db,
    });

    const userId = token.user?.id;

    // 管理者かどうか判定
    const adminRes = await fetch(
      `${SUPABASE_URL}/rest/v1/site_admins?user_id=eq.${userId}&select=user_id`,
      { headers: db },
    );
    const isAdmin = ((await adminRes.json())?.length ?? 0) > 0;

    // 一般会員はそのままセッションを返す
    if (!isAdmin) return json({ session: token });

    // 管理者 → メールOTPを発行し、セッションはOTP検証後まで保留
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const chRes = await fetch(`${SUPABASE_URL}/rest/v1/admin_login_challenges`, {
      method: "POST",
      headers: { ...db, Prefer: "return=representation" },
      body: JSON.stringify({
        user_id: userId,
        email: emailKey,
        code_hash: await sha256(code),
        session: token,
        expires_at: new Date(Date.now() + OTP_TTL_MINUTES * 60000).toISOString(),
      }),
    });
    const challenge = (await chRes.json())?.[0];

    if (RESEND) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          to: [emailKey],
          subject: `【管理画面ログイン】認証コード: ${code}`,
          text: `管理画面へのログイン認証コードです。\n\n認証コード: ${code}\n\n${OTP_TTL_MINUTES}分以内に入力してください。\n心当たりがない場合は、誰かがあなたのパスワードを知っている可能性があります。パスワードを変更してください。`,
        }),
      });
    }

    return json({ needs_otp: true, challenge_id: challenge.id, sent_to: emailKey });
  } catch (e) {
    console.error("login-guard error:", e.message);
    return json({ error: "ログイン処理でエラーが発生しました" }, 500);
  }
});
