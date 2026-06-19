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
    const { name, email, language } = await req.json();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const subject = language === "zh"
      ? "【川口・蕨羽毛球】注册成功！欢迎加入特典会员🏸"
      : "【kawabado】特典登録ありがとうございます！🏸";

    const text = language === "zh"
      ? `${name} 您好！\n\n感谢您注册川口・蕨羽毛球特典会员。\n翔会尽快通过微信与您联系，为您送上优惠券。\n\n今后将第一时间向您推送大会・活动信息及地区优惠。\n\n川口・蕨羽毛球交流会`
      : `${name} さん\n\nkawabado特典登録ありがとうございます！\n\nしょっちゃんよりWeChat / メールにてご連絡いたします。\n引き続き、大会・活動情報や川口・蕨エリアの特典をお届けしていきます。\n\n川口・蕨バドミントン交流会`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "kawabado <noreply@kawabado.com>",
        to: email,
        subject,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      return new Response(JSON.stringify({ error: body }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
