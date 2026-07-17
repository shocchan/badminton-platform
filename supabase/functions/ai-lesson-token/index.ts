// AI日本語レッスン: OpenAI Realtime API の ephemeral client secret 発行
//
// フロント → この関数（招待コード検証）→ OpenAI /v1/realtime/client_secrets → ek_... をフロントへ返す
// フロントはその ek_... を使って WebRTC で OpenAI Realtime API に直接接続する。
//
// セキュリティ方針:
// - 通常の OPENAI_API_KEY はこの関数内でのみ使用し、レスポンス・ログへ一切出さない
// - ブラウザへ返すのは短命（5分）の client secret のみ
// - 招待コードはフロントの VITE_AI_LESSON_DEMO_CODE とは別に、
//   Supabase Secret AI_LESSON_DEMO_CODE でサーバー側でも検証する（こちらが正）
// - system instructions はサーバー側で組み立てる（クライアントから任意注入させない）
// - リクエストボディ・APIキーはログへ出さない
//
// デプロイ: supabase functions deploy ai-lesson-token --no-verify-jwt
// （デモは未ログイン利用のため JWT 検証なし。ゲートは招待コード）

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { buildVoiceInstructions, buildWrapUpInstructions } from "./voiceTutorPrompt.ts";
import type { VoicePromptParams } from "./voiceTutorPrompt.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 2026-07時点の正式モデルID（developers.openai.com で確認済み）。
// 安価な代替: gpt-realtime-2.1-mini（音声 $10/$20 per 1M tokens）
const REALTIME_MODEL = Deno.env.get("AI_LESSON_REALTIME_MODEL") ?? "gpt-realtime-2.1";
const VOICE = "marin"; // 公式推奨（marin / cedar）
const OPENAI_CLIENT_SECRETS_URL = "https://api.openai.com/v1/realtime/client_secrets";

// ── 簡易レート制限（isolateメモリ内。コールドスタートでリセットされる） ──
// 連打による複数トークン発行を抑える最低限の装置。
// フェーズ2: Supabaseテーブル（ai_lesson_usage 等）で「1日3回・端末単位」の本格制限と
// 同時セッション数の上限をここに追加する。
const issuedAt: number[] = [];
const RATE_MAX = 5; // 直近1分間の最大発行数
const RATE_WINDOW_MS = 60_000;

const isRateLimited = (): boolean => {
  const now = Date.now();
  while (issuedAt.length > 0 && now - issuedAt[0] > RATE_WINDOW_MS) issuedAt.shift();
  if (issuedAt.length >= RATE_MAX) return true;
  issuedAt.push(now);
  return false;
};

// OPENAI_API_KEY の取得。
// 【一時的フォールバック】2026-07-17時点、ダッシュボードでの登録時に名前へ
// 「Name\n」ラベルが混入した状態（"Name\nOPENAI_API_KEY"）で保存されている。
// 正しい名前で見つからない場合のみ、OPENAI_API_KEY で終わる環境変数を探し、
// 値に混入した「Value」ラベル・空白を除去して使う。値はログへ一切出さない。
// 正しい名前で再登録されたらこのフォールバックは削除してよい。
const getOpenAiKey = (): string | null => {
  const direct = Deno.env.get("OPENAI_API_KEY");
  if (direct) return direct.trim();
  for (const [name, value] of Object.entries(Deno.env.toObject())) {
    if (name !== "OPENAI_API_KEY" && name.trim().endsWith("OPENAI_API_KEY")) {
      const cleaned = value.replace(/^\s*[Vv]alue\s*/, "").replace(/\s+/g, "");
      if (cleaned.startsWith("sk-")) return cleaned;
    }
  }
  return null;
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// クライアントから受けるのは構造化された短い文字列のみ（長文注入を拒否）
const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
};

