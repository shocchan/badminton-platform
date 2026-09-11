// 招待リンクからの登録（2026-09-11 CEO決定）: メールアドレスを入れるだけで、
// ID（＝メールアドレス）・パスワード・個人リンク（/learn/コード）をメールで届ける。
//
// なぜ OTP（6桁の確認番号）をやめるか:
//   Supabase 内蔵の送信は 1時間2通が上限で、qq.com / 163.com へ届かないことも多い。
//   こちらは Resend（noreply@kawabado.com・3日離脱メールと同じ）で送る。
//
// 流れ（すべて service_role・ブラウザには URL だけ返す。パスワードは返さない）:
//   1. 招待コード照合 → 登録許可（ai_course_signup_grants）を作る（ai_redeem_invite）
//      登録許可の期限は 24 時間 → 30 日に延ばす（個人リンクを数日後に開いても学習者行を作れるように）
//   2. パスワード付きのアカウントを作る（auth admin API・メール確認済み扱い）
//   3. 個人リンクの学習コードを発行（ai_service_issue_learning_code）
//   4. メールを送る（ID・パスワード・個人リンク）
//   5. 送った記録（ai_course_mail_log・dedupe_key で二重送信を防ぐ）
//   受講権（7日）は、個人リンクから入って学習者行ができた瞬間に DB 側が付ける
//   （ai_learners_provision_access・20260911150000 で直したもの）。
//
// 守ること:
//   - 既に登録済みのメールには何もしない（他人がパスワードを作り直せてはいけない）
//   - IP ごとの回数制限（学習コードの照合と同じ装置を使う）
//   - パスワードはログにも応答にも出さない
//
// デプロイ: ./scripts/deploy-edge-functions.sh ai-course-invite-signup（未ログインから呼ばれる＝JWT検証OFF）

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_RE = /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/;
const MAIL_FROM = "日本語の相棒 <noreply@kawabado.com>";
const REPLY_TO = "info@kawabado.com";
const STUDY_ORIGIN = "https://study.kawabado.com";
/** 紛らわしい字（0/O/1/I/L/U）を使わない。学習コード・招待コードと同じ文字集合 */
const PW_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const PW_LENGTH = 12;
/** 登録許可の有効期間。個人リンクを数日後に開いても学習者行を作れるように */
const GRANT_DAYS = 30;

const sha256Hex = async (s: string): Promise<string> => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
};
const randomPassword = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(PW_LENGTH * 2));
  let out = "";
  for (const b of bytes) {
    if (out.length >= PW_LENGTH) break;
    if (b < 240) out += PW_ALPHABET[b % 30]; // 240 = 30×8 → 偏りなし
  }
  while (out.length < PW_LENGTH) out += PW_ALPHABET[crypto.getRandomValues(new Uint8Array(1))[0] % 30];
  return out;
};
const formatCode = (raw: string): string => (raw.match(/.{1,4}/g) ?? []).join("-");
const clean = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

