// AI日本語レッスン: 会話ログから構造化レポートを生成する Edge Function
//
// - 通常の OPENAI_API_KEY はこの関数内だけで使用し、レスポンス・ログへ出さない
// - 招待コード（AI_LESSON_DEMO_CODE）で最低限のアクセス制御（フロントは別途Supabase認証）
// - 出力は JSON Schema で構造化（response_format: json_schema）
// - 失敗時は 502 を返し、フロント側はローカル判定の簡易レポートにフォールバックする
//
// デプロイ: supabase functions deploy ai-lesson-report --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REPORT_MODEL = Deno.env.get("AI_LESSON_REPORT_MODEL") ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Utterance { speaker: string; transcript: string; }

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    todaySummaryJa: { type: "string" },
    todaySummaryZh: { type: "string" },
    achievements: { type: "array", items: { type: "string" }, maxItems: 3 },
    corrections: {
      type: "array", maxItems: 2,
      items: {
        type: "object", additionalProperties: false,
        properties: {
          original: { type: "string" },
          improved: { type: "string" },
          noteZh: { type: "string" },
        },
        required: ["original", "improved", "noteZh"],
      },
    },
    naturalPhrases: { type: "array", items: { type: "string" }, maxItems: 2 },
    targetUsage: { type: "string", enum: ["self", "hint", "none"] },
    encouragementJa: { type: "string" },
  },
  required: ["todaySummaryJa", "todaySummaryZh", "achievements", "corrections", "naturalPhrases", "targetUsage", "encouragementJa"],
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const demoCode = Deno.env.get("AI_LESSON_DEMO_CODE");
    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!demoCode) return json(503, { error: "demo_code_not_configured" });
    if (!apiKey) return json(503, { error: "openai_key_not_configured" });

    let body: {
      code?: string; targetExpression?: string; themeJa?: string;
      utterances?: Utterance[]; detectedUsage?: string;
    };
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

    if (!body.code || body.code !== demoCode) return json(403, { error: "invalid_code" });

    const utterances = Array.isArray(body.utterances) ? body.utterances.slice(0, 60) : [];
    if (utterances.length === 0) return json(400, { error: "no_utterances" });

    // 会話ログを短く整形（生徒＝S / ゆい先生＝T）。長すぎる発話は切り詰める
    const transcript = utterances
      .map((u) => `${u.speaker === "student" ? "S" : u.speaker === "tutor" ? "T" : "-"}: ${String(u.transcript).slice(0, 200)}`)
      .join("\n");

    const sys = [
      "あなたは中国語母語話者向けの日本語会話コーチのアシスタントです。",
      "実際の会話ログだけに基づいて、短い学習レポートをJSONで作成します。固定文は使わないでください。",
      "・todaySummaryJa: 今日できたことを1〜2文（やさしい日本語）",
      "・todaySummaryZh: 同じ内容の自然な簡体字中国語",
      "・achievements: 具体的にできたこと（最大3個、日本語）",
      "・corrections: 生徒が実際に言った文の中で直したほうがよい所（最大2個）。originalは生徒の発話、improvedは自然な言い方、noteZhは簡体字の短い説明",
      "・naturalPhrases: 今日使える自然な言い方（最大2個）",
      "・targetUsage: 目標表現を self=自力 / hint=ヒントあり / none=未使用 のどれで使ったか。ログから保守的に判定（あいまいなら none 寄り）",
      "・encouragementJa: 短い励まし（1文）",
      "生徒が実際に言っていないことを作らないでください。",
    ].join("\n");

    const user = [
      `今日の目標表現: ${body.targetExpression ?? "(未指定)"}`,
      `テーマ: ${body.themeJa ?? "(未指定)"}`,
      `システム側の暫定判定(参考): ${body.detectedUsage ?? "unknown"}`,
      "会話ログ:",
      transcript,
    ].join("\n");

    const openaiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: REPORT_MODEL,
        temperature: 0.3,
        max_tokens: 700,
        messages: [{ role: "system", content: sys }, { role: "user", content: user }],
        response_format: { type: "json_schema", json_schema: { name: "lesson_report", strict: true, schema: REPORT_SCHEMA } },
      }),
    });

    if (!openaiRes.ok) {
      let kind = "unknown";
      try { const e = await openaiRes.json(); kind = e?.error?.code ?? e?.error?.type ?? "unknown"; } catch { /* noop */ }
      console.error(`report openai error: status=${openaiRes.status} kind=${kind}`);
      return json(502, { error: "openai_error", status: openaiRes.status });
    }

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return json(502, { error: "empty_report" });
    let report: unknown;
    try { report = JSON.parse(content); } catch { return json(502, { error: "bad_report_json" }); }

    return json(200, { report });
  } catch (e) {
    console.error("ai-lesson-report error:", e instanceof Error ? e.message : "unknown");
    return json(500, { error: "internal_error" });
  }
});