const ZH_SUPPORT = ["whenStuck", "grammar", "often", "none"] as const;
const CORRECTION = ["summary", "important", "immediate"] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  try {
    const demoCode = Deno.env.get("AI_LESSON_DEMO_CODE");
    if (!demoCode) {
      // Secret未設定時は全リクエストを拒否（フェイルクローズ）
      return json(503, { error: "demo_code_not_configured" });
    }
    const apiKey = getOpenAiKey();
    if (!apiKey) {
      return json(503, { error: "openai_key_not_configured" });
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "invalid_json" });
    }

    const code = cleanText(body.code, 64);
    if (!code || code !== demoCode) {
      return json(403, { error: "invalid_code" });
    }

    if (isRateLimited()) {
      return json(429, { error: "rate_limited" });
    }

    const plan = (body.plan ?? {}) as Record<string, unknown>;
    const target = (plan.target ?? {}) as Record<string, unknown>;
    const zhSupport = ZH_SUPPORT.find((v) => v === plan.zhSupport) ?? "whenStuck";
    const correction = CORRECTION.find((v) => v === plan.correction) ?? "summary";

    const params: VoicePromptParams = {
      themeLabel: cleanText(plan.themeLabel, 60) ?? "今日あったこと",
      estimatedLevel: cleanText(plan.estimatedLevel, 30) ?? "N4〜N3",
      zhSupport,
      correction,
      targetLabel: cleanText(target.label, 60) ?? "「〜たことがあります」",
      targetExample: cleanText(target.example, 120) ?? "日本の大会に出たことがあります。",
      targetZhMeaning: cleanText(target.zhMeaning, 120) ?? "曾经…过（表达经历）",
      targetZhExample: cleanText(target.zhExample, 120) ?? "我参加过日本的比赛。",
    };

    const instructions = buildVoiceInstructions(params);

    const openaiRes = await fetch(OPENAI_CLIENT_SECRETS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // 1回のレッスンは最大3分半のため、トークン寿命は5分で十分
        expires_after: { anchor: "created_at", seconds: 300 },
        session: {
          type: "realtime",
          model: REALTIME_MODEL,
          instructions,
          output_modalities: ["audio"],
          audio: {
            input: {
              // ja/zh が混在するため language は固定しない
              transcription: { model: "gpt-4o-transcribe" },
              turn_detection: {
                type: "semantic_vad",
                eagerness: "low", // 日本語学習者の長めの間を許容
                create_response: true,
                interrupt_response: true, // 生徒の割り込みでAI発話を停止
              },
            },
            output: { voice: VOICE },
          },
        },
      }),
    });

    if (!openaiRes.ok) {
      // OpenAIのレスポンス全文はログへ出さない（ステータスとエラー種別のみ）
      let kind = "unknown";
      try {
        const err = (await openaiRes.json()) as { error?: { type?: string; code?: string } };
        kind = err.error?.code ?? err.error?.type ?? "unknown";
      } catch { /* noop */ }
      console.error(`openai client_secrets error: status=${openaiRes.status} kind=${kind}`);
      return json(502, { error: "openai_error", status: openaiRes.status, kind });
    }

    const secret = (await openaiRes.json()) as { value?: string; expires_at?: string };
    if (!secret.value) {
      console.error("openai client_secrets error: no value in response");
      return json(502, { error: "openai_error", status: 500, kind: "no_secret" });
    }

    // wrapUpInstructions: 残り約35秒でクライアントが session.update に使う「まとめ移行」版。
    // ephemeral secret 取得後はクライアントが session.update を送れる仕様のため、
    // ここで本文を返してもセキュリティ上の追加リスクはない（APIキーとは無関係）。
    return json(200, {
      clientSecret: secret.value,
      expiresAt: secret.expires_at ?? null,
      model: REALTIME_MODEL,
      voice: VOICE,
      wrapUpInstructions: buildWrapUpInstructions(params),
    });
  } catch (e) {
    // エラー詳細にリクエスト内容が混ざらないようメッセージのみ
    console.error("ai-lesson-token error:", e instanceof Error ? e.message : "unknown");
    return json(500, { error: "internal_error" });
  }
});
