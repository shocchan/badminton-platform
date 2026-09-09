// Friends Beta の1枠を発行する（2026-09-09 P1-4）。
//
// CEOが管理画面のボタンを押すと、この関数が
//   1. 学習用のアカウントを作る（内部メールのみ。実メール・氏名・カードは要らない）
//   2. 30日間の受講権（plan_id='friends-beta'）を付ける
//   3. 学習コードを1本発行する
// を1回で済ませ、**WeChatにそのまま貼れるURL**を返す。
//
// 【個人情報】
// 実メールも氏名も受け取らない。label は用途メモで、PIIを入れない運用にする。
// 内部メールは `beta-<乱数>@id.badminton-platform.pages.dev`（MXなし＝実際には届かない）。
//
// 【誰が呼べるか】
// 管理者だけ。verify_jwt を有効にしたうえで、さらに ai_admins に載っているかを確かめる。
//
// デプロイ（**verify_jwt は既定のまま＝有効**）:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy \
//     ai-course-beta-invite --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const ID_DOMAIN = "id.badminton-platform.pages.dev";

/** 表示用に4桁ずつ区切る（src/lib/aiLesson/course/learningCode.ts と同じ形） */
const formatCode = (raw: string): string => (raw.match(/.{1,4}/g) ?? []).join("-");

const randomHex = (bytes: number): string =>
  [...crypto.getRandomValues(new Uint8Array(bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) return json({ ok: false, code: "not_configured" }, 503);

  const dbHeaders = {
    apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json",
  };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: dbHeaders, body: JSON.stringify(args),
    });
    if (!res.ok) {
      console.error(`rpc ${fn} failed:`, res.status);
      return null;
    }
    return await res.json().catch(() => null);
  };

  // ── 管理者かどうか（verify_jwt に加えて、こちらでも確かめる） ──
  const bearer = req.headers.get("Authorization") ?? "";
  if (!bearer.startsWith("Bearer ")) return json({ ok: false, code: "forbidden" }, 401);
  const meRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: bearer },
  });
  if (!meRes.ok) return json({ ok: false, code: "forbidden" }, 401);
  const meEmail: string = (await meRes.json())?.email ?? "";
  const isAdmin = await rpc("ai_service_is_admin_email", { p_email: meEmail });
  if (isAdmin !== true) return json({ ok: false, code: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const label = typeof body?.label === "string" ? body.label.slice(0, 60) : "";
  const lang: "ja" | "zh" = body?.lang === "ja" ? "ja" : "zh";

  // ── 席数の上限（設定値。予算のガードは画面側で出す＝人が判断する） ──
  const cfgRes = await fetch(
    `${supabaseUrl}/rest/v1/ai_config?key=eq.friends_beta&select=value`, { headers: dbHeaders },
  );
  const cfg = cfgRes.ok ? (await cfgRes.json())?.[0]?.value ?? {} : {};
  const days = Number(cfg?.days ?? 30);
  const maxSeats = Number(cfg?.maxSeats ?? 100);
  const planId = String(cfg?.planId ?? "friends-beta");

  const seatRes = await fetch(
    `${supabaseUrl}/rest/v1/ai_course_access?plan_id=eq.${encodeURIComponent(planId)}&select=user_id`,
    { headers: { ...dbHeaders, Prefer: "count=exact" } },
  );
  const seatsUsed = seatRes.ok ? ((await seatRes.json()) as unknown[]).length : 0;
  if (seatsUsed >= maxSeats) {
    return json({ ok: false, code: "seats_full", seatsUsed, maxSeats }, 409);
  }

  // ── アカウントを作る（実メールは受け取らない） ──
  const internalEmail = `beta-${randomHex(6)}@${ID_DOMAIN}`;
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: internalEmail,
      // パスワードは作るが**どこにも返さない**。入口は学習コードだけ
      password: randomHex(24),
      email_confirm: true,
      user_metadata: { source: "friends_beta", label },
    }),
  });
  if (!createRes.ok) {
    console.error("beta user create failed:", createRes.status);
    return json({ ok: false, code: "create_failed" }, 502);
  }
  const userId: string = (await createRes.json())?.id ?? "";
  if (!userId) return json({ ok: false, code: "create_failed" }, 502);

  // ── 受講権（30日） ──
  const grant = await rpc("ai_service_grant_beta_access", { p_user_id: userId, p_days: days });
  if (!grant || grant.ok !== true) {
    console.error("beta grant failed for", userId);
    return json({ ok: false, code: "grant_failed" }, 500);
  }

  // ── 学習コード ──
  const issued = await rpc("ai_service_issue_learning_code", { p_user_id: userId, p_label: label || "friends beta" });
  if (!issued || issued.ok !== true || typeof issued.raw !== "string") {
    console.error("beta code failed for", userId);
    return json({ ok: false, code: "code_failed" }, 500);
  }

  const code = formatCode(issued.raw);
  return json({
    ok: true,
    userId,
    code,
    url: `https://study.kawabado.com/${lang}/learn/${code}`,
    validUntil: grant.validUntil,
    days,
    seatsUsed: seatsUsed + 1,
    maxSeats,
  });
});
