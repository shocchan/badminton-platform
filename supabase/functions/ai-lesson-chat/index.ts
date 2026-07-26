// AI日本語コース: テキスト会話ターン生成 Edge Function（新規・音声Realtime系とは完全独立）
//
// - 学習者の発言を理解し、直前の文脈を踏まえた「反応＋（任意の短い訂正）＋質問1つ」をJSONで返す
// - 終了制御はpromptに任せず、サーバーでも強制する（studentTurns >= maxTurns → shouldClose固定）
// - 認可: JWT（本人）＋ sessionId（本人所有・in_progress のセッション）。ai-lesson-translate と同型
// - OPENAI_API_KEY はこの関数内のみ。応答・ログへ出さない
//
// デプロイ: supabase functions deploy ai-lesson-chat --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAT_MODEL = Deno.env.get("AI_LESSON_CHAT_MODEL") ?? "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

// ── サーバー側ガード（promptに依存しない上限） ──────────────────────────
const MAX_TURNS_CAP = 10;        // クライアント指定があってもこれ以上は伸ばせない
const MAX_HISTORY_MSGS = 16;     // モデルへ渡す履歴の最大件数（直近を優先）
const MAX_MSG_CHARS = 300;       // 履歴1件の最大文字数
const MAX_INPUT_CHARS = 500;     // 最新の学習者入力の最大文字数
const MAX_OUTPUT_TOKENS = 300;   // 出力トークン上限
const OPENAI_TIMEOUT_MS = 20000; // OpenAI呼び出しタイムアウト

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const CHAT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    reaction: { type: "string" },                      // 学習者の発言内容への短い反応（1〜2文）
    correction: { type: ["string", "null"] },          // 必要な時だけの短い言い直し例（1文・無ければnull）
    question: { type: ["string", "null"] },            // 次の質問（1つだけ・closingではnull）
    shouldClose: { type: "boolean" },                  // まとめへ移行すべきか
    understoodSummary: { type: "string" },             // 学習者の状況の理解メモ（内部用・短く）
    closingMessage: { type: ["string", "null"] },      // 終了時の一言（shouldClose時のみ）
  },
  required: ["reaction", "correction", "question", "shouldClose", "understoodSummary", "closingMessage"],
};

/** JWT→ユーザーID（失敗時 null）。メール等はログへ出さない */
const userIdFromJwt = async (req: Request, url: string, key: string): Promise<string | null> => {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  if (!res.ok) return null;
  const u = await res.json();
  return u?.id ?? null;
};

const restHeaders = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" });

/** セッション所有＋進行中の確認（translate と同型） */
const authorize = async (req: Request, sessionId: string, url: string, serviceKey: string): Promise<boolean> => {
  const userId = await userIdFromJwt(req, url, serviceKey);
  if (!userId) return false;
  const sRes = await fetch(
    `${url}/rest/v1/ai_learning_sessions?id=eq.${sessionId}&select=id,learner_id,completion_status`,
    { headers: restHeaders(serviceKey) },
  );
  if (!sRes.ok) return false;
  const session = (await sRes.json())?.[0];
  if (!session || session.completion_status !== "in_progress") return false;
  const lRes = await fetch(
    `${url}/rest/v1/ai_learners?id=eq.${session.learner_id}&select=user_id`,
    { headers: restHeaders(serviceKey) },
  );
  if (!lRes.ok) return false;
  const learner = (await lRes.json())?.[0];
  return !!learner && learner.user_id === userId;
};

