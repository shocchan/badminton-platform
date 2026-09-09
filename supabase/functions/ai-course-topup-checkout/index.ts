// AI会話の回数券を買う（2026-09-09 CEO決定）。
//
// AI会話はベータ扱いで、毎日の冒険からは外し、**週3回までを全員の枠**にした。
// それ以上やりたい人だけが、ここから買い足す。
//
// ■ なぜ ai-course-checkout と分けたか
//   あちらは受講権（アカウント発行・期間延長・紹介クーポン・放棄カート回収）の
//   ための長い経路で、**いま実際に売れている**。回数券のためにそこへ分岐を足すと、
//   壊したときに購入そのものが止まる。回数券は「残高が増えるだけ」で受講権に触らないので、
//   短い別の入口にしておくほうが安全。
//
// ■ ログイン必須
//   回数券は**アカウントに積む**もの。誰のものか決まらない購入は受け付けない。
//   （受講権の購入は未ログインでも成立する＝そちらはアカウントを発行するため）
//
// ■ 金額はサーバー側のカタログから取る。クライアントの金額は信じない。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { functionTopupById } from "../_shared/conversationTopups.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** 戻り先URLに使ってよいオリジン（それ以外は kawabado.com へ倒す） */
const ORIGIN_ALLOW = [
  /^https:\/\/kawabado\.com$/,
  /^https:\/\/www\.kawabado\.com$/,
  /^https:\/\/study\.kawabado\.com$/,
  /^https:\/\/[a-z0-9-]+\.badminton-platform\.pages\.dev$/,
  /^http:\/\/localhost:\d+$/,
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    // 受講権の購入とまったく同じ鍵・モードの検算（実課金事故の防止）
    const mode = Deno.env.get("AI_COURSE_CHECKOUT_MODE") ?? "";
    const stripeKey = Deno.env.get("AI_COURSE_STRIPE_SECRET_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (mode !== "test" && mode !== "live") return json({ error: "checkout_not_ready" }, 503);
    if (!stripeKey) return json({ error: "checkout_not_ready" }, 503);
    if (mode === "test" && !stripeKey.startsWith("sk_test_")) return json({ error: "checkout_misconfigured" }, 503);
    if (mode === "live" && !stripeKey.startsWith("sk_live_")) return json({ error: "checkout_misconfigured" }, 503);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const body = await req.json().catch(() => ({}));
    const topupId = typeof body.topupId === "string" ? body.topupId : "";
    const locale = body.locale === "zh" ? "zh" : "ja";

    /*
     * 誰の残高に積むかを**サーバーで決める**。自己申告のuser_idは受け取らない。
     * ログインしていない購入は受け付けない（受講権と違い、回数券は
     * 積む先のアカウントが無いと意味がないので、ここで止めるのが正しい）。
     */
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!bearer) return json({ error: "login_required" }, 401);
    const who = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${bearer}` },
    });
    if (!who.ok) return json({ error: "login_required" }, 401);
    const user = await who.json().catch(() => null);
    const userId: string | null = user?.id ?? null;
    if (!userId) return json({ error: "login_required" }, 401);

    // ── 商品検証（金額はサーバー側カタログから） ──
    const topup = functionTopupById(topupId);
    if (!topup) return json({ error: "unknown_topup" }, 400);

    // 台帳が無い環境では受け付けない（孤児セッションを作らない）
    const probe = await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?select=id&limit=0`, { headers: dbHeaders });
    if (!probe.ok) return json({ error: "checkout_not_ready" }, 503);

    const reqOrigin = req.headers.get("origin") ?? "";
    const origin = ORIGIN_ALLOW.some((re) => re.test(reqOrigin)) ? reqOrigin : "https://kawabado.com";
    // 買ったあとは学習画面へ戻す（回数券は受講権を作らないので購入完了ページは通さない）
    const successUrl = `${origin}/${locale}/ai-course?topup=ok`;
    const cancelUrl = `${origin}/${locale}/ai-course?topup=cancelled`;

    const name = locale === "zh" ? topup.nameZh : topup.nameJa;
    const description = locale === "zh" ? topup.descriptionZh : topup.descriptionJa;
    const params = new URLSearchParams({
      mode: "payment",
      locale: locale === "zh" ? "zh" : "ja",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "jpy",
      "line_items[0][price_data][unit_amount]": String(topup.priceJpy),
      "line_items[0][price_data][product_data][name]": name,
      // **1回あたり何分かを必ず書く**。画面には分数を出さない方針だが、
      // 買う人が何を買うのか分からないまま決済させない（特商法の表示）
      "line_items[0][price_data][product_data][description]": description,
      "metadata[topup_id]": topup.id,
      "metadata[topup_version]": String(topup.version),
      "metadata[topup_credits]": String(topup.credits),
      "metadata[user_id]": userId,
      "metadata[locale]": locale,
      "payment_intent_data[description]": `AI日本語コース ${topup.nameJa}`,
      customer_creation: "always",
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!res.ok) {
      console.error("topup checkout failed:", res.status, await res.text());
      return json({ error: "checkout_failed" }, 502);
    }
    const session = await res.json();

    // 台帳へ pending 行（受講権の購入と同じ表に入れる＝入金の見え方を1か所に保つ）
    const insRes = await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        stripe_session_id: session.id,
        plan_id: topup.id,
        plan_version: topup.version,
        amount_jpy: topup.priceJpy,
        currency: "jpy",
        livemode: mode === "live",
        locale,
        status: "pending",
        user_id: userId,
      }),
    });
    if (!insRes.ok) {
      // 台帳に残せないなら決済へ進めない（あとで誰の購入か分からなくなる）
      console.error("topup ledger insert failed:", insRes.status, await insRes.text());
      return json({ error: "checkout_failed" }, 500);
    }

    return json({ ok: true, url: session.url, topupId: topup.id, credits: topup.credits });
  } catch (e) {
    console.error("topup checkout error:", e);
    return json({ error: "internal_error" }, 500);
  }
});
