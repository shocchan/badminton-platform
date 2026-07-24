import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 支払い未完了で再度同じメールアドレスから申し込まれた場合、既存エントリーを
// 新しい入力内容（氏名・電話番号・ペア名・備考）で更新してから支払いを再開する。
// entries への UPDATE 権限は anon に付与していないため、cancel_token による
// 本人確認（create-payment-intent と同じ方式）を行った上でサービスロールキーで更新する。
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
    const { entry_id, cancel_token, name, phone, partner_name, notes } = await req.json();
    if (!entry_id || !cancel_token) {
      return json({ error: "entry_id と cancel_token は必須です" }, 400);
    }
    if (!name) {
      return json({ error: "name は必須です" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // cancel_token で本人確認しつつエントリー取得（create-payment-intent と同じ本人確認方式）
    const entryRes = await fetch(
      `${supabaseUrl}/rest/v1/entries?id=eq.${entry_id}&cancel_token=eq.${cancel_token}&select=id,status,payment_status`,
      { headers: dbHeaders },
    );
    const entries = await entryRes.json();
    const entry = entries?.[0];
    if (!entry) {
      return json({ error: "申し込み情報が見つかりません" }, 404);
    }
    // 更新できるのは「確定・支払い未完了」の申し込みのみ（キャンセル済み・支払い済みは対象外）
    if (entry.status !== "confirmed") {
      return json({ error: "この申し込みは更新できません" }, 400);
    }
    if (entry.payment_status === "completed") {
      return json({ error: "この申し込みはすでにお支払い済みのため変更できません" }, 400);
    }

    const updateRes = await fetch(
      `${supabaseUrl}/rest/v1/entries?id=eq.${entry_id}&cancel_token=eq.${cancel_token}`,
      {
        method: "PATCH",
        headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({
          name,
          phone: phone || null,
          partner_name: partner_name || null,
          notes: notes || null,
        }),
      },
    );
    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error("resume-entry update failed:", errText);
      return json({ error: "更新に失敗しました" }, 500);
    }

    return json({ success: true });
  } catch (error) {
    console.error("resume-entry error:", error.message);
    return json({ error: error.message }, 500);
  }
});
