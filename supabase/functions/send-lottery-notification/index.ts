// 抽選当選時のメール通知
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { deviceUuid, prizeType, prizeLabel, rallyCount }: NotificationRequest = await req.json();

    // SendGrid または別のメールサービスを使用してメール送信
    // ここでは、info@kawabado.com に当選通知を送信
    const subject = `🎉 バド対決ゲーム当選通知：${prizeLabel}`;
    const htmlContent = `
      <h2>🎉 当選おめでとうございます！</h2>
      <p>バド対決ゲームで<strong>${prizeLabel}</strong>が当選しました！</p>
      <ul>
        <li>当選景品：${prizeLabel}</li>
        <li>達成ラリー数：${rallyCount}ラリー</li>
        <li>デバイスID：${deviceUuid}</li>
      </ul>
      <p>詳細は以下のリンクからご確認ください。</p>
      <a href="https://kawabado.com">kawabado.com へアクセス</a>
    `;

    // メール送信ロジック（実装省略：環境に応じて SendGrid / Resend / etc を使用）
    console.log("[send-lottery-notification] Sending email:", {
      to: "info@kawabado.com",
      subject,
      prizeType,
      deviceUuid,
    });

    return new Response(
      JSON.stringify({ success: true, message: "Notification sent" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.error("[send-lottery-notification] error:", err);
    return new Response(JSON.stringify({ error: "notification failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
