// 未入金の自動督促（毎日 pg_cron から呼ばれる）
//
// 対象: status='confirmed' かつ 大会が payment_required かつ payment_status が 'completed' 以外
// 段階: 期限3日前 → 期限当日 → 期限翌日〜2日後 → 期限3日後（最終）
// 管理ページで「入金確認」を押す（payment_status='completed'）と、その時点で対象から外れる。
// 最終督促しても未入金の場合は管理者に通知するだけ（自動キャンセルはしない）。

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 顧客向け督促メールの reply_to に使う。**個人のGmailを出さない**（2026-08-28）。
// この関数だけ 86f5e14 の一括修正から漏れていた。しかも pg_cron で毎日10時に
// 未入金の人全員へ飛ぶ唯一の関数なので、漏れの実害はここが一番大きかった。
const ADMIN_EMAIL = "info@kawabado.com";
const SITE_URL = "https://kawabado.com";

type Stage = "before3" | "due" | "overdue" | "final";

interface TournamentRow {
  id: number;
  title: string;
  event_date: string;
  payment_required: boolean;
  payment_deadline: string | null;
  entry_fee: number;
  bank_account: string | null;
  paypay_id: string | null;
}

interface EntryRow {
  id: number;
  name: string;
  email: string;
  status: string | null;
  partner_name: string | null;
  payment_method: "credit" | "paypay" | "bank" | null;
  payment_status: string | null;
  cancel_token: string | null;
  tournaments: TournamentRow;
}

// JSTの「今日」をYYYY-MM-DDで返す
const todayJst = () => new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// 日付文字列(YYYY-MM-DD)同士の差を日数で返す（to - from）
const diffDays = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const formatJpDate = (d: string) =>
  new Date(`${d.slice(0, 10)}T00:00:00Z`).toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short", timeZone: "UTC",
  });

const stageFor = (daysLeft: number): Stage | null => {
  if (daysLeft >= 4) return null;
  if (daysLeft >= 1) return "before3";
  if (daysLeft === 0) return "due";
  if (daysLeft >= -2) return "overdue";
  return "final";
};

const STAGE_LABEL: Record<Stage, string> = {
  before3: "期限3日前リマインド",
  due: "期限当日のご案内",
  overdue: "督促（期限超過）",
  final: "最終督促",
};

