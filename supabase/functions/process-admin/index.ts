import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "shodorannga@gmail.com";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;

    // service_role で RLS をバイパス
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, entry_id } = await req.json();

    if (!action || !entry_id) {
      return new Response(JSON.stringify({ error: "action and entry_id are required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
      });
    }

    // エントリーと大会情報を取得
    const { data: entry, error: fetchErr } = await supabase
      .from("entries")
      .select("*, tournaments(*)")
      .eq("id", entry_id)
      .single();

    if (fetchErr || !entry) {
      return new Response(JSON.stringify({ error: "Entry not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404,
      });
    }

    // ── 取消 ──
    if (action === "cancel") {
      const { error } = await supabase
        .from("entries")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", entry_id);

      if (error) throw error;

      // 管理者通知
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
          to: [ADMIN_EMAIL],
          subject: `【管理者取消】${entry.name}さんの申し込みを取り消しました`,
          text: `管理者操作による取消\n\nお名前：${entry.name}\nメール：${entry.email}\n大会：${entry.tournaments?.title ?? ""}`,
        }),
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    // ── 繰り上げ ──
    if (action === "promote") {
      const { error } = await supabase
        .from("entries")
        .update({ status: "confirmed" })
        .eq("id", entry_id);

      if (error) throw error;

      const t = entry.tournaments;
      const eventDate = t?.event_date
        ? new Date(t.event_date).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" })
        : "";
      const cancelLink = entry.cancel_token
        ? `${req.headers.get("origin") ?? "https://badminton-platform.pages.dev"}/cancel?token=${entry.cancel_token}`
        : undefined;

      const cancelBlock = cancelLink ? `
      <div style="margin-top:16px;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13px;color:#991b1b;font-weight:600;">❌ キャンセルについて</p>
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">キャンセル期限内であれば以下のリンクからお手続きできます。</p>
        <a href="${cancelLink}" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;text-decoration:none;">キャンセルする</a>
      </div>` : "";

      const html = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:linear-gradient(135deg,#065f46 0%,#059669 50%,#10b981 100%);padding:28px 32px;border-radius:16px 16px 0 0;">
      <div style="font-size:28px;margin-bottom:8px;">🎉</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">川口・蕨バド交流杯</h1>
      <p style="color:#a7f3d0;margin:6px 0 0;font-size:14px;">繰り上げ当選のご案内</p>
    </div>
    <div style="background:#ffffff;padding:28px 32px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${entry.name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">キャンセルが発生し、繰り上げ当選となりました！</p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#065f46;font-weight:700;">🎉 参加が確定しました！当日会場でお待ちしています。</p>
      </div>
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:20px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">大会名</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${t?.title ?? ""}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">開催日</td><td style="padding:10px 0;font-weight:600;">${eventDate}</td></tr>
        </table>
      </div>
      ${cancelBlock}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body></html>`;

      // 参加者に繰り上げメール
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
          reply_to: ADMIN_EMAIL,
          to: [entry.email],
          subject: `【繰り上げ当選】${t?.title ?? ""} への参加が確定しました`,
          text: `${entry.name} 様\n\nキャンセルが発生し、繰り上げ当選となりました！\n大会：${t?.title ?? ""}\n開催日：${eventDate}\n\n${cancelLink ? `キャンセルはこちら：${cancelLink}\n\n` : ""}当日会場でお待ちしています。\n\n川口・蕨バド交流杯`,
          html,
        }),
      });

      // 管理者通知
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
          to: [ADMIN_EMAIL],
          subject: `【繰り上げ完了】${entry.name}さんを${t?.title ?? ""}に繰り上げました`,
          text: `管理者操作による繰り上げ\n\nお名前：${entry.name}\nメール：${entry.email}\n大会：${t?.title ?? ""}\n開催日：${eventDate}`,
        }),
      });

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });

  } catch (error) {
    console.error("process-admin error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
