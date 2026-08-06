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
      `${supabaseUrl}/rest/v1/tournaments?id=eq.${entry.tournament_id}&select=id,title,entry_fee,payment_required,event_date,capacity,late_entry_until,status,visibility`,
      { headers: dbHeaders },
    );
    const tournament = (await tourRes.json())?.[0];
    if (!tournament) return json({ error: "大会情報が見つかりません" }, 404);
    if (!tournament.payment_required) {
      return json({ error: "この大会は事前支払い不要です" }, 400);
    }
    if (tournament.status !== "active" || (tournament.visibility ?? "published") !== "published") {
      return json({ error: "この大会は現在申し込みを受け付けていません" }, 400);
    }

    // ── 申込締切をサーバー側でも強制する ────────────────────────
    // 共通ルール: 開催14日前 23:59:59（日本時間）。
    // late_entry_until が設定された大会だけ、その日時まで追加受付する。
    // フロントの判定（src/lib/entryDeadline.ts）と同じ式。
    const standardDeadline = new Date(
      new Date(`${String(tournament.event_date).slice(0, 10)}T23:59:59+09:00`).getTime()
        - 14 * 24 * 60 * 60 * 1000,
    );
    const deadline = tournament.late_entry_until
      ? new Date(tournament.late_entry_until)
      : standardDeadline;
    const now = new Date();
    if (now > deadline) {
      return json({ error: "この大会の申し込みは締め切りました" }, 403);
    }

    // ── 定員到達時は新規に決済を作らせない ──────────────────────
    // 自分自身の確定枠は既に確保済みなので、自分を除いた確定数で判定する
    const countRes = await fetch(
      `${supabaseUrl}/rest/v1/entries?tournament_id=eq.${entry.tournament_id}&status=eq.confirmed&id=neq.${entry.id}&select=id`,
      { headers: { ...dbHeaders, Prefer: "count=exact" } },
    );
    const others = (await countRes.json())?.length ?? 0;
    if (others >= tournament.capacity) {
      return json({ error: "申し訳ありません。定員に達しました。" }, 409);
    }

    // Stripe PaymentIntent 作成（金額は必ずサーバー側で計算。手数料上乗せなし、参加費と同額）
    // カード決済のみに限定（Linkなど電話番号OTP認証を伴う決済手段は、
    // モーダル内での認証ポップアップが視認しづらく「処理中のまま固まる」原因になるため除外）
    const params = new URLSearchParams({
      amount: String(tournament.entry_fee),
      currency: "jpy",
      "payment_method_types[]": "card",
      description: `${tournament.title} 参加費（${entry.name} 様）`,
      receipt_email: entry.email,
      "metadata[entry_id]": String(entry.id),
      "metadata[tournament_id]": String(tournament.id),
      "metadata[entry_fee]": String(tournament.entry_fee),
    });
    const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `entry-${entry.id}-${tournament.entry_fee}`,
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
      amount: tournament.entry_fee,
      entry_fee: tournament.entry_fee,
    });
  } catch (error) {
    console.error("create-payment-intent error:", error.message);
    return json({ error: "決済の準備中にエラーが発生しました" }, 500);
  }
});
