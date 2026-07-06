import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "info@kawabado.com";

const CATEGORY_LABELS: Record<string, string> = {
  activity: "通常活動について",
  tournament: "大会について",
  sponsor: "スポンサー・協賛について",
  other: "その他",
};

interface ContactNotifyRequest {
  name: string;
  email: string;
  category: string;
  message: string;
  lang?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");

    const { name, email, category, message, lang }: ContactNotifyRequest = await req.json();
    if (!name || !email || !message) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const categoryLabel = CATEGORY_LABELS[category] ?? category;
    const isSponsor = category === "sponsor";
    const subject = isSponsor
      ? `💎【スポンサー相談】${name}様から協賛のお問い合わせ`
      : `📮【お問い合わせ】${name}様（${categoryLabel}）`;

    const body = [
      "kawabado.com のフォームから新しいお問い合わせが届きました。",
      "",
      `■ お名前: ${name}`,
      `■ メール: ${email}`,
      `■ 種類: ${categoryLabel}`,
      `■ 言語: ${lang === "zh" ? "中国語" : "日本語"}`,
      "",
      "■ 内容:",
      message,
      "",
      "---",
      "このメールに返信すると、そのまま相手に届きます（Reply-To設定済み）。",
      "一覧: Supabase Dashboard → Table Editor → contacts",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "川口・蕨バド交流会 <noreply@kawabado.com>",
        to: [ADMIN_EMAIL],
        reply_to: email,
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
    console.error(err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
