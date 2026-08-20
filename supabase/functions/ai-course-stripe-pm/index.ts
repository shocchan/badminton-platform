// 【一時関数】Stripeの決済手段（Alipay / WeChat Pay）の可否確認と有効化。
//
// Stripeのシークレットキーは Supabase secrets にしか無く、手元から直接APIを叩けないため、
// キーを持っている場所（Edge Function）から一度だけ問い合わせる。
// **確認と有効化が終わったら、この関数は削除すること**（webhook登録のときと同じ運用）。
//
// 認可: 一度きりの共有トークン（STRIPE_PM_SETUP_TOKEN）。ヘッダー x-setup-token で照合。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-setup-token",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const stripe = async (path: string, method = "GET", form?: Record<string, string>) => {
  const key = Deno.env.get("AI_COURSE_STRIPE_SECRET_KEY") || Deno.env.get("STRIPE_SECRET_KEY") || "";
  const res = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });
  return { ok: res.ok, status: res.status, body: await res.json() };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const token = Deno.env.get("STRIPE_PM_SETUP_TOKEN");
  if (!token || req.headers.get("x-setup-token") !== token) return json({ error: "forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const action = body.action ?? "inspect";

  const acct = await stripe("/v1/account");
  const caps = acct.body?.capabilities ?? {};
  const cfgs = await stripe("/v1/payment_method_configurations");
  const list = (cfgs.body?.data ?? []).map((c: any) => ({
    id: c.id, name: c.name, is_default: c.is_default, active: c.active,
    card: c.card?.display_preference?.value,
    alipay: c.alipay?.display_preference?.value,
    wechat_pay: c.wechat_pay?.display_preference?.value,
    link: c.link?.display_preference?.value,
  }));

  if (action === "inspect") {
    return json({
      livemode: acct.body?.charges_enabled !== undefined ? !acct.body?.id?.includes("test") : null,
      country: acct.body?.country, default_currency: acct.body?.default_currency,
      capabilities: {
        card_payments: caps.card_payments ?? null,
        alipay_payments: caps.alipay_payments ?? null,
        wechat_pay_payments: caps.wechat_pay_payments ?? null,
        link_payments: caps.link_payments ?? null,
      },
      configurations: list,
    });
  }

  if (action === "enable") {
    const target = list.find((c: any) => c.is_default) ?? list[0];
    if (!target) return json({ error: "no_payment_method_configuration" }, 400);
    const form: Record<string, string> = {};
    for (const m of (body.methods ?? ["alipay", "wechat_pay"]) as string[]) {
      form[`${m}[display_preference][preference]`] = body.off ? "off" : "on";
    }
    const upd = await stripe(`/v1/payment_method_configurations/${target.id}`, "POST", form);
    return json({
      configuration: target.id, ok: upd.ok, status: upd.status,
      error: upd.body?.error?.message ?? null,
      after: upd.ok ? {
        alipay: upd.body?.alipay?.display_preference?.value,
        wechat_pay: upd.body?.wechat_pay?.display_preference?.value,
      } : null,
    });
  }

  // 実際に Checkout セッションを作って「本番の購入導線が壊れていないか」を確かめる。
  // 台帳には触らない。作ったセッションはすぐ expire する（決済ページとして生き残らせない）
  if (action === "probe") {
    const form: Record<string, string> = {
      mode: "payment",
      "line_items[0][price_data][currency]": "jpy",
      "line_items[0][price_data][unit_amount]": "600",
      "line_items[0][price_data][product_data][name]": "probe",
      "line_items[0][quantity]": "1",
      success_url: "https://kawabado.com/ja/ai-course",
      cancel_url: "https://kawabado.com/ja/ai-course",
    };
    if (body.wechatClient) form["payment_method_options[wechat_pay][client]"] = "web";
    if (body.recovery) {
      form["after_expiration[recovery][enabled]"] = "true";
      form["after_expiration[recovery][allow_promotion_codes]"] = "false";
    }
    if (body.email) form["customer_email"] = String(body.email);
    const ses = await stripe("/v1/checkout/sessions", "POST", form);
    let expired = false;
    if (ses.ok && ses.body?.id) {
      const e = await stripe(`/v1/checkout/sessions/${ses.body.id}/expire`, "POST", {});
      expired = e.ok;
    }
    return json({
      ok: ses.ok, status: ses.status,
      error: ses.body?.error?.message ?? null,
      payment_method_types: ses.body?.payment_method_types ?? null,
      expired,
    });
  }

  return json({ error: "unknown_action" }, 400);
});