const methodLabel = (m: EntryRow["payment_method"]) =>
  m === "credit" ? "クレジット" : m === "paypay" ? "PayPay" : m === "bank" ? "銀行振込" : "未選択";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");

  // 実行を許すのは pg_cron と管理者の手動実行だけ。anon キーで叩かれても弾く。
  //   ① x-cron-secret ヘッダが REMINDER_CRON_SECRET と一致（pg_cron はこちら）
  //   ② Authorization が service_role キーそのもの（手動実行用）
  // ①を主にしているのは、Supabase が注入する service_role キーの形式が
  // 変わっても cron が黙って止まらないようにするため。
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  const bearer = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const viaCronSecret = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  const viaServiceKey = !!serviceKey && bearer === serviceKey;
  if (!viaCronSecret && !viaServiceKey) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403,
    });
  }

  // 本番投入前の安全弁。true の間は参加者に督促を送らず、管理者に「送る予定の人」だけ通知する
  const dryRun = Deno.env.get("REMINDER_DRY_RUN") === "true";

  try {
    if (!supabaseUrl || !resendApiKey) throw new Error("SUPABASE_URL / RESEND_API_KEY is not set");

    const restHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // ── 1) 未入金エントリーを取得 ──
    const select =
      "id,name,email,status,partner_name,payment_method,payment_status,cancel_token," +
      "tournaments!inner(id,title,event_date,payment_required,payment_deadline,entry_fee,bank_account,paypay_id)";
    // 入金済み以外をまとめて取り、細かい条件はこちら側で絞る
    // （status が NULL の古いレコードや payment_required の取りこぼしを防ぐため）
    const query =
      `${supabaseUrl}/rest/v1/entries?select=${encodeURIComponent(select)}` +
      `&or=(payment_status.is.null,payment_status.neq.completed)`;

    const listRes = await fetch(query, { headers: restHeaders });
    if (!listRes.ok) throw new Error(`entries fetch failed: ${listRes.status} ${await listRes.text()}`);
    const entries = (await listRes.json()) as EntryRow[];

    const today = todayJst();

    // 対象: 参加確定（status未設定の古いレコードも確定扱い）× 支払い必須の大会 × まだ開催前
    const active = entries.filter(
      (e) =>
        (!e.status || e.status === "confirmed") &&
        e.tournaments?.payment_required === true &&
        diffDays(today, e.tournaments.event_date.slice(0, 10)) >= 0,
    );

    if (active.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    // ── 2) 送信済みの段階を取得 ──
    const ids = active.map((e) => e.id).join(",");
    const sentRes = await fetch(
      `${supabaseUrl}/rest/v1/payment_reminders?select=entry_id,stage&entry_id=in.(${ids})`,
      { headers: restHeaders },
    );
    if (!sentRes.ok) throw new Error(`reminders fetch failed: ${sentRes.status} ${await sentRes.text()}`);
    const already = new Set(
      ((await sentRes.json()) as { entry_id: number; stage: string }[]).map((r) => `${r.entry_id}:${r.stage}`),
    );

    // ── 3) 段階を判定して送信 ──
    const sent: { entry: EntryRow; stage: Stage }[] = [];
    const skippedNoDeadline: EntryRow[] = [];
    const failures: string[] = [];

    for (const entry of active) {
      const deadline = entry.tournaments.payment_deadline;
      if (!deadline) {
        skippedNoDeadline.push(entry);
        continue;
      }
      const daysLeft = diffDays(today, deadline.slice(0, 10));
      const stage = stageFor(daysLeft);
      if (!stage) continue;
      if (already.has(`${entry.id}:${stage}`)) continue;

      try {
        // REMINDER_DRY_RUN=true の間は参加者に送らず、管理者への「送る予定リスト」だけ出す
        if (!dryRun) {
          await sendReminderMail(resendApiKey, entry, stage, daysLeft);
          // on_conflict を明示しないと PK(id) 基準の判定になり、(entry_id, stage) の重複で409になる
          const rec = await fetch(
            `${supabaseUrl}/rest/v1/payment_reminders?on_conflict=entry_id,stage`,
            {
              method: "POST",
              headers: { ...restHeaders, Prefer: "resolution=ignore-duplicates,return=minimal" },
              body: JSON.stringify({ entry_id: entry.id, stage }),
            },
          );
          if (!rec.ok) console.error(`reminder record failed: ${rec.status} ${await rec.text()}`);
        }
        sent.push({ entry, stage });
      } catch (e) {
        console.error(`reminder failed for entry ${entry.id}:`, (e as Error).message);
        failures.push(`${entry.name}(#${entry.id}): ${(e as Error).message}`);
      }
    }

    // ── 4) 管理者へのまとめ通知（督促を出した日だけ送る） ──
    if (sent.length > 0) {
      await sendAdminDigest(resendApiKey, sent, active, skippedNoDeadline, failures, today, dryRun);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        dry_run: dryRun,
        checked: active.length,
        sent: sent.length,
        stages: sent.map((s) => ({ entry_id: s.entry.id, name: s.entry.name, stage: s.stage })),
        no_deadline: skippedNoDeadline.length,
        failures,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (error) {
    console.error("payment-reminder error:", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400,
    });
  }
});

