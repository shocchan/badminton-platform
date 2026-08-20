// AIコース 申込の受付（6か月伴走コースの連絡先フォーム・2026-08-20）。
//
// なぜ作ったか:
//   これまでブラウザから **匿名キーで直接テーブルへ insert** していた。
//   匿名キーは配信JSに埋まっている（そういう設計のキー）ので、
//   URLが公開された瞬間に誰でも無制限にゴミ申込を流し込める。
//   広告を出す前に「人間しか通れない入口」へ替える必要があった。
//
// この関数が受け持つこと:
//   1. Turnstile（Cloudflareのbot判定）の検証。**鍵が設定されているときだけ**必須にする
//      → 未設定の環境（staging等）でも壊れない。設定した瞬間に保護が有効になる
//   2. 入力の検証（サーバー側でもやる。画面の検証はいつでも回避できる）
//   3. service_role で保存（テーブルへの匿名INSERT権限は migration で剥奪する）
//   4. 申込が入ったことを管理者へメール通知（見落とし防止）
//
// デプロイ:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy \
//     ai-course-apply --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { FUNCTION_PLAN_CATALOG } from "../_shared/aiCoursePlans.ts";

const ADMIN_EMAIL = "info@kawabado.com";
const MAIL_FROM = "日本語の相棒 <noreply@kawabado.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Turnstileの検証（Cloudflare siteverify）。失敗＝人間と確認できなかった */
const verifyTurnstile = async (token: string, secret: string, ip: string | null): Promise<boolean> => {
  try {
    const form = new FormData();
    form.append("secret", secret);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", body: form,
    });
    const data = await res.json();
    return data?.success === true;
  } catch (e) {
    console.error("turnstile verify error:", e);
    return false; // 検証できないときは通さない（bot対策を入れた意味を残す）
  }
};

const isEmail = (v: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";

    const body = await req.json().catch(() => ({}));

    // ── bot対策（鍵があるときだけ必須）──
    if (turnstileSecret) {
      const token = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
      if (!token) return json({ error: "captcha_required" }, 400);
      const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for");
      if (!(await verifyTurnstile(token, turnstileSecret, ip))) {
        return json({ error: "captcha_failed" }, 400);
      }
    }

    // ── 入力の検証（画面の検証は回避できるのでここでも必ず見る）──
    const a = body.application ?? {};
    const c = body.consent ?? {};
    const plan = FUNCTION_PLAN_CATALOG.find((p) => p.id === a.selectedPlanId);
    if (!plan || plan.status !== "published") return json({ error: "invalid_plan" }, 400);

    const name = String(a.name ?? "").trim().slice(0, 100);
    const email = String(a.email ?? "").trim().slice(0, 254);
    const note = String(a.note ?? "").trim().slice(0, 2000);
    if (!name) return json({ error: "name_required" }, 400);
    if (!isEmail(email)) return json({ error: "email_invalid" }, 400);
    if (!c.termsVersion) return json({ error: "consent_required" }, 400);

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // ── 保存（申込 → 同意の順。逆にすると、申込が落ちたとき
    //    どの申込にも紐づかない同意記録が残る）──
    const applicationId = String(a.applicationId ?? crypto.randomUUID());
    const insRes = await fetch(`${supabaseUrl}/rest/v1/ai_plan_applications`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        application_id: applicationId,
        selected_plan_id: plan.id,
        // 申込者が実際に見た価格ラベル。カタログを直しても書き換えない
        displayed_price_label: String(a.displayedPriceLabel ?? plan.priceLabelJa),
        plan_version: Number(a.planVersion ?? plan.version),
        application_at: String(a.applicationAt ?? new Date().toISOString()),
        locale: a.locale === "zh" ? "zh" : "ja",
        application_status: "submitted",
        name, email, note,
      }),
    });
    if (!insRes.ok) {
      const text = await insRes.text();
      console.error("application insert failed:", insRes.status, text);
      // 保存できていないのに成功と言わない（画面はメール連絡先を出す）
      return json({ error: "store_failed" }, 500);
    }

    const conRes = await fetch(`${supabaseUrl}/rest/v1/ai_terms_consents`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        subject_id: applicationId,
        subject_kind: String(c.subjectKind ?? "application"),
        terms_version: String(c.termsVersion),
        consented_at: String(c.consentedAt ?? new Date().toISOString()),
        locale: c.locale === "zh" ? "zh" : "ja",
      }),
    });
    if (!conRes.ok) {
      console.error("consent insert failed:", conRes.status, await conRes.text());
      return json({ error: "store_failed" }, 500);
    }

    // ── 管理者へ通知（申込に気づかないのが最悪なので必ず送る）──
    if (resendKey) {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: MAIL_FROM, to: [ADMIN_EMAIL], reply_to: email,
          subject: `📩【AIコース】${plan.nameJa}のお申し込み（${name}様）`,
          text: [
            `プラン: ${plan.nameJa}（${a.displayedPriceLabel ?? plan.priceLabelJa}）`,
            `お名前: ${name}`,
            `メール: ${email}`,
            `言語: ${a.locale === "zh" ? "中国語" : "日本語"}`,
            "",
            `ご質問・ご要望:`,
            note || "（なし）",
            "",
            "※ このメールに返信すると申込者へ直接届きます。",
            "※ 決済はまだ発生していません。内容を確認して個別にご案内してください。",
          ].join("\n"),
        }),
      }).catch((e) => console.error("apply notify failed:", e));
    }

    return json({ ok: true });
  } catch (e) {
    console.error("ai-course-apply error:", e);
    return json({ error: "internal" }, 500);
  }
});
