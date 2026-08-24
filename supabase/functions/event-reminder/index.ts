// 開催前日リマインド（毎日 pg_cron から呼ばれる）
//
// なぜ要るか（2026-08-24 実測）:
//   大会エントリー22件のうち15件が cancelled（68%）。それなのに開催日を起点にした
//   自動送信は**1本も無かった**。前日に「いつ・どこで・何を持って・やめるならここから」を
//   一度だけ渡す。行く人にも、行けない人にも役に立つ。
//
// 送る相手（_shared ではなく logic.ts の純粋関数が決める。判定はローカルのテストで固定）:
//   ・大会（tournaments / entries）… status=confirmed かつ未キャンセル
//   ・通常活動（activities / activity_entries）… status=confirmed かつ**メールを持っている人だけ**
//
// 通常活動のメール欄は追加されたばかりで、環境によってはまだ列が無い。
// 列の有無を最初に確かめ、無ければ大会だけを処理する（関数ごと落とさない）。
//
// 多重送信の防止と失敗の記録は購入後フォローメールと同じ台帳（ai_course_mail_log）を
// 共用する。scope='event' で区別する。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  claimDecision, MAX_SEND_ATTEMPTS, retryDelayMs, sendErrorCode,
  type MailLogRow,
} from "../_shared/aiCourseLifecycle.ts";
import {
  buildEventReminderMail, describeTarget, reminderTargetDate, selectEventReminderTargets,
  type ReminderEntry, type ReminderEvent,
} from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const ADMIN_EMAIL = "info@kawabado.com";
// 差出人は必ず認証済みドメイン。process-cancel に残っている onboarding@resend.dev を真似しない
const MAIL_FROM = "川口・蕨バド交流杯 <noreply@kawabado.com>";
const JOB = "event-reminder-daily";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("LIFECYCLE_CRON_SECRET") ?? Deno.env.get("REMINDER_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return json({ error: "not_configured" }, 500);

  const db = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const body = await req.json().catch(() => ({}));

  // 安全弁（payment-reminder と同じ作法）。環境変数が立っている間は実送信しない
  const envDryRun = (Deno.env.get("MAIL_DRY_RUN") ?? Deno.env.get("REMINDER_DRY_RUN")) === "true";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const dryRun = envDryRun || body?.dryRun === true || !resendKey;
  // 動作確認のために「明日」以外の日を見たいときだけ使う（送信の可否には影響しない）
  const daysBefore = Number.isFinite(Number(body?.daysBefore)) ? Number(body.daysBefore) : 1;

  const nowMs = Date.now();
  const nowISO = new Date(nowMs).toISOString();
  const targetDate = reminderTargetDate(nowMs, daysBefore);

  const rest = (path: string, init?: RequestInit) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...db, ...(init?.headers ?? {}) } });
  // PostgREST の生ペイロード。列は SELECT 文で決まり、環境によって有無も変わる
  // （activity_entries.email は追加されたばかり）。ここを厳しく型付けすると
  // 下の詰め替えが全部キャストだらけになるので、境界だけ any で受ける。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const get = async (path: string): Promise<any[]> => {
    const r = await rest(path);
    return r.ok ? await r.json() : [];
  };

  let runId: string | null = null;
  const runRes = await rest("mail_job_runs", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ job: JOB, started_at: nowISO, dry_run: dryRun }),
  });
  if (runRes.ok) runId = (await runRes.json())?.[0]?.id ?? null;

  const finish = async (payload: Record<string, unknown>, error?: string) => {
    if (runId) {
      await rest(`mail_job_runs?id=eq.${runId}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          finished_at: new Date().toISOString(),
          scanned: Number(payload.scanned ?? 0), sent: Number(payload.sent ?? 0),
          failed: Number(payload.failed ?? 0), skipped: Number(payload.skipped ?? 0),
          error: error ?? null,
        }),
      });
    }
    return json({ ok: true, job: JOB, dryRun, targetDate, ...payload });
  };

  // ── 明日ひらく開催回だけを読む ──
  const [tournaments, activities] = await Promise.all([
    get(`tournaments?event_date=eq.${targetDate}&select=id,title,event_date,start_time,end_time,location,venue_address,description,status&limit=50`),
    get(`activities?date=eq.${targetDate}&select=id,title,date,start_time,end_time,location,address,price,status&limit=50`),
  ]);

  const events: ReminderEvent[] = [
    ...tournaments.map((t): ReminderEvent => ({
      kind: "tournament", id: String(t.id), title: String(t.title ?? ""),
      date: String(t.event_date), startTime: t.start_time ?? null, endTime: t.end_time ?? null,
      location: t.location ?? null, address: t.venue_address ?? null,
      description: t.description ?? null, status: t.status ?? null,
    })),
    ...activities.map((a): ReminderEvent => ({
      kind: "activity", id: String(a.id), title: String(a.title ?? ""),
      date: String(a.date), startTime: a.start_time ?? null, endTime: a.end_time ?? null,
      location: a.location ?? null, address: a.address ?? null,
      priceJpy: a.price ?? null, status: a.status ?? null,
    })),
  ];

  const entries: ReminderEntry[] = [];
  const tIds = tournaments.map((t) => t.id);
  if (tIds.length) {
    const rows = await get(
      `entries?tournament_id=in.(${tIds.join(",")})&select=id,tournament_id,name,email,status,is_cancelled,cancel_token&limit=1000`,
    );
    for (const r of rows) {
      entries.push({
        kind: "tournament", entryId: String(r.id), eventId: String(r.tournament_id),
        name: r.name ?? null, email: r.email ?? null, status: r.status ?? null,
        isCancelled: r.is_cancelled ?? null, cancelToken: r.cancel_token ?? null,
      });
    }
  }

  // ── 通常活動: email 列がまだ無い環境でも落ちないようにする ──
  let activityEmailColumn = false;
  const aIds = activities.map((a) => `"${a.id}"`);
  if (aIds.length) {
    const probe = await rest(
      `activity_entries?activity_id=in.(${aIds.join(",")})&select=id,activity_id,name,email,status,quantity&limit=1000`,
    );
    if (probe.ok) {
      activityEmailColumn = true;
      for (const r of await probe.json()) {
        entries.push({
          kind: "activity", entryId: String(r.id), eventId: String(r.activity_id),
          name: r.name ?? null, email: r.email ?? null, status: r.status ?? null,
          quantity: r.quantity ?? null,
        });
      }
    } else {
      // 42703 = undefined_column。列が来るまでは大会だけ送る（黙って全部止めない）
      console.warn("activity_entries.email not available yet", probe.status, await probe.text());
    }
  }

  const targets = selectEventReminderTargets({ events, entries, nowMs, daysBefore });
  const counts = { sent: 0, failed: 0, skipped: 0 };
  const detail: unknown[] = [];

  for (const t of targets) {
    const existing = (await get(
      `ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(t.dedupeKey)}&select=dedupe_key,status,attempts,next_retry_at`,
    ))?.[0] as MailLogRow | undefined;
    const decision = claimDecision(existing ?? null, nowMs);

    if (dryRun) {
      detail.push({
        ...describeTarget(t), decision: decision.action,
        reason: decision.action === "skip" ? decision.reason : `attempt_${decision.attempt}`,
        wouldSendAt: decision.action === "send" ? nowISO : null,
      });
      if (decision.action === "send") counts.sent++; else counts.skipped++;
      continue;
    }
    if (decision.action === "skip") { counts.skipped++; continue; }

    // ── 送る権利を1つだけ取る ──
    let claimed: boolean;
    if (!existing) {
      const lock = await rest("ai_course_mail_log", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: null, purchase_id: null, kind: "event_reminder", dedupe_key: t.dedupeKey,
          scope: "event", subject_ref: `${t.entry.kind}:${t.entry.entryId}`,
          status: "scheduled", attempts: 1, sent_at: null,
          scheduled_at: nowISO, first_attempt_at: nowISO, last_attempt_at: nowISO, updated_at: nowISO,
        }),
      });
      claimed = lock.ok;
      if (!lock.ok && lock.status !== 409) {
        counts.failed++;
        detail.push({ kind: t.entry.kind, error: `log_insert_${lock.status}` });
        continue;
      }
    } else {
      const claim = await rest(
        `ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(t.dedupeKey)}&status=eq.failed`
        + `&attempts=lt.${MAX_SEND_ATTEMPTS}`
        // or=() の中の値は二重引用符で囲む（ISO時刻のコロンとドットを演算子と読ませない）
        + `&or=(next_retry_at.is.null,next_retry_at.lte."${nowISO}")`,
        {
          method: "PATCH", headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            status: "scheduled", attempts: decision.attempt,
            last_attempt_at: nowISO, updated_at: nowISO,
          }),
        },
      );
      claimed = claim.ok && ((await claim.json())?.length ?? 0) > 0;
    }
    if (!claimed) { counts.skipped++; continue; }

    const mail = buildEventReminderMail(t);
    let status: number | null = null;
    let errKind = "";
    try {
      const send = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: MAIL_FROM, to: [t.email], reply_to: ADMIN_EMAIL,
          subject: mail.subject, text: mail.text,
        }),
      });
      status = send.status;
      if (!send.ok) console.error("event reminder send failed", t.entry.kind, send.status, await send.text());
    } catch (e) {
      errKind = e instanceof Error ? e.name : "unknown";
      console.error("event reminder send threw", t.entry.kind, errKind);
    }

    const patch = (payload: Record<string, unknown>) =>
      rest(`ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(t.dedupeKey)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(payload),
      });

    if (status !== null && status >= 200 && status < 300) {
      counts.sent++;
      await patch({
        status: "sent", sent_at: new Date().toISOString(), error_reason: null,
        next_retry_at: null, updated_at: new Date().toISOString(),
      });
      continue;
    }

    // 失敗しても行は消さない（消すと「送っていない」ことが誰にも見えなくなる）
    counts.failed++;
    const code = sendErrorCode(status, errKind || undefined);
    detail.push({ kind: t.entry.kind, error: code });
    await patch({
      status: "failed", error_reason: code,
      next_retry_at: new Date(Date.now() + retryDelayMs(decision.attempt)).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  return await finish({
    scanned: events.length, targets: targets.length, activityEmailColumn,
    ...counts, ...(dryRun ? { detail } : {}),
  });
});
