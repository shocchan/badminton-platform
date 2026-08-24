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
// ■ 2026-08-24 の作り直し
//   実測すると ai_course_mail_log は**0行**、つまり1通も送られていなかった。
//   原因は2つ重なっている:
//     (A) 唯一の購入者の受講権が、**既に消えた購入行**を purchase_id で指していた。
//         宛先を引けず黙って選外になっていた（→ user_id でも引き当てるようにした）。
//     (B) その事実に誰も気づけなかった。旧設計は送信失敗時にログ行を削除するため、
//         「cronが動いていない」「対象0件」「送信失敗」がすべて同じ0行に見えた。
//   なので (B) を直す: **行は消さない**。status で遷移を残し、実行そのものも記録し、
//   異常は ai_course_alerts に立てる。
//
// **誰に何を送るかと本文は _shared/aiCourseLifecycle.ts（純粋関数）**。
// ここはI/Oだけを持つ。受講権テーブルは auth.users への外部キーがあり本番へ検証用の行を
// 置けないので、判定はローカルのテストで固定している（aiCourseLifecycle*.test.ts）。
//
// 失敗しても学習データには一切触れない（読むだけ＋ログ表への書き込みのみ）。
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  buildLifecycleMail, buildMailHealthAlerts, claimDecision, findOrphanAccess,
  lifecycleDedupeKey, maskEmail, MAX_SEND_ATTEMPTS, retryDelayMs, selectLifecycleTargets,
  sendErrorCode,
  type LifecyclePurchaseRow, type MailLogRow,
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
const JOB = "ai-course-lifecycle-daily";
/** scheduled のまま何分たったら「送信中で止まっている」とみなすか */
const STUCK_MINUTES = 60;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const secret = Deno.env.get("LIFECYCLE_CRON_SECRET") ?? Deno.env.get("REMINDER_CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "forbidden" }, 403);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  // DBが無ければ記録すら残せないのでここだけは即座に諦める
  if (!supabaseUrl || !serviceKey) return json({ error: "not_configured" }, 500);

  const db = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const body = await req.json().catch(() => ({}));

  // ── 安全弁 ───────────────────────────────────────────────────────────────
  // payment-reminder と同じ作法（環境変数でも止められる）。
  // 環境変数が立っている間は、リクエストで dryRun:false を渡しても実送信しない。
  const envDryRun = (Deno.env.get("MAIL_DRY_RUN") ?? Deno.env.get("LIFECYCLE_DRY_RUN")) === "true";
  const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
  const dryRun = envDryRun || body?.dryRun === true || !resendKey;

  const nowMs = Date.now();
  const nowISO = new Date(nowMs).toISOString();

  const rest = (path: string, init?: RequestInit) =>
    fetch(`${supabaseUrl}/rest/v1/${path}`, { ...init, headers: { ...db, ...(init?.headers ?? {}) } });
  const get = async (path: string): Promise<any[]> => {
    const r = await rest(path);
    return r.ok ? await r.json() : [];
  };

  // ── 実行を記録（「そもそも走ったのか」を後から言えるようにする） ──
  let runId: string | null = null;
  const runRes = await rest("mail_job_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
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
    return json({ ok: true, job: JOB, dryRun, ...payload });
  };

  // ── 購入由来の受講権をすべて読む（人数が少ないうちは全件で十分・上限は付ける） ──
  const accRes = await rest(
    "ai_course_access?source=eq.purchase&select=user_id,plan_id,valid_until,trial_started_at,trial_window_minutes,purchase_id&limit=500",
  );
  if (!accRes.ok) return await finish({ scanned: 0 }, "access_query_failed");
  const rows = await accRes.json();

  // ── 宛先メールは購入台帳から引く（受講権側には持たせない） ──
  //   purchase_id での直引きに加えて、**user_id 側の索引**も作る。
  //   受講権は user_id で1行に上書きされるため、purchase_id は消えた購入を
  //   指したまま残ることがある（2026-08-24 に本番で発生）。
  const purchaseIds = [...new Set(rows.map((r: any) => r.purchase_id).filter(Boolean))];
  const userIds = [...new Set(rows.map((r: any) => r.user_id).filter(Boolean))];
  const cols = "id,user_id,buyer_email,locale,provisioned_at,status,created_at";
  const [byIdRows, byUserRows] = await Promise.all([
    purchaseIds.length ? get(`ai_plan_purchases?id=in.(${purchaseIds.join(",")})&select=${cols}`) : Promise.resolve([]),
    userIds.length
      ? get(`ai_plan_purchases?user_id=in.(${userIds.join(",")})&status=eq.provisioned&select=${cols}&order=provisioned_at.asc`)
      : Promise.resolve([]),
  ]);
  const purchases: Record<string, LifecyclePurchaseRow> = {};
  for (const p of byIdRows) purchases[p.id] = p;
  // provisioned_at 昇順で流し込む＝最後に書かれた（＝最新の）購入が残る
  const purchasesByUser: Record<string, LifecyclePurchaseRow> = {};
  for (const p of byUserRows) if (p.user_id) purchasesByUser[p.user_id] = p;

  const targets = selectLifecycleTargets(rows, purchases, nowMs, purchasesByUser);
  const orphans = findOrphanAccess(rows, purchases, purchasesByUser);

  const counts = { sent: 0, failed: 0, skipped: 0 };
  const detail: unknown[] = [];

  for (const t of targets) {
    const dedupeKey = lifecycleDedupeKey(t);
    const existing = (await get(
      `ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(dedupeKey)}&select=dedupe_key,status,attempts,next_retry_at`,
    ))?.[0] as MailLogRow | undefined;
    const decision = claimDecision(existing ?? null, nowMs);

    if (dryRun) {
      // 「誰に・どの用件が・いつ送られるはずか」を出す。宛先は伏せ字で識別だけできる形に。
      detail.push({
        kind: t.kind, to: maskEmail(t.email), locale: t.locale, planId: t.planId,
        dedupeKey, decision: decision.action,
        reason: decision.action === "skip" ? decision.reason : `attempt_${decision.attempt}`,
        wouldSendAt: decision.action === "send" ? nowISO : null,
      });
      // ドライラン中の sent は「本番なら送っていた数」。dry_run=true と一緒に記録される
      if (decision.action === "send") counts.sent++; else counts.skipped++;
      continue;
    }

    if (decision.action === "skip") { counts.skipped++; continue; }

    // ── 送る権利を1つだけ取る（取れなかった実行は何もしない＝二重送信しない） ──
    let claimed = false;
    if (!existing) {
      const lock = await rest("ai_course_mail_log", {
        method: "POST", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          user_id: t.userId, purchase_id: t.purchaseId, kind: t.kind, dedupe_key: dedupeKey,
          scope: "ai_course", subject_ref: t.purchaseId ?? t.userId,
          status: "scheduled", attempts: 1, sent_at: null,
          scheduled_at: nowISO, first_attempt_at: nowISO, last_attempt_at: nowISO, updated_at: nowISO,
        }),
      });
      // 409 = 同時に走った別の実行が先に取った
      claimed = lock.ok;
      if (!lock.ok && lock.status !== 409) {
        counts.failed++;
        detail.push({ kind: t.kind, error: `log_insert_${lock.status}` });
        continue;
      }
    } else {
      // 失敗行の再試行。**条件付きUPDATE**にして、条件が合った実行だけが送る
      const claim = await rest(
        `ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(dedupeKey)}&status=eq.failed`
        + `&attempts=lt.${MAX_SEND_ATTEMPTS}`
        // 失敗を書いたあと next_retry_at を書けずに終わった行も拾えるようにする。
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

    const mail = buildLifecycleMail(t, nowMs);
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
      if (!send.ok) console.error("lifecycle mail send failed", t.kind, send.status, await send.text());
    } catch (e) {
      errKind = e instanceof Error ? e.name : "unknown";
      console.error("lifecycle mail send threw", t.kind, errKind);
    }

    if (status !== null && status >= 200 && status < 300) {
      counts.sent++;
      await rest(`ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(dedupeKey)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "sent", sent_at: new Date().toISOString(), error_reason: null,
          next_retry_at: null, updated_at: new Date().toISOString(),
        }),
      });
      continue;
    }

    /*
      失敗しても**ログ行は消さない**（旧設計はここで DELETE していた）。
      失敗の事実・理由・次に試す時刻を残すからこそ、翌日の実行が拾い直せるし、
      拾い直しても直らないことに人が気づける。
    */
    counts.failed++;
    const code = sendErrorCode(status, errKind || undefined);
    detail.push({ kind: t.kind, error: code });
    await rest(`ai_course_mail_log?dedupe_key=eq.${encodeURIComponent(dedupeKey)}`, {
      method: "PATCH", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "failed", error_reason: code,
        next_retry_at: new Date(Date.now() + retryDelayMs(decision.attempt)).toISOString(),
        updated_at: new Date().toISOString(),
      }),
    });
  }

  // ── 配信まわりの健康診断（人が気づけるように ai_course_alerts へ立てる） ──
  // PostgREST は '+00:00' 形式、Date は '...Z' 形式を返す。文字列で比べず必ず時刻に直す
  const stuckBeforeMs = nowMs - STUCK_MINUTES * 60_000;
  const [logRows, health] = await Promise.all([
    get("ai_course_mail_log?status=in.(failed,scheduled)&select=status,attempts,scheduled_at&limit=1000"),
    rest("rpc/ai_mail_health", { method: "POST", body: "{}" })
      .then(async (r) => (r.ok ? await r.json() : []))
      .catch(() => []),
  ]);
  const alerts = buildMailHealthAlerts({
    failed: logRows.filter((r) => r.status === "failed" && Number(r.attempts) < MAX_SEND_ATTEMPTS).length,
    gaveUp: logRows.filter((r) => r.status === "failed" && Number(r.attempts) >= MAX_SEND_ATTEMPTS).length,
    stuck: logRows.filter((r) =>
      r.status === "scheduled" && new Date(r.scheduled_at).getTime() < stuckBeforeMs).length,
    orphanAccess: orphans.length,
    orphanUserId: orphans[0] ?? null,
    missingJobs: (health as any[]).filter((h) => h.is_scheduled === false).map((h) => String(h.job)),
  });
  if (!resendKey) {
    alerts.push({
      dedupeKey: "mail_not_configured:resend",
      kind: "mail_not_configured",
      severity: "critical",
      title: "メール送信の鍵が設定されていません",
      detail: "RESEND_API_KEY が未設定のため、自動メールは1通も送れません（ドライランとして実行しました）",
      subjectUserId: null,
    });
  }

  /*
    アラートは**人が明示的にドライランを叩いたときだけ**書かない（手元の確認で台帳を汚さない）。
    鍵が無くて自動的にドライランへ落ちた場合は書く。まさにそれを知りたいときだから。
  */
  if (body?.dryRun !== true) {
    for (const a of alerts) {
      const existing = await get(
        `ai_course_alerts?dedupe_key=eq.${encodeURIComponent(a.dedupeKey)}&select=id,occurrences`,
      );
      if (existing.length > 0) {
        await rest(`ai_course_alerts?id=eq.${existing[0].id}`, {
          method: "PATCH", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            occurrences: Number(existing[0].occurrences ?? 1) + 1, last_seen_at: nowISO,
            detail: a.detail, resolved: false, resolved_at: null, resolved_by: null,
          }),
        });
      } else {
        await rest("ai_course_alerts", {
          method: "POST", headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            dedupe_key: a.dedupeKey, kind: a.kind, severity: a.severity, title: a.title,
            detail: a.detail, subject_user_id: a.subjectUserId,
            first_seen_at: nowISO, last_seen_at: nowISO,
          }),
        });
      }
    }
  }

  return await finish({
    scanned: rows.length, targets: targets.length, orphanAccess: orphans.length,
    alerts: alerts.map((a) => a.kind), ...counts,
    ...(dryRun ? { detail } : {}),
  });
});
