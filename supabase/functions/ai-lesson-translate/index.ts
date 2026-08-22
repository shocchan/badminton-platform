// AI日本語コース: 翔子先生の日本語発話 → 短い簡体字中国語の補助訳
//
// 用途: 音声レッスン中、確定した日本語字幕の下に出す「意味理解の補助」だけを短く返す。
//   - 会話音声は待たせない（この関数は字幕確定後に非同期で呼ばれる。失敗しても音声・日本語字幕は継続）
//   - 生徒の発話は翻訳しない（呼び出し側が翔子先生の発話だけを渡す）
//   - 固定カリキュラムの説明・例文はフロントの meaningZh 等を使うため、ここへは来ない（自由応答のみ）
//
// セキュリティ:
//   - JWT + 予約済みセッションの所有者のみ（ai-lesson-token / report と同じ認可）
//   - OPENAI_API_KEY はこの関数内だけで使用し、レスポンス・ログへ出さない
//   - コスト記録できるよう usage（トークン数）を返す
//
// デプロイ: supabase functions deploy ai-lesson-translate --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isQuotaError, quotaEnvFrom, reportQuotaOutage } from "../_shared/aiQuota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TRANSLATE_MODEL = Deno.env.get("AI_LESSON_TRANSLATE_MODEL") ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const restHeaders = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

/** JWT + セッション所有者の確認（ai-lesson-report と同じ考え方）。メール等はログへ出さない */
const authorize = async (req: Request, sessionId: string, url: string, serviceKey: string): Promise<boolean> => {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return false;
  const userRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: serviceKey, Authorization: `Bearer ${token}` } });
  if (!userRes.ok) return false;
  const userId = (await userRes.json())?.id;
  if (!userId) return false;

  const sRes = await fetch(`${url}/rest/v1/ai_learning_sessions?id=eq.${sessionId}&select=learner_id`, { headers: restHeaders(serviceKey) });
  if (!sRes.ok) return false;
  const session = (await sRes.json())?.[0];
  if (!session) return false;
  const lRes = await fetch(`${url}/rest/v1/ai_learners?id=eq.${session.learner_id}&select=user_id`, { headers: restHeaders(serviceKey) });
  const learner = lRes.ok ? (await lRes.json())?.[0] : null;
  return !!learner && learner.user_id === userId;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!apiKey) return json(503, { error: "openai_key_not_configured" });
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json(503, { error: "not_configured" });

    let body: { sessionId?: string; text?: string; targetHint?: string };
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

    const sessionId = typeof body.sessionId === "string" && body.sessionId.length <= 64 ? body.sessionId : null;
    if (!sessionId) return json(400, { error: "missing_session" });

    const text = typeof body.text === "string" ? body.text.trim().slice(0, 400) : "";
    if (!text) return json(400, { error: "empty_text" });

    if (!(await authorize(req, sessionId, url, serviceKey))) return json(401, { error: "unauthorized" });

    const targetHint = typeof body.targetHint === "string" ? body.targetHint.slice(0, 60) : "";

    const sys = [
      "あなたは日本語学習者（中国語母語）のための字幕アシスタントです。",
      "日本語の先生の発話を、意味が分かる範囲で『短い』簡体字中国語にしてください。",
      "ルール:",
      "・要点だけ。長く訳さない（原文より短く、1文程度）。",
      "・逐語訳より、学習者が理解できる自然な中国語に。",
      "・日本語の学習対象表現（例:「〜てもいいですか」）は、必要なら「」内に日本語のまま残してよい。",
      "・先生が既に中国語を使っている部分は、そのまま活かして簡潔にまとめる。",
      "・出力は中国語の訳文のみ。前置き・記号・引用符で全体を囲わない。",
      targetHint ? `・今日の学習対象: ${targetHint}` : "",
    ].filter(Boolean).join("\n");

    const openaiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: TRANSLATE_MODEL,
        temperature: 0.2,
        max_tokens: 120,
        messages: [{ role: "system", content: sys }, { role: "user", content: text }],
      }),
    });

    if (!openaiRes.ok) {
      let kind = "unknown";
      try { const e = await openaiRes.json(); kind = e?.error?.code ?? e?.error?.type ?? "unknown"; } catch { /* noop */ }
      console.error(`translate openai error: status=${openaiRes.status} kind=${kind}`);
      // 残高切れは生徒に見せない（画面は「アップデート中」へ）。運営にはメールで即通知する
      if (isQuotaError(openaiRes.status, kind)) {
        const qenv = quotaEnvFrom((k) => Deno.env.get(k));
        if (qenv) await reportQuotaOutage(qenv, "translate");
        return json(503, { error: "ai_unavailable" });
      }
      return json(502, { error: "openai_error" });
    }

    const data = await openaiRes.json();
    const zh = (data?.choices?.[0]?.message?.content ?? "").trim();
    if (!zh) return json(502, { error: "empty_translation" });

    // usage を返してフロント側でコスト集計できるようにする
    const usage = data?.usage ?? null;
    return json(200, { zh, usage });
  } catch (e) {
    console.error("ai-lesson-translate error:", e instanceof Error ? e.message : "unknown");
    return json(500, { error: "internal_error" });
  }
});
