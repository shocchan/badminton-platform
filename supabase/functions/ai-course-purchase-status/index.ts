// AIコース セルフサービス決済: 購入状態の照会（決済完了ページ用）。
//
// session_id（Stripeが発行する推測不能なトークン。購入者のブラウザだけが知る）を鍵に、
// 台帳の状態と発行済みログインIDを返す。**パスワードは絶対に返さない**（メールのみ）。
//
// デプロイ（CEO承認後）:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy \
//     ai-course-purchase-status --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return json({ error: "invalid_session" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ai_plan_purchases?stripe_session_id=eq.${encodeURIComponent(sessionId)}` +
        `&select=status,login_id,plan_id,locale,buyer_email`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!res.ok) return json({ status: "unknown" });
    const row = (await res.json())?.[0];
    if (!row) return json({ status: "unknown" });

    // メールアドレスは伏せ字で（本人の画面にだけ出る想定だが、値そのものは返さない）
    const maskedEmail = typeof row.buyer_email === "string" && row.buyer_email.includes("@")
      ? `${row.buyer_email.slice(0, 2)}***@${row.buyer_email.split("@")[1]}`
      : null;

    return json({
      status: row.status,
      planId: row.plan_id,
      locale: row.locale,
      loginId: row.status === "provisioned" ? row.login_id : null,
      maskedEmail,
    });
  } catch (e) {
    console.error("ai-course-purchase-status error:", e);
    return json({ status: "unknown" }, 200);
  }
});
