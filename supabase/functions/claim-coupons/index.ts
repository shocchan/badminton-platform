// 当選クーポンの受け取り確定 Edge Function（フェーズ③）
// ログイン済みユーザーが自分の端末IDを送ると、その端末に紐付く
// 未受け取り（unclaimed）クーポンとプレイ履歴をアカウントへ引き継ぐ。
//
// デプロイ: SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy claim-coupons --project-ref jdkwijdphlkrcoiggfqw

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    // ログインユーザーの特定（クライアントのJWTを検証）
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const {
      data: { user },
      error: userErr,
    } = await admin.auth.getUser(jwt);
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { deviceUuid } = await req.json();
    if (typeof deviceUuid !== "string" || deviceUuid.length < 16 || deviceUuid.length > 64) {
      return new Response(JSON.stringify({ error: "invalid request" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: device } = await admin
      .from("guest_devices")
      .select("id")
      .eq("device_uuid", deviceUuid)
      .maybeSingle();

    let claimed: { id: string; type: string }[] = [];
    if (device) {
      // クーポン引き継ぎ（guest_device_idは監査用に残す）
      const { data: rows, error: couponErr } = await admin
        .from("coupons")
        .update({
          user_id: user.id,
          status: "claimed",
          claimed_at: new Date().toISOString(),
        })
        .eq("guest_device_id", device.id)
        .eq("status", "unclaimed")
        .select("id, type");
      if (couponErr) throw couponErr;
      claimed = rows ?? [];

      // プレイ履歴も引き継ぐ
      const { error: playErr } = await admin
        .from("game_plays")
        .update({ user_id: user.id })
        .eq("guest_device_id", device.id)
        .is("user_id", null);
      if (playErr) throw playErr;
    }

    return new Response(JSON.stringify({ claimedCount: claimed.length, coupons: claimed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[claim-coupons] error:", err);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