type Lang = "ja" | "zh";
const mailText = (lang: Lang, p: { email: string; password: string; url: string }): { subject: string; text: string } =>
  lang === "zh"
    ? {
      subject: "【日语搭档】你的账号和个人链接（7天免费）",
      text: [
        "你好，这里是「日语搭档」。",
        "",
        "你的账号已经准备好了。打开下面的个人链接就能直接进入，不需要输入密码。",
        "",
        `▶ 个人链接（点开即可开始）`,
        p.url,
        "",
        "以后每次也从这个链接进。请把这封邮件保存好。",
        "",
        "如果需要用ID和密码登录（换手机、或者链接打不开时）:",
        `  ID（邮箱）: ${p.email}`,
        `  密码: ${p.password}`,
        `  登录页面: ${STUDY_ORIGIN}/zh/ai-course/login`,
        "",
        "接下来的7天:",
        "  第1天  8分钟测出你现在的位置（词汇・语法）",
        "  第2〜6天  每天10分钟，只做你做错过、快忘掉的题",
        "  第3天  一次模拟考，看清哪一科最弱",
        "  这7天不含AI会话。测试结果・错题本・单词图鉴在7天后也不会消失。",
        "",
        "打不开、或者哪里不明白，直接回复这封邮件就行。",
        "",
        "日语搭档（安田）",
      ].join("\n"),
    }
    : {
      subject: "【日本語の相棒】アカウントと個人リンク（7日間無料）",
      text: [
        "こんにちは。「日本語の相棒」です。",
        "",
        "アカウントの準備ができました。下の個人リンクを開くだけで入れます。パスワードの入力はいりません。",
        "",
        "▶ 個人リンク（開くだけで始まります）",
        p.url,
        "",
        "次回からも同じリンクで入れます。このメールは保存しておいてください。",
        "",
        "IDとパスワードでログインする場合（端末を変えたとき・リンクが開けないとき）:",
        `  ID（メールアドレス）: ${p.email}`,
        `  パスワード: ${p.password}`,
        `  ログイン画面: ${STUDY_ORIGIN}/ja/ai-course/login`,
        "",
        "これからの7日:",
        "  1日目  8分で現在地（ことば・文法）が分かります",
        "  2〜6日目  毎日10分、間違えた問題と忘れかけた問題だけ",
        "  3日目  ミニ模試を1回。どの科目が弱いかが見えます",
        "  この7日にAI会話は含みません。診断結果・錯題本・単語図鑑は7日後も消えません。",
        "",
        "開けない・分からないときは、このメールにそのまま返信してください。",
        "",
        "日本語の相棒（安田）",
      ].join("\n"),
    };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, code: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!supabaseUrl || !serviceKey) return json({ ok: false, code: "not_configured" }, 503);

  const dbHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: dbHeaders, body: JSON.stringify(args) });
    if (!res.ok) { console.error(`rpc ${fn} failed:`, res.status); return null; }
    return await res.json().catch(() => null);
  };

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ ok: false, code: "invalid_json" }, 400); }
  const email = clean(body.email, 254).toLowerCase();
  const code = clean(body.code, 32).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const lang: Lang = body.lang === "ja" ? "ja" : "zh";
  // WeChat ID（必須・2〜30字）。メールが届かないときの連絡先。名前は聞かない（学習画面で表示名を聞く）
  const wechatId = clean(body.wechatId, 40).replace(/^@/, "");
  if (!EMAIL_RE.test(email)) return json({ ok: false, code: "invalid_email" }, 400);
  if (wechatId.length < 2 || wechatId.length > 30) return json({ ok: false, code: "invalid_wechat" }, 400);
  if (!INVITE_RE.test(code)) return json({ ok: false, code: "invalid_invite" }, 403);

  // ── IP ごとの回数制限（学習コードの照合と同じ装置。IP は生で残さない） ──
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "unknown";
  const ipHash = await sha256Hex(`invite-signup:${ip}`);
  const throttle = await rpc("ai_code_login_throttle", { p_ip_hash: ipHash });
  if (throttle && throttle.ok === false) {
    return json({ ok: false, code: "rate_limited", retryAfter: throttle.retryAfter ?? 900 }, 429);
  }
  const record = (ok: boolean, reason: string) => rpc("ai_code_login_record", { p_ip_hash: ipHash, p_ok: ok, p_reason: reason });

  // ── 登録済みのメールには何もしない（パスワードを作り直させない） ──
  const has = await rpc("ai_email_has_learner", { p_email: email });
  if (has === true) { await record(false, "already_registered"); return json({ ok: false, code: "already_registered" }, 409); }
  // （学習者行が無い登録済みアカウントは、下の auth admin の作成が 422 を返すことで弾く）

  // ── 1. 招待コードの照合 → 登録許可 ──
  const redeemed = await rpc("ai_redeem_invite", { p_code: code, p_email: email });
  if (!redeemed || redeemed.ok !== true) { await record(false, "invalid_invite"); return json({ ok: false, code: "invalid_invite" }, 403); }
  // 登録許可の期限を延ばす（個人リンクを数日後に開いても、学習者行を作れるように）
  const grantRows = await fetch(`${supabaseUrl}/rest/v1/ai_course_signup_grants?email=eq.${encodeURIComponent(email)}&select=channel`, {
    method: "PATCH", headers: { ...dbHeaders, Prefer: "return=representation" },
    body: JSON.stringify({ expires_at: new Date(Date.now() + GRANT_DAYS * 86_400_000).toISOString(), wechat_id: wechatId }),
  }).then((r) => (r.ok ? r.json() : [])).catch(() => []) as { channel?: string | null }[];
  const channel: string = grantRows[0]?.channel ?? "invite";

  // ── 2. パスワード付きのアカウント（メール確認済み扱い） ──
  const password = randomPassword();
  const createRes = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST", headers: dbHeaders,
    body: JSON.stringify({
      email, password, email_confirm: true,
      user_metadata: { source: "invite_signup", provisioned_at: new Date().toISOString(), wechat_id: wechatId },
    }),
  });
  if (!createRes.ok) {
    console.error("invite signup: user create failed", createRes.status);
    await record(false, "create_failed");
    return json({ ok: false, code: createRes.status === 422 ? "already_registered" : "create_failed" }, createRes.status === 422 ? 409 : 502);
  }
  const userId: string = ((await createRes.json()) as { id?: string })?.id ?? "";
  if (!userId) return json({ ok: false, code: "create_failed" }, 502);

  // ── 2.5 受講権（7日）をここで作る ──
  // 学習画面は「受講権があるか」を学習者行を作る前に確かめる（開通していません、の画面）。
  // 学習者行ができた瞬間に付ける DB トリガーでは間に合わない（2026-09-12 CEO 実機で判明）
  // 7日は「本人が学習画面で始めた瞬間」から数える（既存の体験パスと同じ仕組み・ai_start_trial）。
  // 登録から30日以内に始めればよい。メールが届いてすぐ開けない人の7日を減らさない
  const planId: string = typeof redeemed.planId === "string" ? redeemed.planId : "free-7d";
  const accessDays = 7;
  const activationDays = 30;
  const accessRes = await fetch(`${supabaseUrl}/rest/v1/ai_course_access`, {
    method: "POST", headers: { ...dbHeaders, Prefer: "return=minimal,resolution=ignore-duplicates" },
    body: JSON.stringify({
      user_id: userId, valid_from: new Date().toISOString(),
      valid_until: new Date(Date.now() + activationDays * 86_400_000).toISOString(),
      trial_days: accessDays,
      plan_id: planId, source: "invite", note: `招待から自動発行 / ${channel}`, granted_by: "ai-course-invite-signup",
    }),
  });
  if (!accessRes.ok) {
    console.error("invite signup: access grant failed", accessRes.status);
    return json({ ok: false, code: "grant_failed" }, 502);
  }

  // ── 3. 個人リンクの学習コード ──
  const issued = await rpc("ai_service_issue_learning_code", { p_user_id: userId, p_label: `invite / ${channel}` });
  if (!issued || issued.ok !== true || typeof issued.raw !== "string") {
    console.error("invite signup: code issue failed for", userId);
    return json({ ok: false, code: "code_failed" }, 500);
  }
  const url = `${STUDY_ORIGIN}/${lang}/learn/${formatCode(issued.raw)}`;

  // ── 4. メール（ID・パスワード・個人リンク） ──
  if (!resendKey) {
    console.error("invite signup: RESEND_API_KEY missing; account created but mail not sent");
    return json({ ok: false, code: "mail_failed" }, 502);
  }
  const mail = mailText(lang, { email, password, url });
  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: MAIL_FROM, to: [email], reply_to: REPLY_TO, subject: mail.subject, text: mail.text }),
  });
  if (!send.ok) {
    console.error("invite signup: mail send failed", send.status);
    return json({ ok: false, code: "mail_failed" }, 502);
  }

  // ── 5. 送った記録（同じ人へ二重に送らない鍵） ──
  await fetch(`${supabaseUrl}/rest/v1/ai_course_mail_log`, {
    method: "POST", headers: { ...dbHeaders, Prefer: "return=minimal" },
    body: JSON.stringify({ user_id: userId, kind: "invite_credentials", dedupe_key: `invite_credentials:${userId}` }),
  }).catch(() => undefined);
  await record(true, "ok");

  return json({ ok: true, sentTo: email });
});
