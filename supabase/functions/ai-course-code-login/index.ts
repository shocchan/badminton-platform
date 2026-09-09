// 学習コードでログインする（2026-09-09 P0-2）。
//
// 【何を解くか】
// 学習者に ID とパスワードの2つを覚えさせるのをやめる。渡すのは
//   ・個人専用URL（study.kawabado.com/zh/learn/XXXX-XXXX-XXXX）をタップする
//   ・またはログイン画面でコードを1つ入力する
// のどちらか。どちらも中身は同じ1本の値。
//
// 【方式】
// ai-course-claim-session と同じ、Supabase が用意している正規の経路を使う:
//   admin/generate_link（type=magiclink）で hashed_token を作り、
//   クライアントが supabase.auth.verifyOtp({ token_hash, type:'magiclink' }) でセッションに換える。
//   - パスワードは生成も返却もしない（既存のID＋パスワードにも触れない）
//   - トークンは POST のレスポンスだけ。URLにもログにも残さない
//   - Supabase 側で単回・短命
//
// 【安全側の作り】
//   - コードの平文はDBに無い。照合は sha256 のハッシュだけで行う
//   - 失敗理由は1種類しか返さない（存在しないのか失効なのかを教えない）
//   - IPごとに15分10回で止める。IPは生で保存せず sha256 にする
//   - 試行は成功・失敗・遮断のすべてを記録する（入力されたコードは残さない）
//
// デプロイ（**--no-verify-jwt 必須**。ログイン前なのでJWTが無い）:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy \
//     ai-course-code-login --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const sha256Hex = async (s: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};

/** 大文字化して英数字以外を落とす。DB側の ai_normalize_learning_code と同じ規則 */
const normalize = (raw: string): string => raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** 発行しているコードの形（30文字集合・12桁）。ここで弾けるものはDBまで行かせない */
const CODE_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{12}$/;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, code: "not_configured" }, 503);

  const dbHeaders = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: dbHeaders, body: JSON.stringify(args),
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  };

  // 接続元。生IPは保存しない（ハッシュだけ）
  const rawIp = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await sha256Hex(rawIp);

  const record = (ok: boolean, reason: string) =>
    rpc("ai_code_login_record", { p_ip_hash: ipHash, p_ok: ok, p_reason: reason })
      .catch(() => null);

  /** 失敗の返し方は1つだけ。存在しないのか失効なのかを外から見分けさせない */
  const deny = async (reason: string) => {
    await record(false, reason);
    return json({ ok: false, code: "invalid_code" }, 401);
  };

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, code: "invalid_code" }, 400);
  }

  const raw = typeof body.code === "string" ? body.code : "";
  if (raw.length > 64) return await deny("too_long");
  const code = normalize(raw);
  if (!CODE_RE.test(code)) return await deny("bad_format");

  // ── 総当たり対策（形式が正しいものだけ数える＝いたずらで正規利用者を止めない） ──
  const throttle = await rpc("ai_code_login_throttle", { p_ip_hash: ipHash });
  if (!throttle || throttle.ok !== true) {
    await record(false, "throttled");
    return json({ ok: false, code: "too_many_attempts", retryAfter: throttle?.retryAfter ?? 900 }, 429);
  }

  // ── 照合（平文は送らない。ハッシュで引く） ──
  const hash = await sha256Hex(code);
  const found = await rpc("ai_resolve_learning_code", { p_code_hash: hash });
  if (!found || found.ok !== true || typeof found.userId !== "string") {
    return await deny(found?.code === "revoked" ? "revoked" : "not_found");
  }

  // ── 本人の内部メールを取り出す（コードからは組み立てない。Authの実値を使う） ──
  const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${found.userId}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!userRes.ok) {
    await record(false, "user_unavailable");
    return json({ ok: false, code: "unavailable" }, 503);
  }
  const email: string = (await userRes.json())?.email ?? "";
  if (!email) {
    await record(false, "no_email");
    return json({ ok: false, code: "unavailable" }, 503);
  }

  // ── セッション交換用のトークンを発行（Supabaseの正規経路。パスワードは扱わない） ──
  const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!linkRes.ok) {
    console.error("generate_link failed:", linkRes.status);
    await record(false, "link_failed");
    return json({ ok: false, code: "unavailable" }, 502);
  }
  const link = await linkRes.json();
  const tokenHash: string | null = link?.properties?.hashed_token ?? link?.hashed_token ?? null;
  if (!tokenHash) {
    console.error("generate_link: no hashed_token");
    await record(false, "no_token");
    return json({ ok: false, code: "unavailable" }, 502);
  }

  await record(true, "ok");
  return json({ ok: true, tokenHash });
});
