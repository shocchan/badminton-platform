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

/**
 * 任意フィールドのサニタイズ: null/空文字に加え、モデルが「null」「なし」等の
 * 文字列を返すケースも null へ倒す（フロントで「✏️ null」と表示された不具合の再発防止）。
 */
const EMPTYISH = new Set(["null", "none", "undefined", "nan", "n/a", "-", "なし", "特になし", "无", "没有"]);
const cleanField = (v: unknown, maxLen: number): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || EMPTYISH.has(t.toLowerCase())) return null;
  return t.slice(0, maxLen);
};

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
    translationZh: { type: ["string", "null"] },       // 応答全体の自然な簡体字訳（中国語母語者向け・折り畳み表示用）
    readingAids: {                                     // 学習者レベルより難しい語の読み（最大3語）
      type: "array", maxItems: 3,
      items: {
        type: "object", additionalProperties: false,
        properties: { text: { type: "string" }, reading: { type: "string" } },
        required: ["text", "reading"],
      },
    },
  },
  required: ["reaction", "correction", "question", "shouldClose", "understoodSummary", "closingMessage", "translationZh", "readingAids"],
};

/** 学習者レベル（JLPT目安）→ 語彙・文長ルール。N3の品質を最優先 */
const levelRules = (estimatedLevel: string): string => {
  const lv = (estimatedLevel || "N3").toUpperCase();
  if (lv.includes("N5") || lv.includes("N4")) {
    return [
      "【語彙・文の難しさ（最重要・N5〜N4学習者）】",
      "・1文は15文字以内を目安に、とても短く。1回の応答は2文＋質問1つまで。",
      "・N4より難しい語彙・文法を使わない。漢語（〜的、〜性、経験、印象 等）を避け、やまとことばで言う。",
      "・例:「印象に残っていること」→「よく覚えていること」/「どのように感じましたか」→「どんな気持ちでしたか」",
    ].join("\n");
  }
  if (lv.includes("N3")) {
    return [
      "【語彙・文の難しさ（最重要・N3学習者）】",
      "・1文は20文字前後で短く。1回の応答は2〜3文（反応1〜2文＋質問1つ）。",
      "・抽象的な漢字語（印象・経験・総合・状況・把握 等）を避け、日常語で言い換える。",
      "・N2以上の文法・語彙を不用意に使わない。どうしても必要な難語は「印象（いんしょう）」のように読みを添え、readingAidsにも入れる。",
      "・例:「印象に残っている経験を教えてください」→「日本で、よく覚えていることはありますか？」",
      "・例:「もう少し詳しく説明してください」→「その時、何がありましたか？」",
      "・例:「どのように感じましたか」→「その時、どんな気持ちでしたか？」",
      "・過度な敬語を使わない（です・ます で十分）。文法説明を会話中にしない。",
    ].join("\n");
  }
  if (lv.includes("N1")) {
    return "【語彙・文の難しさ】N1学習者。自然な日本語でよいが、1回の応答は3〜4文・質問1つを守る。";
  }
  return [
    "【語彙・文の難しさ（N2学習者）】",
    "・1回の応答は2〜4文・質問1つ。N1レベルの硬い書き言葉は避け、自然な話し言葉で。",
    "・専門的・抽象的すぎる語には readingAids で読みを添える。",
  ].join("\n");
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
      sessionId?: string; locale?: string; learnerLevel?: number; estimatedLevel?: string;
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

    const estLevel = String(body.estimatedLevel ?? "N3").slice(0, 8);
    const sys = [
      "あなたは「翔子先生」。中国語母語話者に日本語会話を教える、温かく簡潔な先生です。",
      "学習者とテキストで日本語会話の練習をしています。JSONで応答します。",
      "",
      "【今日のレッスン】",
      `テーマ: ${String(body.missionTitleJa ?? "").slice(0, 80) || "(自由会話)"}`,
      `目標表現: ${String(body.targetExpression ?? "").slice(0, 40) || "(なし)"}`,
      `学習者レベル: JLPT ${estLevel}（難易度 ${Math.min(Math.max(Number(body.learnerLevel) || 3, 1), 5)}/5）`,
      "",
      levelRules(estLevel),
      "",
      "【応答ルール（厳守）】",
      "1. reaction: 学習者の直前の発言から、人・場所・出来事・感情のうち最低1点を具体的に拾って短く反応する（1〜2文）。",
      "   一般論やテンプレ相づちだけで返さない。過去の会話内容と矛盾しない。",
      "2. question: 会話を1歩だけ深める質問をちょうど1つ。話題を勝手に変えない。",
      `   次の質問は既出なので繰り返さない（言い換えもしない）: ${asked.length ? asked.map((q) => `「${q}」`).join(" ") : "(なし)"}`,
      "3. correction: 毎回入れない。意味が通じない・目標表現に直結する場合だけ、自然な言い直しを1文（例:「〜の方が自然です」）。それ以外は JSON の null 値にする（文字列で「null」「なし」と書かない）。",
      "4. 学習者の文が曖昧で意味が取れない時だけ、questionを短い確認（「〜という意味ですか？」）にする。理解できる時は確認しない。",
      "5. 学習者が終了を望んだら（「終わりたい」等）、question=null・shouldClose=true にする。",
      "6. 目標表現は自然な場面で1〜2回使う機会を作る。無理に何度も要求しない。",
      "7. 応答は全体で日本語2〜4文。学習者レベルに合わせたやさしい語彙。絵文字は使わない。",
      "8. translationZh: 応答全体（reaction＋correction＋question/closingMessage）の自然な簡体字訳を必ず入れる。学習者（中国語母語者）が押した時だけ表示される折り畳み用。本文には中国語を混ぜない。",
      "9. understoodSummary: 学習者の状況をあなたがどう理解したか、日本語1文で（内部メモ・学習者には見えない）。",
      "10. readingAids: 学習者レベルより難しい語を使った場合だけ、その語と読み（ひらがな）を最大3語。一般的なやさしい語（N5〜N3相当）には付けない。使わなければ空配列。",
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
      translationZh?: string | null; readingAids?: { text?: string; reading?: string }[];
    };
    try { turn = JSON.parse(content); } catch { return json(502, { error: "bad_turn_json" }); }

    // ── サーバー側の最終ガード（モデル出力を上書き・「null」等の擬似空文字列も除去） ──
    let correction = cleanField(turn.correction, 200);
    let question = cleanField(turn.question, 200);
    let closingMessage = cleanField(turn.closingMessage, 200);
    const shouldClose = closingNow || !!turn.shouldClose;
    if (shouldClose) {
      question = null;                            // 終了宣言後に新しい質問を出さない
      if (!closingMessage) closingMessage = "ありがとうございます。今日の会話をまとめましょう。";
    }
    // 質問の重複ガード（既出質問と完全一致なら落とす→フロントが定型の最終質問に差し替え可能）
    if (question && asked.includes(question)) question = null;

    // readingAids のサーバー側ガード（最大3・各フィールド長制限・文字列のみ）
    const readingAids = (Array.isArray(turn.readingAids) ? turn.readingAids : [])
      .filter((a) => a && typeof a.text === "string" && typeof a.reading === "string" && a.text.length > 0)
      .slice(0, 3)
      .map((a) => ({ text: String(a.text).slice(0, 20), reading: String(a.reading).slice(0, 30) }));

    return json(200, {
      turn: {
        reaction: cleanField(turn.reaction, 300) ?? "",
        correction,
        question,
        shouldClose,
        closingMessage: shouldClose ? closingMessage : null,
        // 本文と同じ応答内で生成（翻訳ボタンを押しても追加課金なし）。受講者は中国語母語者のためlocale問わず返す
        translationZh: cleanField(turn.translationZh, 600),
        readingAids,
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
