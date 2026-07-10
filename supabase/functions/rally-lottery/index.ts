// バド対決ゲームの抽選 Edge Function
// クライアントは { deviceUuid, rallyCount } を送るだけ。
// 当落判定・確率・月間上限・1日の抽選回数制限はすべてこのサーバー側で行う。
// パラメータは lottery_config テーブル（非公表）で管理。
//
// デプロイ: SUPABASE_ACCESS_TOKEN=<token> supabase functions deploy rally-lottery --project-ref jdkwijdphlkrcoiggfqw

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LotteryRequest {
  /** "start" = ゲーム開始（セッション発行）。省略時は抽選 */
  action?: "start";
  deviceUuid: string;
  rallyCount?: number;
  /** action:"start" で発行されたセッションID。抽選時は必須 */
  sessionId?: string;
}

/** 1ラリーに最低かかる時間(ms)。AIショットの飛行が最速620msなのでこれ未満は物理的に不可能 */
const MIN_MS_PER_RALLY = 600;
/** ゲームセッションの有効期限(ms) */
const SESSION_MAX_AGE_MS = 2 * 60 * 60 * 1000;

interface LotteryResponse {
  drawCount: number; // 実際に抽選した回数（0=1日上限到達 or ラリー0）
  isWinner: boolean;
  prizeType: "ramen" | "badminton" | null;
  dailyLimited: boolean; // 本日の抽選対象ゲーム数を使い切っていた
}

/** 0以上1未満の暗号学的乱数 */
function secureRandom(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 4294967296;
}

