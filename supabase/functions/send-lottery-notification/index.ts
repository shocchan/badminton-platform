// 抽選当選時の管理者向けメール通知（Resend経由）
// rally-lottery から service_role で invoke される。
// デプロイ: SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy send-lottery-notification --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "info@kawabado.com";

interface NotificationRequest {
  deviceUuid: string;
  prizeType: "ramen" | "badminton";
  prizeLabel: string;
  rallyCount: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");

    const { deviceUuid, prizeType, prizeLabel, rallyCount }: NotificationRequest = await req.json();
    if (!deviceUuid || !prizeLabel) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emoji = prizeType === "ramen" ? "🍜" : "🏸";
    const subject = `${emoji}【当選通知】バド対決ゲームで${prizeLabel}が当たりました`;
    const body = [
      "kawabado.com のバド対決ゲームで当選が出ました。",
      "",
      `■ 景品: ${prizeLabel}`,
      `■ 達成ラリー数: ${rallyCount}ラリー`,
      `■ 端末ID: ${deviceUuid}`,
      `■ 日時: ${new Date().toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}`,
      "",
      "当選者が会員登録してクーポンを受け取ると、",
      "管理画面 → 登録者管理 のクーポン欄に表示されます。",
      "消込も同じ画面のバッジクリックで行えます。",
      "",
      "管理画面: https://kawabado.com/ja/admin",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "川口・蕨バド交流会 <noreply@kawabado.com>",
        to: [ADMIN_EMAIL],
        subject,
        text: body,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Resend error ${res.status}: ${detail}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[send-lottery-notification] error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
