// AIコース 購入後フォローメール（毎日 pg_cron から呼ばれる）
//
// なぜ要るか（2026-08-21 導線分析）:
//   購入時の1通を送ったきり、そのあと**一切の接触が無かった**。
//   ・600円を買ったのに体験を始めないまま30日で失効しても無音
//   ・60分を使い切っても無音＝1か月プランへ案内する唯一の機会を捨てていた
//
// 送る3通（1人1用件につき1回だけ。ai_course_mail_log の dedupe_key が保証する）:
//   1. trial_not_started … 購入から24時間たっても体験を開始していない
//   2. trial_ended       … 体験の時間が終わった（次の選択肢を出す）
//   3. expiring_soon     … 利用期限まで3日を切った
//
// **誰に何を送るかと本文は _shared/aiCourseLifecycle.ts（純粋関数）**。
// ここはI/Oだけを持つ。受講権テーブルは auth.users への外部キーがあり本番へ検証用の行を
// 置けないので、判定はローカルのテストで固定している（aiCourseLifecycle.test.ts）。
//
// 失敗しても学習データには一切触れない（読むだけ＋ログ表へのinsertのみ）。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildLifecycleMail, lifecycleDedupeKey, selectLifecycleTargets,
  type LifecyclePurchaseRow,
} from "../_shared/aiCourseLifecycle.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ADMIN_EMAIL = "info@kawabado.com";
const MAIL_FROM = "日本語の相棒 <noreply@kawabado.com>";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("LIFECYCLE_CRON_SECRET") ?? Deno.env.get("REMINDER_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!supabaseUrl || !serviceKey || !resendKey) return json({ error: "not_configured" }, 500);

  const db = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;

  // ── 購入由来の受講権をすべて読む（人数が少ないうちは全件で十分・上限は付ける） ──
  const accRes = await fetch(
    `${supabaseUrl}/rest/v1/ai_course_access?source=eq.purchase&select=user_id,plan_id,valid_until,trial_started_at,trial_window_minutes,purchase_id&limit=500`,
    { headers: db },
  );
  if (!accRes.ok) return json({ error: "access_query_failed" }, 500);
  const rows = await accRes.json();

  // ── 宛先メールは購入台帳から引く（受講権側には持たせない） ──
  const purchaseIds = [...new Set(rows.map((r: any) => r.purchase_id).filter(Boolean))];
  const purchases: Record<string, any> = {};
  if (purchaseIds.length) {
    const pRes = await fetch(
      `${supabaseUrl}/rest/v1/ai_plan_purchases?id=in.(${purchaseIds.join(",")})&select=id,buyer_email,locale,provisioned_at,status`,
      { headers: db },
    );
    if (pRes.ok) for (const p of await pRes.json()) purchases[p.id] = p;
  }

  const nowMs = Date.now();
  const targets = selectLifecycleTargets(rows, purchases as Record<string, LifecyclePurchaseRow>, nowMs);

  const results: Record<string, number> = { sent: 0, skipped: 0, failed: 0 };
  const detail: unknown[] = [];

  for (const t of targets) {
    const dedupeKey = lifecycleDedupeKey(t);
    if (dryRun) { detail.push({ ...t, email: "(hidden)", dedupeKey }); results.skipped++; continue; }

    // 冪等: 先にログを立てる。既に有れば 409 が返る＝送信済みなので何もしない
    const lock = await fetch(`${supabaseUrl}/rest/v1/ai_course_mail_log`, {
      method: "POST", headers: { ...db, Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: t.userId, purchase_id: t.purchaseId, kind: t.kind, dedupe_key: dedupeKey }),
    });
    if (lock.status === 409) { results.skipped++; continue; }
    if (!lock.ok) { results.failed++; detail.push({ kind: t.kind, error: "log_insert_failed" }); continue; }

    const mail = buildLifecycleMail(t, nowMs);
    const send = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [t.email], reply_to: ADMIN_EMAIL, subject: mail.subject, text: mail.text }),
    });
    if (send.ok) { results.sent++; continue; }

    /*
      送信に失敗したら**ログを取り消す**。
      ログは「送った証拠」であって「送ろうとした証拠」ではない。
      消さないと、Resendの一時的な失敗ひとつでそのメールが永久に送られなくなる。
    */
    results.failed++;
    detail.push({ kind: t.kind, error: `send_failed_${send.status}` });
    console.error("lifecycle mail send failed", t.kind, send.status, await send.text());
    await fetch(`${supabaseUrl}/rest/v1/ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(dedupeKey)}`, {
      method: "DELETE", headers: { ...db, Prefer: "return=minimal" },
    });
  }

  return json({ ok: true, scanned: rows.length, ...results, ...(dryRun ? { detail } : {}) });
});
