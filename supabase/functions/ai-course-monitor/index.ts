// AIコース 運用監視（毎日 pg_cron から呼ばれる）
//
// なぜ要るか（2026-08-21 Phase 0 調査）:
//   error_code も failed も台帳に記録されていたが、**誰も見ていなかった**。
//   「入金済みなのに学習を始められない人」がいても運営が気づけない状態だった。
//
// ここはI/Oだけ。**何をアラートにするかは _shared/aiCourseMonitor.ts（純粋関数）**で、
// ローカルのテスト22件が境界を固定している。
//
// 安全側の設計:
//   - 読むのは購入台帳・セッション・cron健全性・イベント件数だけ（学習データは書き換えない）
//   - アラートは dedupe_key で1行に集約（同じ事象を大量に増やさない）
//   - メールは info@（運営）だけ。**学習者へは絶対に送らない**
//   - detail にPIIを入れない（純関数側で担保）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  detectAlerts, shouldSendDigest, buildDigestMail, DEFAULT_THRESHOLDS,
  type MonitorThresholds,
} from "../_shared/aiCourseMonitor.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const MAIL_FROM = "日本語の相棒 <noreply@kawabado.com>";
const DAY_AGO = () => new Date(Date.now() - 86_400_000).toISOString();

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("LIFECYCLE_CRON_SECRET") ?? Deno.env.get("REMINDER_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "not_configured" }, 500);
  const db = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const since = DAY_AGO();

  const get = async (path: string): Promise<any[]> => {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: db });
    return r.ok ? await r.json() : [];
  };
  const rpc = async (fn: string): Promise<any[]> => {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/${fn}`, { method: "POST", headers: db, body: "{}" });
    return r.ok ? await r.json() : [];
  };

  // ── 設定（しきい値・通知先はDBで一元管理） ──
  const cfgRows = await get("ai_config?key=eq.monitoring&select=value");
  const cfg = cfgRows?.[0]?.value ?? {};
  const thresholds: MonitorThresholds = {
    provisionStuckMinutes: Number(cfg.provision_stuck_minutes ?? DEFAULT_THRESHOLDS.provisionStuckMinutes),
    conversationErrorThreshold: Number(cfg.conversation_error_threshold ?? DEFAULT_THRESHOLDS.conversationErrorThreshold),
    cronStaleHours: Number(cfg.cron_stale_hours ?? DEFAULT_THRESHOLDS.cronStaleHours),
  };
  const alertEmail: string = String(cfg.alert_email ?? "info@kawabado.com");
  const cooldownHours = Number(cfg.digest_cooldown_hours ?? 20);
  const lastDigestISO: string | null = cfg.last_digest_at ? String(cfg.last_digest_at) : null;

  // ── 入力を集める ──
  const [purchaseRows, sessionRows, cronRows, eventRows] = await Promise.all([
    get("ai_plan_purchases?select=id,status,livemode,user_id,error,created_at,provisioned_at&order=created_at.desc&limit=500"),
    get(`ai_learning_sessions?select=completion_status,error_code,started_at&started_at=gte.${since}&limit=2000`),
    rpc("ai_monitor_cron_health"),
    get(`ai_course_events?select=id&created_at=gte.${since}&limit=1`),
  ]);

  const alerts = detectAlerts({
    purchases: purchaseRows.map((p) => ({
      id: String(p.id), status: String(p.status ?? ""), livemode: !!p.livemode,
      userId: p.user_id ? String(p.user_id) : null,
      error: p.error === null || p.error === undefined ? null : String(p.error),
      createdAtISO: String(p.created_at),
      provisionedAtISO: p.provisioned_at ? String(p.provisioned_at) : null,
    })),
    sessions: sessionRows.map((s) => ({
      completionStatus: String(s.completion_status ?? ""),
      errorCode: s.error_code === null || s.error_code === undefined ? null : String(s.error_code),
      startedAtISO: String(s.started_at),
    })),
    cronJobs: cronRows.map((j) => ({
      jobname: String(j.jobname), lastStatus: j.last_status ? String(j.last_status) : null,
      lastStartISO: j.last_start ? String(j.last_start) : null,
    })),
    recentEventCount: eventRows.length,
    hasRecentSessions: sessionRows.length > 0,
    nowISO: new Date().toISOString(),
    thresholds,
  });

  if (dryRun) {
    return json({ ok: true, dryRun: true, detected: alerts.length, kinds: alerts.map((a) => a.dedupeKey) });
  }

  // ── upsert（同じ dedupe_key は件数と最終発生だけ更新。再発したら未解決へ戻す） ──
  const nowISO = new Date().toISOString();
  let created = 0, updated = 0;
  for (const a of alerts) {
    const existing = await get(`ai_course_alerts?dedupe_key=eq.${encodeURIComponent(a.dedupeKey)}&select=id,occurrences`);
    if (existing.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/ai_course_alerts?id=eq.${existing[0].id}`, {
        method: "PATCH", headers: { ...db, Prefer: "return=minimal" },
        body: JSON.stringify({
          occurrences: Number(existing[0].occurrences ?? 1) + 1,
          last_seen_at: nowISO, detail: a.detail,
          resolved: false, resolved_at: null, resolved_by: null,
        }),
      });
      updated += 1;
    } else {
      await fetch(`${supabaseUrl}/rest/v1/ai_course_alerts`, {
        method: "POST", headers: { ...db, Prefer: "return=minimal" },
        body: JSON.stringify({
          dedupe_key: a.dedupeKey, kind: a.kind, severity: a.severity,
          title: a.title, detail: a.detail, subject_user_id: a.subjectUserId,
          first_seen_at: nowISO, last_seen_at: nowISO,
        }),
      });
      created += 1;
    }
  }

  // ── 日次サマリー（運営宛のみ。critical は即・warning はクールダウン後） ──
  let mailed = false;
  const send = shouldSendDigest({ alerts, lastDigestISO, nowISO, cooldownHours });
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  if (send && resendKey) {
    const mail = buildDigestMail(alerts);
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: MAIL_FROM, to: [alertEmail], subject: mail.subject, text: mail.text }),
    });
    mailed = r.ok;
    if (r.ok) {
      // 送信時刻を設定へ書き戻す（クールダウンの基準）
      await fetch(`${supabaseUrl}/rest/v1/ai_config?key=eq.monitoring`, {
        method: "PATCH", headers: { ...db, Prefer: "return=minimal" },
        body: JSON.stringify({ value: { ...cfg, last_digest_at: nowISO } }),
      });
    } else {
      console.error("monitor digest send failed", r.status, await r.text());
    }
  }

  return json({ ok: true, detected: alerts.length, created, updated, mailed });
});
