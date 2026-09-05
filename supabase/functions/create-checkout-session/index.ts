// WeChat Pay / Alipay 用の決済。
//
// カード決済（create-payment-intent + confirm-payment）はページ内の Stripe Elements で
// 完結するが、WeChat Pay と Alipay はリダイレクト型で、Stripe の画面に一度出る必要がある。
// そのため Checkout Session を作り、その URL へ飛ばす。
//
// カード決済のコードには一切触らない（動いているものを壊さないため）。
// 作成と、戻ってきたあとの確認の両方をこの1本で扱う（action で分岐）。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** この決済手段の識別子。entries.payment_method に入る値 */
const METHOD = "wechat_alipay";

/** 戻り先として許可するオリジン（任意のURLへ飛ばされるのを防ぐ） */
const ALLOWED_ORIGINS = [
  "https://kawabado.com",
  "https://www.kawabado.com",
  "https://staging.badminton-platform.pages.dev",
  "http://localhost:5173",
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const body = await req.json();
    const action = body.action === "confirm" ? "confirm" : "create";

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "決済機能は現在準備中です" }, 503);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // ────────────────────────────────────────────────────────────
    // 戻ってきたあとの確認。Stripe に直接聞き、支払い済みのときだけ確定させる
    // ────────────────────────────────────────────────────────────
    if (action === "confirm") {
      const sessionId = String(body.session_id ?? "");
      if (!sessionId) return json({ success: false, error: "session_id は必須です" }, 400);

      const sRes = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
        { headers: { Authorization: `Bearer ${stripeKey}` } },
      );
      const session = await sRes.json();
      if (!sRes.ok) {
        console.error("Stripe session retrieve error:", session?.error?.message);
        return json({ success: false, error: "決済情報の確認に失敗しました" }, 502);
      }

      const entryId = session.metadata?.entry_id;
      if (!entryId) return json({ success: false, error: "決済に対応する申し込みが見つかりません" }, 400);

      // 作成時に保存したセッションIDと一致するものだけ対象にする（すり替え防止）
      const entryRes = await fetch(
        `${supabaseUrl}/rest/v1/entries?id=eq.${entryId}&stripe_payment_id=eq.${session.id}` +
          `&select=id,tournament_id,name,email,phone,notes,partner_name,payment_status,cancel_token`,
        { headers: dbHeaders },
      );
      const entry = (await entryRes.json())?.[0];
      if (!entry) return json({ success: false, error: "申し込み情報が見つかりません" }, 404);

      // 冪等: 戻り先を再読み込みされてもメールは1通だけ
      if (entry.payment_status === "completed") {
        return json({ success: true, already_completed: true });
      }

      if (session.payment_status !== "paid") {
        // 未払いのまま戻ってきた（キャンセル・期限切れなど）。申し込み自体は残す
        return json({
          success: false,
          pending: session.status === "open",
          error: "お支払いが完了していません。もう一度お試しいただくか、別の支払い方法をご利用ください。",
        }, 400);
      }

      const tourRes = await fetch(
        `${supabaseUrl}/rest/v1/tournaments?id=eq.${entry.tournament_id}` +
          `&select=id,title,event_date,start_time,end_time,location,venue_address,entry_fee,payment_deadline`,
        { headers: dbHeaders },
      );
      const tournament = (await tourRes.json())?.[0];

      const paidAt = new Date().toISOString();
      const updateRes = await fetch(`${supabaseUrl}/rest/v1/entries?id=eq.${entry.id}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({
          payment_method: METHOD,
          payment_status: "completed",
          // 以後の照会は PaymentIntent の方が扱いやすいので置き換える
          stripe_payment_id: session.payment_intent ?? session.id,
          paid_at: paidAt,
        }),
      });
      if (!updateRes.ok) {
        console.error("entries update error:", await updateRes.text());
        return json({
          success: false,
          error: "申し込み情報の更新に失敗しました。運営が確認しますのでそのままお待ちください。",
        }, 500);
      }

      const entryFee = Number(session.metadata?.entry_fee ?? tournament?.entry_fee ?? 0);
      try {
        const mailRes = await fetch(`${supabaseUrl}/functions/v1/send-payment-email`, {
          method: "POST",
          headers: dbHeaders,
          body: JSON.stringify({
            payment_method: METHOD,
            to: entry.email,
            name: entry.name,
            phone: entry.phone,
            notes: entry.notes,
            partner_name: entry.partner_name,
            tournament_title: tournament?.title ?? "",
            tournament_date: tournament?.event_date ?? "",
            start_time: tournament?.start_time,
            end_time: tournament?.end_time,
            location: tournament?.location,
            venue_address: tournament?.venue_address,
            payment_deadline: tournament?.payment_deadline ?? "",
            bank_account: "",
            paypay_id: "",
            payment_required: true,
            entry_fee: entryFee,
            amount_total: session.amount_total,
            paid_at: paidAt,
            entry_id: entry.id,
            cancel_link: `https://kawabado.com/cancel?token=${entry.cancel_token}`,
          }),
        });
        if (!mailRes.ok) console.error("payment email failed:", await mailRes.text());
      } catch (e) {
        console.error("payment email error:", e.message);
      }

      return json({ success: true, paid_at: paidAt, amount: session.amount_total });
    }

    // ────────────────────────────────────────────────────────────
    // Checkout Session の作成
    // 金額・締切・定員はすべてサーバー側で検証する（create-payment-intent と同じ条件）
    // ────────────────────────────────────────────────────────────
    const { entry_id, cancel_token, return_origin, return_path, lang } = body;
    if (!entry_id || !cancel_token) {
      return json({ error: "entry_id と cancel_token は必須です" }, 400);
    }

    const origin = ALLOWED_ORIGINS.includes(String(return_origin))
      ? String(return_origin)
      : ALLOWED_ORIGINS[0];
    // 戻り先はサイト内のパスだけ許可する（//evil.com のような外部への逃げ道を塞ぐ）
    const path = typeof return_path === "string" && /^\/[A-Za-z0-9\-._~/]*$/.test(return_path)
      ? return_path
      : "/ja/";

    const entryRes = await fetch(
      `${supabaseUrl}/rest/v1/entries?id=eq.${entry_id}&cancel_token=eq.${cancel_token}` +
        `&select=id,tournament_id,name,email,status,payment_status`,
      { headers: dbHeaders },
    );
    const entry = (await entryRes.json())?.[0];
    if (!entry) return json({ error: "申し込み情報が見つかりません" }, 404);
    if (entry.payment_status === "completed") {
      return json({ error: "この申し込みのお支払いは完了しています" }, 409);
    }

    const tourRes = await fetch(
      `${supabaseUrl}/rest/v1/tournaments?id=eq.${entry.tournament_id}` +
        `&select=id,title,entry_fee,capacity,event_date,status,visibility,late_entry_until`,
      { headers: dbHeaders },
    );
    const tournament = (await tourRes.json())?.[0];
    if (!tournament) return json({ error: "大会が見つかりません" }, 404);
    if (tournament.status !== "active" || (tournament.visibility ?? "published") !== "published") {
      return json({ error: "この大会は現在申し込みを受け付けていません" }, 400);
    }

    // 申込締切（開催3日前 23:59:59 JST。late_entry_until があればそちら）
    // 2026-09-05 に 14日前 から変更。キャンセル期限（14日前）とは別物なので混同しないこと
    const ENTRY_LEAD_DAYS = 3;
    const standardDeadline = new Date(
      new Date(`${String(tournament.event_date).slice(0, 10)}T23:59:59+09:00`).getTime()
        - ENTRY_LEAD_DAYS * 24 * 60 * 60 * 1000,
    );
    const deadline = tournament.late_entry_until
      ? new Date(tournament.late_entry_until)
      : standardDeadline;
    if (new Date() > deadline) {
      return json({ error: "この大会の申し込みは締め切りました" }, 403);
    }

    const countRes = await fetch(
      `${supabaseUrl}/rest/v1/entries?tournament_id=eq.${entry.tournament_id}&status=eq.confirmed&id=neq.${entry.id}&select=id`,
      { headers: { ...dbHeaders, Prefer: "count=exact" } },
    );
    const others = (await countRes.json())?.length ?? 0;
    if (others >= tournament.capacity) {
      return json({ error: "申し訳ありません。定員に達しました。" }, 409);
    }

    const params = new URLSearchParams({
      mode: "payment",
      // WeChat Pay と Alipay を1つの選択肢としてまとめ、Stripe の画面で選んでもらう
      "payment_method_types[0]": "alipay",
      "payment_method_types[1]": "wechat_pay",
      // WeChat Pay はどこから支払うかの指定が必須
      "payment_method_options[wechat_pay][client]": "web",
      "line_items[0][price_data][currency]": "jpy",
      "line_items[0][price_data][product_data][name]": `${tournament.title} 参加費`,
      // 円は最小単位が1なので、参加費をそのまま渡す
      "line_items[0][price_data][unit_amount]": String(tournament.entry_fee),
      "line_items[0][quantity]": "1",
      customer_email: entry.email,
      locale: lang === "zh" ? "zh" : "ja",
      success_url: `${origin}${path}?checkout=success&session_id={CHECKOUT_SESSION_ID}&entry_id=${entry.id}`,
      cancel_url: `${origin}${path}?checkout=cancel&entry_id=${entry.id}`,
      "metadata[entry_id]": String(entry.id),
      "metadata[tournament_id]": String(tournament.id),
      "metadata[entry_fee]": String(tournament.entry_fee),
    });

    const sRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        // 同じ申込・同じ金額で連打されても1セッションに収める
        "Idempotency-Key": `entry-${entry.id}-${tournament.entry_fee}-${METHOD}`,
      },
      body: params.toString(),
    });
    const session = await sRes.json();
    if (!sRes.ok || !session.url) {
      // WeChat Pay / Alipay がStripeダッシュボードで有効化されていない場合もここに来る
      console.error("Stripe checkout session error:", session?.error?.message);
      return json({ error: "決済の準備に失敗しました。時間をおいてお試しください。" }, 502);
    }

    // 戻ってきたときの突き合わせ用に保存（この時点ではまだ未払い）
    await fetch(`${supabaseUrl}/rest/v1/entries?id=eq.${entry.id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({ stripe_payment_id: session.id, payment_method: METHOD }),
    });

    return json({ url: session.url, amount: tournament.entry_fee });
  } catch (error) {
    console.error("create-checkout-session error:", error.message);
    return json({ error: "決済の準備中にエラーが発生しました" }, 500);
  }
});
