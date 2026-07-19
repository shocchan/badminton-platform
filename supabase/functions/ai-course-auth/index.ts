// AI日本語コース: 招待コード検証つき OTP 送信
//
// フロントは supabase.auth.signInWithOtp を直接呼ばない。必ずこの関数を通す。
//   - 初回:  { code, email } → 招待コードをDBで検証 → grant発行 → OTP送信（ユーザー作成あり）
//   - 継続:  { email }       → 既にlearnerがある場合のみ OTP送信（ユーザー作成なし）
//
// これにより:
//   - 招待コードを知らない人は grant を得られず、ai_learners のINSERTポリシーで弾かれる
//   - 招待コード検証前にOTPを大量送信できない（ai_check_otp_throttle）
//   - 招待コードはブラウザのバンドルに一切含まれない
//
// セキュリティ:
//   - 招待コード・メールアドレス・service_role キーはログへ出さない
//   - 失敗理由は安全なエラーコードのみ返す（内部情報・Supabaseの生メッセージは返さない）
//
// デプロイ: supabase functions deploy ai-course-auth --no-verify-jwt
// （初回ログイン前でJWTが無いため verify-jwt は付けない。ゲートは招待コード＋スロットル）

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const clean = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** DBのRPCを service_role で呼ぶ */
const rpc = async (url: string, key: string, fn: string, args: Record<string, unknown>) => {
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) return null;
  return await res.json();
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !serviceKey || !anonKey) {
    return json(503, { error: "not_configured" });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const email = clean(body.email, 254)?.toLowerCase();
  const code = clean(body.code, 128); // 任意（継続ログイン時は無し）
  if (!email || !EMAIL_RE.test(email)) {
    return json(400, { error: "invalid_email" });
  }

  // ── 1. このメールがOTPを受け取ってよいか判定 ──
  let createUser = false;
  const known = await rpc(url, serviceKey, "ai_email_has_learner", { p_email: email });

  if (known === true) {
    // 既存の受講者 → 招待コードなしで再ログイン可
    createUser = false;
  } else if (code) {
    const redeemed = await rpc(url, serviceKey, "ai_redeem_invite", { p_code: code, p_email: email });
    if (!redeemed || redeemed.ok !== true) {
      // 招待コードの誤り理由は詳細を返しすぎない（総当たりのヒントにしない）
      return json(403, { error: "invalid_invite" });
    }
    createUser = true;
  } else {
    // 未登録かつ招待コードなし → 登録も送信もしない
    return json(403, { error: "invalid_invite" });
  }

  // ── 2. 送信スロットル（60秒間隔・1時間上限）──
  const throttle = await rpc(url, serviceKey, "ai_check_otp_throttle", { p_email: email });
  if (!throttle || throttle.ok !== true) {
    return json(429, {
      error: throttle?.code ?? "otp_cooldown",
      retryAfter: throttle?.retryAfter ?? 60,
    });
  }

  // ── 3. OTP送信（Supabase Auth） ──
  const otpRes = await fetch(`${url}/auth/v1/otp`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, create_user: createUser }),
  });

  if (!otpRes.ok) {
    // Supabaseの生メッセージ（レート制限文言・内部情報）はそのまま返さない
    const status = otpRes.status === 429 ? 429 : 502;
    return json(status, { error: status === 429 ? "otp_cooldown" : "otp_send_failed", retryAfter: 60 });
  }

  return json(200, { ok: true, cooldownSeconds: 60 });
});
