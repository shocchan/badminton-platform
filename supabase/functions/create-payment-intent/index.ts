import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// クレジット決済手数料: 参加費の4%（四捨五入）を上乗せ
// Stripe実費（3.6%＋実測の追加分）をカバーし、キャンセル時の部分返金でkawabadoが損をしないための率
export const calcCreditAmounts = (entryFee: number) => {
  const fee = Math.round(entryFee * 0.04);
  return { fee, total: entryFee + fee };
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
    const { entry_id, cancel_token } = await req.json();
    if (!entry_id || !cancel_token) {
      return json({ error: "entry_id と cancel_token は必須です" }, 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) return json({ error: "決済機能は現在準備中です" }, 503);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // cancel_token で本人確認しつつエントリー取得
    const entryRes = await fetch(
      `${supabaseUrl}/rest/v1/entries?id=eq.${entry_id}&cancel_token=eq.${cancel_token}&select=id,tournament_id,status,payment_status,name,email`,
      { headers: dbHeaders },
    );
    const entries = await entryRes.json();
    const entry = entries?.[0];
    if (!entry) return json({ error: "申し込み情報が見つかりません" }, 404);
    if (entry.status !== "confirmed") {
      return json({ error: "キャンセル待ち・キャンセル済みの申し込みはお支払いできません" }, 400);
    }
    if (entry.payment_status === "completed") {
      return json({ error: "この申し込みはすでにお支払い済みです" }, 400);
    }

    const tourRes = await fetch(
      `${supabaseUrl}/rest/v1/tournaments?id=eq.${entry.tournament_id}&select=id,title,entry_fee,payment_required`,
      { headers: dbHeaders },
    );
    const tournament = (await tourRes.json())?.[0];
    if (!tournament) return json({ error: "大会情報が見つかりません" }, 404);
    if (!tournament.payment_required) {
      return json({ error: "この大会は事前支払い不要です" }, 400);
    }

    const { fee, total } = calcCreditAmounts(tournament.entry_fee);

    // Stripe PaymentIntent 作成（金額は必ずサーバー側で計算）
    // カード決済のみに限定（Linkなど電話番号OTP認証を伴う決済手段は、
    // モーダル内での認証ポップアップが視認しづらく「処理中のまま固まる」原因になるため除外）
    const params = new URLSearchParams({
      amount: String(total),
      currency: "jpy",
      "payment_method_types[]": "card",
      description: `${tournament.title} 参加費（${entry.name} 様）`,
      receipt_email: entry.email,
      "metadata[entry_id]": String(entry.id),
      "metadata[tournament_id]": String(tournament.id),
      "metadata[entry_fee]": String(tournament.entry_fee),
      "metadata[credit_fee]": String(fee),
    });
    const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `entry-${entry.id}-${total}`,
      },
      body: params.toString(),
    });
    const pi = await piRes.json();
    if (!piRes.ok) {
      console.error("Stripe PI create error:", pi?.error?.message);
      return json({ error: "決済の準備に失敗しました。時間をおいてお試しください。" }, 502);
    }

    // 追跡用に PaymentIntent ID を保存（この時点ではまだ未払い）
    await fetch(`${supabaseUrl}/rest/v1/entries?id=eq.${entry.id}`, {
      method: "PATCH",
      headers: dbHeaders,
      body: JSON.stringify({ stripe_payment_id: pi.id }),
    });

    return json({
      clientSecret: pi.client_secret,
      amount: total,
      fee,
      entry_fee: tournament.entry_fee,
    });
  } catch (error) {
    console.error("create-payment-intent error:", error.message);
    return json({ error: "決済の準備中にエラーが発生しました" }, 500);
  }
});
