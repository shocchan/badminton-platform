// AI日本語レッスン: 会話ログから構造化レポートを生成する Edge Function
//
// - 通常の OPENAI_API_KEY はこの関数内だけで使用し、レスポンス・ログへ出さない
// - 招待コード（AI_LESSON_DEMO_CODE）で最低限のアクセス制御（フロントは別途Supabase認証）
// - 出力は JSON Schema で構造化（response_format: json_schema）
// - 失敗時は 502 を返し、フロント側はローカル判定の簡易レポートにフォールバックする
//
// デプロイ: supabase functions deploy ai-lesson-report --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isQuotaError, quotaEnvFrom, reportQuotaOutage } from "../_shared/aiQuota.ts";

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
    // 中国語補助（UX-004）。requiredに含めない=生成失敗してもreport全体を壊さない
    achievementsZh: { type: "array", items: { type: "string" }, maxItems: 3 },
    encouragementZh: { type: "string" },
  },
  required: ["todaySummaryJa", "todaySummaryZh", "achievements", "corrections", "naturalPhrases", "targetUsage", "encouragementJa"],
};

/** JWTからユーザーIDを取り出す（失敗時 null）。メール等はログへ出さない */
const userIdFromJwt = async (req: Request, url: string, key: string): Promise<string | null> => {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const res = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ?? null;
};

const restHeaders = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    if (!apiKey) return json(503, { error: "openai_key_not_configured" });

    const supaUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let body: {
      code?: string; sessionId?: string; targetExpression?: string; themeJa?: string;
      utterances?: Utterance[]; detectedUsage?: string;
    };
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

    // コースモード（sessionIdあり）はJWT必須。デモは従来どおり招待コード。
    const sessionId = typeof body.sessionId === "string" && body.sessionId.length <= 64
      ? body.sessionId : null;

    if (sessionId) {
      if (!supaUrl || !serviceKey) return json(503, { error: "not_configured" });
      const userId = await userIdFromJwt(req, supaUrl, serviceKey);
      if (!userId) return json(401, { error: "unauthorized" });

      // セッションの所有者確認＋既存レポートの確認を同時に行う
      const sRes = await fetch(
        `${supaUrl}/rest/v1/ai_learning_sessions?id=eq.${sessionId}&select=id,learner_id,report`,
        { headers: restHeaders(serviceKey) },
      );
      if (!sRes.ok) return json(403, { error: "session_not_found" });
      const sRows = await sRes.json();
      const session = Array.isArray(sRows) ? sRows[0] : null;
      if (!session) return json(403, { error: "session_not_found" });

      const lRes = await fetch(
        `${supaUrl}/rest/v1/ai_learners?id=eq.${session.learner_id}&select=user_id`,
        { headers: restHeaders(serviceKey) },
      );
      const lRows = lRes.ok ? await lRes.json() : null;
      const learner = Array.isArray(lRows) ? lRows[0] : null;
      if (!learner || learner.user_id !== userId) return json(403, { error: "forbidden" });

      // 既にレポートがあるセッションは再生成しない（二重生成・上書き消失の防止）
      if (session.report) {
        return json(200, { report: session.report, cached: true });
      }
    } else {
      const demoCode = Deno.env.get("AI_LESSON_DEMO_CODE");
      if (!demoCode) return json(503, { error: "demo_code_not_configured" });
      if (!body.code || body.code !== demoCode) return json(403, { error: "invalid_code" });
    }

    const utterances = Array.isArray(body.utterances) ? body.utterances.slice(0, 60) : [];
    if (utterances.length === 0) return json(400, { error: "no_utterances" });

    // 会話ログを短く整形（生徒＝S / 翔子先生＝T）。長すぎる発話は切り詰める
    const transcript = utterances
      .map((u) => `${u.speaker === "student" ? "S" : u.speaker === "tutor" ? "T" : "-"}: ${String(u.transcript).slice(0, 200)}`)
      .join("\n");

    const sys = [
      "あなたは中国語母語話者向けの日本語会話コーチのアシスタントです。",
      "実際の会話ログだけに基づいて、短い学習レポートをJSONで作成します。固定文は使わないでください。",
      "",
      "【厳守】判定の原則",
      "1. 「S:」の行だけが生徒の発話です。「T:」は翔子先生（AI）のお手本・質問であり、",
      "   生徒が言ったことにしてはいけません。T の文を achievements や corrections.original に使わない。",
      "2. 生徒が実際に言っていない文を「言えた」と書かない。ログに無いことは書かない。",
      "3. 文字起こしは不完全なことがあります。意味が取れない断片は、断定せず触れないでください。",
      "   「〜と言えました」と断定してよいのは、S の行にその表現が明確に現れている場合だけです。",
      "4. corrections.original には、S の行に実際にある文だけを入れてください（言い換えや要約をしない）。",
      "5. 生徒が中国語で話した部分は、内容を理解したうえで、",
      "   「日本語ではこう言える」という自然な日本語例として naturalPhrases に入れてください。",
      "   中国語のまま achievements に書かないでください。",
      "",
      "【各項目】",
      "・todaySummaryJa: 今日できたことを1〜2文（やさしい日本語）",
      "・todaySummaryZh: 同じ内容の自然な簡体字中国語",
      "・achievements: 生徒が実際にできたこと（最大3個、日本語）",
      "・corrections: 直したほうがよい所（最大2個まで。重要なものだけ。無ければ空配列）",
      "・naturalPhrases: 今日使える自然な言い方（最大2個）",
      "・targetUsage: 目標表現の使用を次で判定する。",
      "    self = 直前に T が同じ表現を言っていない状態で、S が自分から使った",
      "    hint = T がお手本や一部を示した直後に S が使った（復唱を含む）",
      "    none = S の発話に目標表現が現れない",
      "  あいまいな場合は必ず低いほう（self より hint、hint より none）に倒してください。",
      "・encouragementJa: 短い励まし（1文）",
      "・achievementsZh: achievements の各項目と同じ順序の自然な簡体字中国語訳",
      "・encouragementZh: encouragementJa と同じ内容の自然な簡体字中国語",
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
      // 残高切れは生徒に見せない（画面は「アップデート中」へ）。運営にはメールで即通知する
      if (isQuotaError(openaiRes.status, kind)) {
        const qenv = quotaEnvFrom((k) => Deno.env.get(k));
        if (qenv) await reportQuotaOutage(qenv, "report");
        return json(503, { error: "ai_unavailable" });
      }
      return json(502, { error: "openai_error", status: openaiRes.status });
    }

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return json(502, { error: "empty_report" });
    let report: unknown;
    try { report = JSON.parse(content); } catch { return json(502, { error: "bad_report_json" }); }

    // コースモードでは、生成したレポートをサーバー側で保存する。
    // 以降の再取得は上の cached 分岐で同じ内容が返り、内容が消えることはない。
    if (sessionId && supaUrl && serviceKey) {
      await fetch(`${supaUrl}/rest/v1/ai_learning_sessions?id=eq.${sessionId}`, {
        method: "PATCH",
        headers: { ...restHeaders(serviceKey), Prefer: "return=minimal" },
        body: JSON.stringify({ report }),
      }).catch(() => { /* 保存失敗してもレポート自体は返す */ });
    }

    return json(200, { report });
  } catch (e) {
    console.error("ai-lesson-report error:", e instanceof Error ? e.message : "unknown");
    return json(500, { error: "internal_error" });
  }
});
