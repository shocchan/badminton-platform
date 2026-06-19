import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, wechat_id, language } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sendMail = (to: string, subject: string, text: string) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: "kawabado <noreply@kawabado.com>", to, subject, text }),
      });

    // info@kawabado.com への通知（常に送信）
    await sendMail(
      "info@kawabado.com",
      `【新規登録】${name}さんが特典登録しました`,
      `新しい登録者がいます。\n\n名前: ${name}\nWeChat ID: ${wechat_id || "—"}\nメール: ${email || "—"}\n言語: ${language}\n\n管理画面で確認してください。\nhttps://kawabado.com/ja/admin`,
    );

    // 登録者へのウェルカムメール（メールがある場合のみ）
    if (email) {
      const subject = language === "zh"
        ? "【川口・蕨羽毛球】注册成功！欢迎加入特典会员🏸"
        : "【kawabado】特典登録ありがとうございます！🏸";

      const text = language === "zh"
        ? `${name} 您好！\n\n感谢您注册川口・蕨羽毛球特典会员。\n翔会尽快通过微信与您联系，为您送上优惠券。\n\n今后将第一时间向您推送大会・活动信息及地区优惠。\n\n川口・蕨羽毛球交流会`
        : `${name} さん\n\nkawabado特典登録ありがとうございます！\n\nしょっちゃんよりWeChat / メールにてご連絡いたします。\n引き続き、大会・活動情報や川口・蕨エリアの特典をお届けしていきます。\n\n川口・蕨バドミントン交流会`;

      await sendMail(email, subject, text);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