// ── 参加者向け督促メール ──
async function sendReminderMail(apiKey: string, entry: EntryRow, stage: Stage, daysLeft: number) {
  const t = entry.tournaments;
  const deadlineStr = formatJpDate(t.payment_deadline!);
  const eventStr = formatJpDate(t.event_date);
  const feeStr = `¥${(t.entry_fee ?? 0).toLocaleString()}`;
  const cancelLink = entry.cancel_token ? `${SITE_URL}/cancel?token=${entry.cancel_token}` : null;

  // 支払い方法が未選択（または途中で離脱したクレジット）の場合は両方の手段を案内する
  const showBoth = entry.payment_method !== "paypay" && entry.payment_method !== "bank";
  const showBank = !!t.bank_account && (showBoth || entry.payment_method === "bank");
  const showPaypay = !!t.paypay_id && (showBoth || entry.payment_method === "paypay");

  const tone: Record<Stage, { subject: string; badge: string; color: string; lead: string; note: string }> = {
    before3: {
      subject: `【お支払い期限が近づいています】${t.title}（期限：${deadlineStr}）`,
      badge: `⏰ お支払い期限まであと${daysLeft}日`,
      color: "linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#3b82f6 100%)",
      lead: "参加費のお支払い期限が近づいていますのでご案内します。",
      note: "すでにお振り込み済みの場合は、行き違いですのでご容赦ください。",
    },
    due: {
      subject: `【本日が期限です】${t.title} 参加費のお支払いについて`,
      badge: "⏰ 本日がお支払い期限です",
      color: "linear-gradient(135deg,#b45309 0%,#d97706 50%,#f59e0b 100%)",
      lead: "本日が参加費のお支払い期限です。お手続きをお願いします。",
      note: "すでにお振り込み済みの場合は、行き違いですのでご容赦ください。",
    },
    overdue: {
      subject: `【お支払い確認できておりません】${t.title}`,
      badge: "⚠️ お支払い期限を過ぎています",
      color: "linear-gradient(135deg,#b91c1c 0%,#dc2626 50%,#ef4444 100%)",
      lead: `お支払い期限（${deadlineStr}）を過ぎておりますが、参加費のご入金が確認できておりません。`,
      note: "すでにお振り込み済みの場合は、行き違いですのでご容赦ください。反映まで数日かかる場合があります。",
    },
    final: {
      subject: `【最終ご案内】${t.title} 参加費のお支払いについて`,
      badge: "🚨 最終ご案内",
      color: "linear-gradient(135deg,#7f1d1d 0%,#b91c1c 50%,#dc2626 100%)",
      lead: `お支払い期限（${deadlineStr}）から日数が経過しましたが、ご入金が確認できておりません。`,
      note: "参加を見合わせる場合はキャンセルのお手続きをお願いします。ご連絡がない場合、こちらから個別にご連絡することがあります。",
    },
  };
  const v = tone[stage];

  const payCard = `
    ${showBank ? `
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1e3a8a;">🏦 銀行振込</p>
      <p style="margin:0;font-size:14px;white-space:pre-line;color:#374151;line-height:1.8;">${t.bank_account}</p>
    </div>` : ""}
    ${showPaypay ? `
    <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:16px 0;">
      <p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#dc2626;">📱 PayPay</p>
      <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">PayPay ID</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#374151;">${t.paypay_id}</p>
      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;">
        ✏️ 送金時のメッセージに「<strong>${entry.name}</strong>」とご記入ください
      </div>
    </div>` : ""}`;

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:${v.color};padding:28px 32px;border-radius:16px 16px 0 0;">
      <div style="font-size:28px;margin-bottom:8px;">🏸</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">川口・蕨バド交流杯</h1>
      <p style="color:#ffffff;opacity:.85;margin:6px 0 0;font-size:14px;">参加費お支払いのご案内</p>
    </div>
    <div style="background:#ffffff;padding:28px 32px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${entry.name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">${v.lead}</p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:13px;color:#991b1b;font-weight:700;">${v.badge}</p>
        <p style="margin:6px 0 0;font-size:18px;font-weight:700;color:#dc2626;">お支払い期限：${deadlineStr}</p>
      </div>

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:20px 0;">
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">大会名</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${t.title}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">開催日</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${eventStr}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;${entry.partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">参加費</td><td style="padding:10px 0;font-weight:700;color:#dc2626;${entry.partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">${feeStr}</td></tr>
          ${entry.partner_name ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">ペアの相手</td><td style="padding:10px 0;font-weight:600;">${entry.partner_name}</td></tr>` : ""}
        </table>
      </div>

      <p style="font-size:14px;color:#374151;margin:0 0 8px;font-weight:600;">${showBoth ? "以下のいずれか一方でお支払いください：" : "以下の方法でお支払いください："}</p>
      ${payCard}

      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;margin-top:16px;font-size:12px;color:#6b7280;line-height:1.7;">
        ${v.note}
      </div>

      ${cancelLink ? `
      <div style="margin-top:12px;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13px;color:#991b1b;font-weight:600;">❌ 参加を取りやめる場合</p>
        <a href="${cancelLink}" style="font-size:12px;color:#dc2626;word-break:break-all;">${cancelLink}</a>
      </div>` : ""}

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body>
</html>`;

  const text = `${entry.name} 様

${v.lead}

【大会情報】
大会名：${t.title}
開催日：${eventStr}
参加費：${feeStr}
お支払い期限：${deadlineStr}

${showBank ? `■ 銀行振込\n${t.bank_account}\n\n` : ""}${showPaypay ? `■ PayPay\nPayPay ID：${t.paypay_id}\n※送金時のメッセージに「${entry.name}」とご記入ください。\n\n` : ""}${v.note}
${cancelLink ? `\n参加を取りやめる場合はこちら：\n${cancelLink}\n` : ""}
川口・蕨バド交流杯`.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
      reply_to: ADMIN_EMAIL,
      to: [entry.email],
      subject: v.subject,
      text,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend error: ${res.status} ${await res.text()}`);
}

// ── 管理者向けまとめ通知 ──
async function sendAdminDigest(
  apiKey: string,
  sent: { entry: EntryRow; stage: Stage }[],
  allUnpaid: EntryRow[],
  noDeadline: EntryRow[],
  failures: string[],
  today: string,
  dryRun: boolean,
) {
  const finals = sent.filter((s) => s.stage === "final");

  const sentRows = sent
    .map((s) => `・${s.entry.name}（${s.entry.tournaments.title} / ${methodLabel(s.entry.payment_method)}）→ ${STAGE_LABEL[s.stage]}`)
    .join("\n");

  const unpaidRows = allUnpaid
    .map((e) => {
      const dl = e.tournaments.payment_deadline;
      const left = dl ? diffDays(today, dl.slice(0, 10)) : null;
      const leftStr = left === null ? "期限未設定" : left >= 0 ? `期限まであと${left}日` : `期限${-left}日超過`;
      return `・${e.name}（${e.tournaments.title} / ${methodLabel(e.payment_method)} / ${leftStr}）`;
    })
    .join("\n");

  const text = `${dryRun ? "⚠️ これはドライラン（テスト実行）です。参加者にはまだ何も送っていません。\n\n" : ""}【未入金の自動督促】${today}

■ ${dryRun ? "本番なら送っていた督促" : "本日送った督促"}（${sent.length}件）
${sentRows}

■ 未入金の全リスト（${allUnpaid.length}件）
${unpaidRows}
${noDeadline.length > 0 ? `\n■ ⚠️ 支払い期限が未設定のため督促できない大会のエントリー（${noDeadline.length}件）\n${noDeadline.map((e) => `・${e.name}（${e.tournaments.title}）`).join("\n")}\n※大会設定に「支払い期限」を入れると自動督促の対象になります。\n` : ""}
${finals.length > 0 ? `\n🚨 最終督促を送った人（要対応）\n${finals.map((s) => `・${s.entry.name}（${s.entry.tournaments.title}） ${s.entry.email}`).join("\n")}\n※これ以上の自動督促は送りません。取消するかどうかは管理ページで判断してください。\n` : ""}
${failures.length > 0 ? `\n❌ 送信に失敗したもの\n${failures.join("\n")}\n` : ""}
入金が確認できたら管理ページのエントリー一覧で「入金確認」を押してください。押した時点で督促は止まります。
${SITE_URL}/admin`.trim();

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
      to: [ADMIN_EMAIL],
      subject: `${dryRun ? "🧪【ドライラン】" : finals.length > 0 ? "🚨" : "📮"}【未入金${allUnpaid.length}件】督促${sent.length}件を${dryRun ? "送る予定です" : "送信しました"}（${today}）`,
      text,
    }),
  });
}
