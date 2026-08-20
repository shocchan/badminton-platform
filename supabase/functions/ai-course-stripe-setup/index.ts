// 【一時関数・使用後すぐ削除する】Stripe Webhookエンドポイントの自動登録。
//
// なぜ: Webhookの署名シークレット（whsec）は作成時のAPIレスポンスでしか取得できず、
// 手元にはStripeキーが無い（Supabase secretsは値を返さない）。そこで、キーを env として
// 読めるEdge Functionに1回だけ登録作業をさせ、whsecを受け取って secrets に保存する。
//
// 認可: Authorization ヘッダーが SUPABASE_SERVICE_ROLE_KEY と完全一致するときだけ動く
// （service_roleキーを持つ運用者以外は呼べない）。作業が終わったらこの関数は削除する。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const WEBHOOK_URL = "https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/ai-course-stripe-webhook";

serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    // ワンタイムトークン照合（実行直前に secrets へ設定し、作業後に関数ごと削除する）
    const auth = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const setupToken = Deno.env.get("AI_COURSE_SETUP_TOKEN") ?? "";
    if (!setupToken || auth !== setupToken) return json({ error: "forbidden" }, 403);

    const stripeKey = Deno.env.get("AI_COURSE_STRIPE_SECRET_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (!stripeKey) return json({ error: "no_stripe_key" }, 503);
    const keyMode = stripeKey.startsWith("sk_live_") ? "live" : stripeKey.startsWith("sk_test_") ? "test" : "unknown";

    const stripe = (path: string, init: RequestInit = {}) =>
      fetch(`https://api.stripe.com/v1${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${stripeKey}`, "Content-Type": "application/x-www-form-urlencoded", ...(init.headers ?? {}) },
      });

    const EVENTS = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      // 2026-08-20: 返金・チャージバックの自動処理
      "charge.refunded",
      "charge.dispute.created",
    ];

    const listRes = await stripe("/webhook_endpoints?limit=100");
    const list = await listRes.json();
    if (!listRes.ok) return json({ error: "stripe_list_failed", detail: list?.error?.message }, 502);
    const existing = (list.data ?? []).filter((e: { url?: string }) => e.url === WEBHOOK_URL);

    // 既存があれば**更新**する（作り直すと署名シークレットが変わり、
    // secrets を差し替えるまでの間に届いたイベントを取りこぼす）。
    // 受信イベントの追加だけなら更新で足りる。
    if (existing.length > 0 && !new URL(req.url).searchParams.has("recreate")) {
      const params = new URLSearchParams({ description: "AIコース セルフサービス決済（自動発行）" });
      EVENTS.forEach((e, i) => params.append(`enabled_events[${i}]`, e));
      const upRes = await stripe(`/webhook_endpoints/${existing[0].id}`, { method: "POST", body: params });
      const updated = await upRes.json();
      if (!upRes.ok) return json({ error: "stripe_update_failed", detail: updated?.error?.message }, 502);
      return json({
        ok: true, mode: "updated", keyMode,
        endpointId: updated.id, livemode: updated.livemode,
        enabledEvents: updated.enabled_events,
        // 更新では secret は返らない（既存のものがそのまま有効）
        signingSecret: null,
      });
    }

    for (const e of existing) {
      await stripe(`/webhook_endpoints/${e.id}`, { method: "DELETE" });
    }

    const params = new URLSearchParams({
      url: WEBHOOK_URL,
      description: "AIコース セルフサービス決済（自動発行）",
    });
    EVENTS.forEach((e, i) => params.append(`enabled_events[${i}]`, e));
    const createRes = await stripe("/webhook_endpoints", { method: "POST", body: params });
    const created = await createRes.json();
    if (!createRes.ok || !created?.secret) {
      return json({ error: "stripe_create_failed", detail: created?.error?.message }, 502);
    }

    return json({
      ok: true,
      mode: "created",
      keyMode,
      endpointId: created.id,
      livemode: created.livemode,
      enabledEvents: created.enabled_events,
      // whsec。呼び出し元（運用CLI）が直ちに supabase secrets へ保存する
      signingSecret: created.secret,
      deletedOld: existing.length,
    });
  } catch (e) {
    console.error("setup error:", e);
    return json({ error: "internal" }, 500);
  }
});
