import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    const { payment_intent_id } = await req.json();
    if (!payment_intent_id) {
      return json({ success: false, error: "payment_intent_id は必須です" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ success: false, error: "決済機能は現在準備中です" }, 503);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // Stripe に決済状態を直接確認（クライアントの申告は信用しない）
    const piRes = await fetch(
      `https://api.stripe.com/v1/payment_intents/${encodeURIComponent(payment_intent_id)}`,
      { headers: { Authorization: `Bearer ${stripeKey}` } },
    );
    const pi = await piRes.json();
    if (!piRes.ok) {
      console.error("Stripe PI retrieve error:", pi?.error?.message);
      return json({ success: false, error: "決済情報の確認に失敗しました" }, 502);
    }

    const entryId = pi.metadata?.entry_id;
    if (!entryId) return json({ success: false, error: "決済に対応する申し込みが見つかりません" }, 400);

    // stripe_payment_id の一致するエントリーのみ対象（すり替え防止）
    const entryRes = await fetch(
      `${supabaseUrl}/rest/v1/entries?id=eq.${entryId}&stripe_payment_id=eq.${pi.id}&select=id,tournament_id,name,email,phone,notes,partner_name,payment_status,cancel_token`,
      { headers: dbHeaders },
    );
    const entry = (await entryRes.json())?.[0];
    if (!entry) return json({ success: false, error: "申し込み情報が見つかりません" }, 404);

    // 冪等: すでに完了済みなら成功として返す（メール再送はしない）
    if (entry.payment_status === "completed") {
      return json({ success: true, already_completed: true });
    }

    if (pi.status !== "succeeded") {
      await fetch(`${supabaseUrl}/rest/v1/entries?id=eq.${entry.id}`, {
        method: "PATCH",
        headers: dbHeaders,
        body: JSON.stringify({ payment_status: "failed", payment_method: "credit" }),
      });
      return json({
        success: false,
        error: "お支払いが完了していません。もう一度お試しいただくか、別の支払い方法をご利用ください。",
      }, 400);
    }

    const tourRes = await fetch(
      `${supabaseUrl}/rest/v1/tournaments?id=eq.${entry.tournament_id}&select=id,title,event_date,start_time,end_time,location,venue_address,entry_fee,payment_deadline`,
      { headers: dbHeaders },
    );
    const tournament = (await tourRes.json())?.[0];

    const paidAt = new Date().toISOString();
    const updateRes = await fetch(`${supabaseUrl}/rest/v1/entries?id=eq.${entry.id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({
        payment_method: "credit",
        payment_status: "completed",
        stripe_payment_id: pi.id,
        paid_at: paidAt,
      }),
    });
    if (!updateRes.ok) {
      console.error("entries update error:", await updateRes.text());
      return json({ success: false, error: "申し込み情報の更新に失敗しました。運営が確認しますのでそのままお待ちください。" }, 500);
    }

    // 支払い完了メール送信（失敗しても決済自体は成立しているので成功で返す）
    const entryFee = Number(pi.metadata?.entry_fee ?? tournament?.entry_fee ?? 0);
    const creditFee = Number(pi.metadata?.credit_fee ?? pi.amount - entryFee);
    try {
      const mailRes = await fetch(`${supabaseUrl}/functions/v1/send-payment-email`, {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          payment_method: "credit",
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
          amount_fee: creditFee,
          amount_total: pi.amount,
          paid_at: paidAt,
          entry_id: entry.id,
          cancel_link: `https://kawabado.com/cancel?token=${entry.cancel_token}`,
        }),
      });
      if (!mailRes.ok) console.error("payment email failed:", await mailRes.text());
    } catch (e) {
      console.error("payment email error:", e.message);
    }

    return json({ success: true, paid_at: paidAt, amount: pi.amount });
  } catch (error) {
    console.error("confirm-payment error:", error.message);
    return json({ success: false, error: "決済確認中にエラーが発生しました" }, 500);
  }
});