interface HistoryMsg { role: string; text: string; }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!apiKey || !supaUrl || !serviceKey) return json(503, { error: "not_configured" });

    let body: {
      sessionId?: string; locale?: string; learnerLevel?: number;
      missionTitleJa?: string; targetExpression?: string; meaningZh?: string;
      history?: HistoryMsg[]; studentText?: string;
      maxTurns?: number; closingAnnounced?: boolean;
      askedQuestions?: string[];
    };
    try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }

    const sessionId = typeof body.sessionId === "string" && body.sessionId.length <= 64 ? body.sessionId : null;
    if (!sessionId) return json(400, { error: "session_required" });
    if (!(await authorize(req, sessionId, supaUrl, serviceKey))) return json(403, { error: "forbidden" });

    const studentText = String(body.studentText ?? "").slice(0, MAX_INPUT_CHARS).trim();
    if (!studentText) return json(400, { error: "empty_input" });

    // 履歴は直近のみ・各発話を切り詰め（トークン肥大防止）
    const history = (Array.isArray(body.history) ? body.history : [])
      .filter((m) => m && (m.role === "student" || m.role === "tutor") && typeof m.text === "string")
      .slice(-MAX_HISTORY_MSGS)
      .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_MSG_CHARS) }));

    // ターン数はクライアント申告を信用せず履歴から導出（今回の入力を含める）
    const maxTurns = Math.min(Math.max(Number(body.maxTurns) || 8, 4), MAX_TURNS_CAP);
    const studentTurns = history.filter((m) => m.role === "student").length + 1;
    const forceClose = studentTurns >= maxTurns;                 // モデル出力に関係なく終了
    const closingNow = forceClose || body.closingAnnounced === true; // 「あと1つ」宣言済み→今回で終了

    const asked = (Array.isArray(body.askedQuestions) ? body.askedQuestions : [])
      .filter((q) => typeof q === "string").slice(-10).map((q) => q.slice(0, 120));

    const zhUser = body.locale === "zh";
    const sys = [
      "あなたは「翔子先生」。中国語母語話者に日本語会話を教える、温かく簡潔な先生です。",
      "学習者とテキストで日本語会話の練習をしています。JSONで応答します。",
      "",
      "【今日のレッスン】",
      `テーマ: ${String(body.missionTitleJa ?? "").slice(0, 80) || "(自由会話)"}`,
      `目標表現: ${String(body.targetExpression ?? "").slice(0, 40) || "(なし)"}`,
      `学習者レベル: ${Math.min(Math.max(Number(body.learnerLevel) || 3, 1), 5)}/5（低いほどやさしい日本語で）`,
      "",
      "【応答ルール（厳守）】",
      "1. reaction: 学習者の直前の発言から、人・場所・出来事・感情のうち最低1点を具体的に拾って短く反応する（1〜2文）。",
      "   一般論やテンプレ相づちだけで返さない。過去の会話内容と矛盾しない。",
      "2. question: 会話を1歩だけ深める質問をちょうど1つ。話題を勝手に変えない。",
      `   次の質問は既出なので繰り返さない（言い換えもしない）: ${asked.length ? asked.map((q) => `「${q}」`).join(" ") : "(なし)"}`,
      "3. correction: 毎回入れない。意味が通じない・目標表現に直結する場合だけ、自然な言い直しを1文（例:「〜の方が自然です」）。それ以外は null。",
      "4. 学習者の文が曖昧で意味が取れない時だけ、questionを短い確認（「〜という意味ですか？」）にする。理解できる時は確認しない。",
      "5. 学習者が終了を望んだら（「終わりたい」等）、question=null・shouldClose=true にする。",
      "6. 目標表現は自然な場面で1〜2回使う機会を作る。無理に何度も要求しない。",
      "7. 応答は全体で日本語2〜4文。学習者レベルに合わせたやさしい語彙。絵文字は使わない。",
      zhUser
        ? "8. 学習者が明らかに困っている時だけ、reactionの末尾に短い中国語補足（1文・括弧書き）を付けてよい。"
        : "8. 中国語は使わない。",
      "9. understoodSummary: 学習者の状況をあなたがどう理解したか、日本語1文で（内部メモ・学習者には見えない）。",
      "",
      closingNow
        ? "【重要・終了ターン】これが最後の応答です。question=null、shouldClose=true とし、closingMessage に「今日の会話をまとめましょう」という趣旨の一言を入れる。新しい質問・新しい話題を出さない。"
        : studentTurns >= maxTurns - 1
          ? "【終盤】次が最後の質問です。reactionの後、「あと1つだけ聞かせてください」と前置きして最後の質問を1つ。shouldClose=false のまま。"
          : "【通常】shouldClose は原則 false。closingMessage は null。",
    ].join("\n");

    const messages = [
      { role: "system", content: sys },
      ...history.map((m) => ({ role: m.role === "student" ? "user" : "assistant", content: m.text })),
      { role: "user", content: studentText },
    ];

    const openaiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: CHAT_MODEL,
        temperature: 0.6,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages,
        response_format: { type: "json_schema", json_schema: { name: "chat_turn", strict: true, schema: CHAT_SCHEMA } },
      }),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });

    if (!openaiRes.ok) {
      let kind = "unknown";
      try { const e = await openaiRes.json(); kind = e?.error?.code ?? e?.error?.type ?? "unknown"; } catch { /* noop */ }
      console.error(`chat openai error: status=${openaiRes.status} kind=${kind}`);
      return json(502, { error: "openai_error", status: openaiRes.status });
    }

    const data = await openaiRes.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return json(502, { error: "empty_turn" });
    let turn: {
      reaction?: string; correction?: string | null; question?: string | null;
      shouldClose?: boolean; understoodSummary?: string; closingMessage?: string | null;
    };
    try { turn = JSON.parse(content); } catch { return json(502, { error: "bad_turn_json" }); }

    // ── サーバー側の最終ガード（モデル出力を上書き） ──
    if (closingNow || turn.shouldClose) {
      turn.shouldClose = true;
      turn.question = null;                       // 終了宣言後に新しい質問を出さない
      if (!turn.closingMessage) turn.closingMessage = "ありがとうございます。今日の会話をまとめましょう。";
    }
    // 質問の重複ガード（既出質問と完全一致なら落とす→フロントが定型の最終質問に差し替え可能）
    if (turn.question && asked.includes(turn.question)) turn.question = null;

    return json(200, {
      turn: {
        reaction: String(turn.reaction ?? "").slice(0, 300),
        correction: turn.correction ? String(turn.correction).slice(0, 200) : null,
        question: turn.question ? String(turn.question).slice(0, 200) : null,
        shouldClose: !!turn.shouldClose,
        closingMessage: turn.closingMessage ? String(turn.closingMessage).slice(0, 200) : null,
      },
      studentTurns,
      maxTurns,
      usage: data?.usage ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("ai-lesson-chat error:", msg);
    return json(msg.includes("timed out") || msg.includes("TimeoutError") ? 504 : 500, { error: "internal_error" });
  }
});