/** JST基準の「今日の0時」「今月の1日0時」をUTC ISO文字列で返す */
function jstBoundaries(): { dayStart: string; monthStart: string } {
  const JST_OFFSET = 9 * 60 * 60 * 1000;
  const nowJst = new Date(Date.now() + JST_OFFSET);
  const y = nowJst.getUTCFullYear();
  const m = nowJst.getUTCMonth();
  const d = nowJst.getUTCDate();
  return {
    dayStart: new Date(Date.UTC(y, m, d) - JST_OFFSET).toISOString(),
    monthStart: new Date(Date.UTC(y, m, 1) - JST_OFFSET).toISOString(),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { action, deviceUuid, rallyCount, sessionId }: LotteryRequest = await req.json();

    const badRequest = (reason: string) =>
      new Response(JSON.stringify({ error: "invalid request", reason }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    if (
      typeof deviceUuid !== "string" ||
      deviceUuid.length < 16 ||
      deviceUuid.length > 64
    ) {
      return badRequest("device");
    }

    // ── ゲーム開始: セッションを発行して開始時刻をサーバー側に記録 ──
    if (action === "start") {
      const { data: session, error: sessionErr } = await supabase
        .from("game_sessions")
        .insert({ device_uuid: deviceUuid })
        .select("id")
        .single();
      if (sessionErr) throw sessionErr;
      return new Response(JSON.stringify({ sessionId: session.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 抽選（finish）──
    if (
      !Number.isInteger(rallyCount) ||
      (rallyCount as number) < 0 ||
      (rallyCount as number) > 500
    ) {
      return badRequest("rally");
    }
    const rallies = rallyCount as number;

    // プレイ時間の整合性チェック:
    // 開始時に発行したセッションの経過時間より速いラリー申告は物理的に不可能なので弾く。
    // セッションは1回で消費（同一セッションの再利用も不可）。
    if (typeof sessionId !== "string" || sessionId.length !== 36) {
      return badRequest("session");
    }
    const { data: session, error: sessionFetchErr } = await supabase
      .from("game_sessions")
      .select("id, device_uuid, started_at, finished")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionFetchErr) throw sessionFetchErr;
    if (!session || session.device_uuid !== deviceUuid || session.finished) {
      return badRequest("session");
    }
    const elapsedMs = Date.now() - new Date(session.started_at).getTime();
    if (elapsedMs > SESSION_MAX_AGE_MS || elapsedMs < rallies * MIN_MS_PER_RALLY) {
      console.warn("[rally-lottery] time check failed:", { deviceUuid, rallies, elapsedMs });
      return badRequest("time");
    }
    // セッションを消費（finished=false の行だけを更新することで二重使用を原子的に防ぐ）
    const { data: consumed, error: consumeErr } = await supabase
      .from("game_sessions")
      .update({ finished: true })
      .eq("id", sessionId)
      .eq("finished", false)
      .select("id");
    if (consumeErr) throw consumeErr;
    if (!consumed || consumed.length === 0) {
      return badRequest("session");
    }

    // 設定を取得
    const { data: configRows, error: configErr } = await supabase
      .from("lottery_config")
      .select("key, value");
    if (configErr) throw configErr;
    const config = Object.fromEntries(
      (configRows ?? []).map((r: { key: string; value: number }) => [r.key, r.value]),
    );
    const ramenOdds = config.ramen_odds ?? 1000;
    const badmintonOdds = config.badminton_odds ?? 500;
    const ramenCap = config.ramen_monthly_cap ?? 3;
    const badmintonCap = config.badminton_monthly_cap ?? 5;
    const dailyGameLimit = config.daily_game_limit ?? 10;
    const ralliesPerDraw = config.rallies_per_draw ?? 15;

    // ゲスト端末を取得 or 作成
    const { data: device, error: deviceErr } = await supabase
      .from("guest_devices")
      .upsert({ device_uuid: deviceUuid }, { onConflict: "device_uuid" })
      .select("id")
      .single();
    if (deviceErr) throw deviceErr;

    const { dayStart, monthStart } = jstBoundaries();

    // 今日この端末で抽選対象になったゲーム数（draw_count > 0 のもの）
    const { count: todayDrawGames, error: todayErr } = await supabase
      .from("game_plays")
      .select("id", { count: "exact", head: true })
      .eq("guest_device_id", device.id)
      .gt("draw_count", 0)
      .gte("played_at", dayStart);
    if (todayErr) throw todayErr;

    // 15ラリーごとに抽選1回（15未満=0回。ハズレ演出を毎回見せないための仕様）
    const earnedDraws = Math.floor(rallies / ralliesPerDraw);
    const limitReached = (todayDrawGames ?? 0) >= dailyGameLimit;
    const dailyLimited = earnedDraws > 0 && limitReached;
    const drawCount = limitReached ? 0 : earnedDraws;

    // プレイ記録
    const { data: play, error: playErr } = await supabase
      .from("game_plays")
      .insert({
        guest_device_id: device.id,
        rally_count: rallies,
        draw_count: drawCount,
      })
      .select("id")
      .single();
    if (playErr) throw playErr;

    // 月間上限チェック（発行済みクーポン数。JSTの月初から）
    const countIssued = async (type: "ramen" | "badminton") => {
      const { count, error } = await supabase
        .from("coupons")
        .select("id", { count: "exact", head: true })
        .eq("type", type)
        .gte("issued_at", monthStart);
      if (error) throw error;
      return count ?? 0;
    };
    const ramenAvailable = (await countIssued("ramen")) < ramenCap;
    const badmintonAvailable = (await countIssued("badminton")) < badmintonCap;

    // 抽選: ラリー数ぶん回す。ラーメン優先、当たった時点で終了（1ゲーム最大1本）
    let prizeType: "ramen" | "badminton" | null = null;
    for (let i = 0; i < drawCount && prizeType === null; i++) {
      if (ramenAvailable && secureRandom() < 1 / ramenOdds) {
        prizeType = "ramen";
      } else if (badmintonAvailable && secureRandom() < 1 / badmintonOdds) {
        prizeType = "badminton";
      }
    }
    const isWinner = prizeType !== null;

    // 結果を記録
    const { error: drawErr } = await supabase.from("lottery_draws").insert({
      game_play_id: play.id,
      is_winner: isWinner,
      prize_type: prizeType,
    });
    if (drawErr) throw drawErr;

    if (isWinner) {
      const { error: couponErr } = await supabase.from("coupons").insert({
        type: prizeType,
        guest_device_id: device.id,
        status: "unclaimed",
        game_play_id: play.id,
      });
      if (couponErr) throw couponErr;

      // 当選通知メール送信
      try {
        const prizeLabel = prizeType === "ramen" ? "ラーメン無料券" : "バド活動無料券";
        await supabase.functions.invoke("send-lottery-notification", {
          body: {
            deviceUuid,
            prizeType,
            prizeLabel,
            rallyCount: rallies,
          },
        });
      } catch (emailErr) {
        console.error("[rally-lottery] email error:", emailErr);
        // メール送信エラーは無視（抽選結果は確定）
      }
    }

    const body: LotteryResponse = { drawCount, isWinner, prizeType, dailyLimited };
    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[rally-lottery] error:", err);
    return new Response(JSON.stringify({ error: "internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
