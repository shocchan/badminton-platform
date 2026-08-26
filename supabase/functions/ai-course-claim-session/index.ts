// AIコース: 購入直後の自動ログイン（session_id → 一回きりのログイン用トークン）。
//
// 【なぜ要るか】
// 実データで、受講権を持つ12人のうち**7人が一度もセッションを開始していない**。
// 購入完了画面がログインIDだけを出し、初期パスワードはメールで送っていたため、
// 買った直後に「メールを開いて探して戻る」という離脱が挟まっていた。
// いちばん学習意欲が高い瞬間を、メールアプリに渡してしまっていた。
//
// 【方式】
// Supabase Admin API の generate_link（type=magiclink）で **hashed_token** を作り、
// クライアントが supabase.auth.verifyOtp({ token_hash, type:'magiclink' }) で
// セッションに交換する。Supabase が正式に用意している経路で、
//   - パスワードは生成も返却もしない（既存の初期パスワードにも触れない）
//   - トークンはURLにもログにも残さない（POSTのレスポンスのみ）
//   - Supabase 側で単回・短命
//
// 【誰が使えるか】
// Stripe の session_id を知っている人だけ。これは購入者のブラウザだけが持つ推測不能な値だが、
// URLを共有されたら他人が奪えるので、さらに2つ絞る:
//   ① 使い切り（ai_plan_purchases.login_claimed_at が非nullなら二度目は出さない）
//   ② 発行から CLAIM_WINDOW_MIN 分以内（購入直後の導線以外では使えない）
// どちらかを外れたら、通常のログイン画面（メールの初期パスワード）へ案内する。
//
// デプロイ:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy \
//     ai-course-claim-session --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** 発行から何分まで自動ログインを許すか。購入直後の導線だけで使う想定 */
const CLAIM_WINDOW_MIN = 60;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const { sessionId } = await req.json().catch(() => ({}));
    if (typeof sessionId !== "string" || !/^cs_(test|live)_[A-Za-z0-9_]+$/.test(sessionId)) {
      return json({ ok: false, reason: "invalid_session" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!supabaseUrl || !serviceKey) return json({ ok: false, reason: "not_configured" }, 503);

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // ── 購入台帳から本人を特定する ──
    const rowRes = await fetch(
      `${supabaseUrl}/rest/v1/ai_plan_purchases?stripe_session_id=eq.${encodeURIComponent(sessionId)}` +
        `&select=id,status,user_id,login_id,provisioned_at,login_claimed_at`,
      { headers: dbHeaders },
    );
    if (!rowRes.ok) return json({ ok: false, reason: "unavailable" }, 503);
    const row = (await rowRes.json())?.[0];
    if (!row) return json({ ok: false, reason: "not_found" }, 404);

    // 発行が終わっていなければ、まだ交換できない（画面側は待ってから再試行する）
    if (row.status !== "provisioned" || !row.user_id) {
      return json({ ok: false, reason: "not_ready" }, 409);
    }
    // 使い切り。二度目は通常ログインへ
    if (row.login_claimed_at) {
      return json({ ok: false, reason: "already_claimed" }, 409);
    }
    // 購入直後の導線でだけ使う
    const provisionedAt = row.provisioned_at ? Date.parse(row.provisioned_at) : NaN;
    if (!Number.isFinite(provisionedAt) || Date.now() - provisionedAt > CLAIM_WINDOW_MIN * 60_000) {
      return json({ ok: false, reason: "expired" }, 410);
    }

    // ── 本人の内部メールを取得（login_id からは組み立てず、Authの実値を使う） ──
    const userRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${row.user_id}`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!userRes.ok) return json({ ok: false, reason: "user_unavailable" }, 503);
    const email: string = (await userRes.json())?.email ?? "";
    if (!email) return json({ ok: false, reason: "user_unavailable" }, 503);

    // ── 使い切りの印を**先に**立てる（発行してから失敗しても再利用させない） ──
    const claimRes = await fetch(
      `${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${row.id}&login_claimed_at=is.null`,
      {
        method: "PATCH",
        headers: { ...dbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ login_claimed_at: new Date().toISOString() }),
      },
    );
    if (!claimRes.ok) return json({ ok: false, reason: "unavailable" }, 503);
    // 条件付きUPDATEが0行＝ほぼ同時の二重リクエスト。後勝ちにしない
    const claimed = await claimRes.json().catch(() => []);
    if (!Array.isArray(claimed) || claimed.length === 0) {
      return json({ ok: false, reason: "already_claimed" }, 409);
    }

    // ── ログイン用トークンを発行（Supabaseの正規経路。パスワードは扱わない） ──
    const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email }),
    });
    if (!linkRes.ok) {
      console.error("generate_link failed:", linkRes.status);
      return json({ ok: false, reason: "link_failed" }, 502);
    }
    const link = await linkRes.json();
    // Supabase は properties.hashed_token（新しめ）か直下 hashed_token を返す
    const tokenHash: string | null =
      link?.properties?.hashed_token ?? link?.hashed_token ?? null;
    if (!tokenHash) {
      console.error("generate_link: no hashed_token in response");
      return json({ ok: false, reason: "link_failed" }, 502);
    }

    // loginId は画面に控えとして出す（メールが届かない人の保険）。パスワードは返さない
    return json({ ok: true, tokenHash, loginId: row.login_id ?? null });
  } catch (e) {
    console.error("ai-course-claim-session error:", e);
    return json({ ok: false, reason: "internal" }, 500);
  }
});
