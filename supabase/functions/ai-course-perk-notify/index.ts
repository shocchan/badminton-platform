// 紹介の特典で「オリジナルMV」「文法完全版」が選ばれたら、運営（info@kawabado.com）へメールで知らせる。
// 2026-09-12 CEO「MVを選ばれた場合、僕に通知はくるの？」→ 管理画面を見に行かなくても届くようにする。
//
// - 呼ぶのは選んだ本人（JWT必須）。特典の行は referrer_user_id = 本人 のものだけ読む
// - 同じ特典で二重に送らない（ai_course_mail_log の dedupe_key）
// - 1か月追加（month）はサーバーが自動で処理するので通知しない（管理画面には残る）
// デプロイ: ./scripts/deploy-edge-functions.sh ai-course-perk-notify
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const ADMIN_EMAIL = "info@kawabado.com";
const STUDENT_ID_DOMAIN = "@id.badminton-platform.pages.dev";
const PERK_LABEL: Record<string, string> = { mv: "オリジナルMV", grammar: "日本語会話用の文法完全版", month: "利用1か月追加" };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");
    const supaUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const asUser = createClient(supaUrl, anonKey, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: userData } = await asUser.auth.getUser();
    const user = userData?.user;
    if (!user) return json(401, { error: "unauthorized" });

    const body = (await req.json().catch(() => ({}))) as { perkId?: string };
    const perkId = typeof body.perkId === "string" ? body.perkId : "";
    if (!/^[0-9a-f-]{36}$/.test(perkId)) return json(400, { error: "perkId required" });

    const admin = createClient(supaUrl, serviceKey);
    const { data: perk } = await admin
      .from("ai_invite_perks")
      .select("id, perk, invite_code, invitee_user_id, chosen_at")
      .eq("id", perkId).eq("referrer_user_id", user.id)
      .maybeSingle();
    if (!perk || !perk.perk) return json(404, { error: "not_found" });
    if (perk.perk === "month") return json(200, { ok: true, skipped: "auto" });

    // 二重送信よけ
    const dedupe = `perk_notify:${perk.id}`;
    const { data: sent } = await admin.from("ai_course_mail_log").select("id").eq("dedupe_key", dedupe).maybeSingle();
    if (sent) return json(200, { ok: true, skipped: "already_sent" });

    const [{ data: me }, { data: invitee }, { data: signup }] = await Promise.all([
      admin.from("ai_learners").select("display_name").eq("user_id", user.id).maybeSingle(),
      admin.from("ai_learners").select("display_name").eq("user_id", perk.invitee_user_id).maybeSingle(),
      admin.from("ai_course_signup_grants").select("wechat_id").eq("email", user.email ?? "").maybeSingle(),
    ]);
    const email = user.email ?? "";
    const loginLabel = email.endsWith(STUDENT_ID_DOMAIN) ? `ログインID: ${email.slice(0, -STUDENT_ID_DOMAIN.length)}` : `メール: ${email || "不明"}`;
    const label = PERK_LABEL[perk.perk] ?? perk.perk;

    const text = [
      "紹介の特典が選ばれました。渡したら管理画面（運用タブ → 紹介の特典）で「渡した」を押してください。",
      "",
      `■ 選んだ人（紹介者）: ${me?.display_name || "（名前未設定）"}（${loginLabel}${signup?.wechat_id ? `・WeChat: ${signup.wechat_id}` : ""}）`,
      `■ 選んだ特典: ${label}`,
      `■ 紹介された人: ${invitee?.display_name || "（名前未設定）"}`,
      `■ 招待コード: ${perk.invite_code}`,
      `■ 選んだ日時: ${perk.chosen_at ?? "-"}`,
      "",
      perk.perk === "mv" ? "→ MVを作って、本人にWeChatで渡してください。" : "→ 本人は画面からスライドを開けます。渡し漏れの確認用です。",
      "",
      "管理画面: https://study.kawabado.com/ja/ai-course/admin?tab=ops",
    ].join("\n");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "kawabado AIコース <noreply@kawabado.com>",
        to: [ADMIN_EMAIL],
        subject: `🎁【AIコース】紹介の特典: ${me?.display_name || email}さんが「${label}」を選びました`,
        text,
      }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);

    await admin.from("ai_course_mail_log").insert({ user_id: user.id, kind: "perk_notify", dedupe_key: dedupe });
    return json(200, { ok: true });
  } catch (err) {
    console.error(err);
    return json(500, { error: String(err) });
  }
});
