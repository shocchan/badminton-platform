// AIコースの問題報告（困ったときは）を保存し、運営（info@kawabado.com）へメール通知する。
//
// 経緯: 旧実装はクライアントから ai_issue_reports へ INSERT するだけで通知が無く、
// 運営が気づけなかった（CEO報告 2026-08-15）。本Functionが保存＋通知を一括で行う。
//
// 本人確認: 誰からの報告かは**JWTからサーバー側で導出**する（クライアントの自己申告を信じない）。
// 添付は調査に必要な最小限のみ。APIキー・OTP・発話本文・パスワードは扱わない。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "info@kawabado.com";
const STUDENT_ID_DOMAIN = "@id.badminton-platform.pages.dev";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface IssueReportBody {
  comment: string;
  page?: string;
  errorCode?: string | null;
  sessionId?: string | null;
  userAgent?: string;
  platform?: string;
  online?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 報告者の特定（JWT必須）
    const authHeader = req.headers.get("Authorization") ?? "";
    const asUser = createClient(supaUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await asUser.auth.getUser();
    const user = userData?.user;
    if (!user) return json(401, { error: "unauthorized" });

    const body: IssueReportBody = await req.json();
    const comment = (body.comment ?? "").toString().slice(0, 1000).trim();
    if (!comment) return json(400, { error: "comment required" });

    const admin = createClient(supaUrl, serviceKey);
    const { data: learner } = await admin
      .from("ai_learners")
      .select("id, display_name, preferred_language")
      .eq("user_id", user.id)
      .maybeSingle();

    // ログインID方式（<id>@id.badminton-platform.pages.dev）は内部ドメインなので ID 表記に戻す
    const email = user.email ?? "";
    const loginLabel = email.endsWith(STUDENT_ID_DOMAIN)
      ? `ログインID: ${email.slice(0, -STUDENT_ID_DOMAIN.length)}`
      : `メール: ${email || "不明"}`;
    const displayName = learner?.display_name ?? "（学習データ未作成）";

    // 1. 保存（record of record）。通知が失敗しても報告自体は残す
    const { error: insertError } = await admin.from("ai_issue_reports").insert({
      learner_id: learner?.id ?? null,
      session_id: body.sessionId ?? null,
      page: (body.page ?? "").toString().slice(0, 200),
      error_code: body.errorCode ?? null,
      user_agent: (body.userAgent ?? "").toString().slice(0, 300),
      platform: (body.platform ?? "").toString().slice(0, 100),
      online: body.online ?? true,
      comment,
    });
    if (insertError) throw new Error(`insert failed: ${insertError.message}`);

    // 2. 運営へ通知（誰からか分かる形で）
    const subject = `🆘【AIコース】${displayName}さんから問題報告`;
    const text = [
      "AI日本語コースの「困ったときは」から問題報告が届きました。",
      "",
      `■ 報告者: ${displayName}（${loginLabel}）`,
      `■ 学習者ID: ${learner?.id ?? "なし"}`,
      `■ ページ: ${body.page ?? "不明"}`,
      `■ エラーコード: ${body.errorCode ?? "なし"}`,
      `■ 端末: ${body.platform ?? "不明"} / ${body.userAgent ?? "不明"}`,
      `■ 通信状態: ${body.online === false ? "オフライン気味" : "オンライン"}`,
      "",
      "■ 内容:",
      comment,
      "",
      "---",
      "一覧: Supabase Dashboard → Table Editor → ai_issue_reports",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "kawabado AIコース <noreply@kawabado.com>",
        to: [ADMIN_EMAIL],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Resend error ${res.status}: ${detail}`);
    }

    return json(200, { ok: true });
  } catch (err) {
    console.error(err);
    return json(500, { error: String(err) });
  }
});
