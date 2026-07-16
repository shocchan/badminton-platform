import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "shodorannga@gmail.com";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey   = Deno.env.get("RESEND_API_KEY")!;
    const supabase    = createClient(supabaseUrl, serviceKey);

    // GET: 申し込み情報の取得
    if (req.method === "GET") {
      const url   = new URL(req.url);
      const token = url.searchParams.get("token");

      if (!token) {
        return json({ error: "token_required" }, 400);
      }

      const { data: entry } = await supabase
        .from("entries")
        .select("id, name, email, status, payment_method, payment_status, tournament_id, tournaments(title, event_date, cancel_deadline, entry_fee, payment_required)")
        .eq("cancel_token", token)
        .single();

      if (!entry) {
        return json({ error: "not_found" }, 404);
      }
      if (entry.status === "cancelled") {
        return json({ error: "already_cancelled" }, 400);
      }

      const t = entry.tournaments as Record<string, unknown>;

      // cancel_deadlineがNULLの場合はevent_dateの14日前を使用
      const cancelDeadline = t.cancel_deadline
        ?? (() => {
          const d = new Date(t.event_date as string);
          d.setDate(d.getDate() - 14);
          return d.toISOString().split("T")[0];
        })();

      return json({
        name: entry.name,
        tournament_title: t.title,
        tournament_date: t.event_date,
        cancel_deadline: cancelDeadline,
        entry_fee: t.entry_fee,
        payment_required: t.payment_required,
        status: entry.status,
        payment_method: entry.payment_method,
        payment_status: entry.payment_status,
      });
    }

    // POST: キャンセル処理
    if (req.method === "POST") {
      const { token } = await req.json();

      if (!token) {
        return json({ error: "token_required" }, 400);
      }

      // エントリー取得
      const { data: entry } = await supabase
        .from("entries")
        .select("id, name, email, status, payment_method, payment_status, stripe_payment_id, tournament_id, tournaments(title, event_date, cancel_deadline, entry_fee, payment_required, bank_account, paypay_id, payment_deadline)")
        .eq("cancel_token", token)
        .single();

      if (!entry) {
        return json({ error: "not_found" }, 404);
      }
      if (entry.status === "cancelled") {
        return json({ error: "already_cancelled" }, 400);
      }

      const t = entry.tournaments as Record<string, unknown>;

      // cancel_deadlineがNULLの場合はevent_dateの14日前を使用
      const cancelDeadlineStr = t.cancel_deadline
        ?? (() => {
          const d = new Date(t.event_date as string);
          d.setDate(d.getDate() - 14);
          return d.toISOString().split("T")[0];
        })();

      // キャンセル期限チェック
      const deadlineDate = new Date(cancelDeadlineStr as string);
      deadlineDate.setHours(23, 59, 59);
      if (new Date() > deadlineDate) {
        return json({ error: "past_deadline" }, 400);
      }

      const wasConfirmed = entry.status === "confirmed";

      // ── クレジット決済済みの確定参加者は、期限内キャンセルでStripe自動返金 ──
      let refundResult: { attempted: boolean; success: boolean; amount?: number; error?: string } = { attempted: false, success: false };
      if (
        wasConfirmed &&
        entry.payment_method === "credit" &&
        entry.payment_status === "completed" &&
        entry.stripe_payment_id
      ) {
        const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
        if (stripeKey) {
          refundResult.attempted = true;
          // クレジット決済は期限内キャンセルでも10%をキャンセル手数料として差し引く
          // （安易なキャンセル→再申込の繰り返しを防ぐ抑止力。参加費に決済手数料の上乗せはしていない）
          const entryFee = t.entry_fee as number;
          const refundAmount = entryFee - Math.round(entryFee * 0.1);
          try {
            const refundRes = await fetch("https://api.stripe.com/v1/refunds", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${stripeKey}`,
                "Content-Type": "application/x-www-form-urlencoded",
                "Idempotency-Key": `cancel-refund-${entry.id}`,
              },
              body: new URLSearchParams({
                payment_intent: entry.stripe_payment_id as string,
                amount: String(refundAmount),
              }).toString(),
            });
            const refund = await refundRes.json();
            if (refundRes.ok) {
              refundResult.success = true;
              refundResult.amount = refund.amount;
              await supabase
                .from("entries")
                .update({ payment_status: "refunded" })
                .eq("id", entry.id);
            } else {
              refundResult.error = refund?.error?.message ?? "unknown Stripe error";
              console.error("Stripe refund failed:", refundResult.error);
            }
          } catch (e) {
            refundResult.error = e.message;
            console.error("Stripe refund error:", e.message);
          }
        }
      }

      // エントリーをキャンセルに更新
      await supabase
        .from("entries")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", entry.id);

      // ── 管理者へキャンセル通知 ──
      await sendCancelNotifyToAdmin(resendKey, {
        name: entry.name,
        email: entry.email,
        tournament_title: t.title as string,
        tournament_date: t.event_date as string,
        entry_fee: t.entry_fee as number,
        payment_required: t.payment_required as boolean,
        was_confirmed: wasConfirmed,
        payment_method: entry.payment_method as string | null,
        refund: refundResult,
      });

      // ── confirmed のキャンセルの場合: キャンセル待ちを繰り上げ ──
      if (wasConfirmed) {
        const { data: waitlisted } = await supabase
          .from("entries")
          .select("id, name, email, partner_name, cancel_token")
          .eq("tournament_id", entry.tournament_id)
          .eq("status", "waitlist")
          .order("created_at", { ascending: true })
          .limit(1);

        if (waitlisted && waitlisted.length > 0) {
          const promoted = waitlisted[0];

          // confirmed に繰り上げ
          await supabase
            .from("entries")
            .update({ status: "confirmed" })
            .eq("id", promoted.id);

          // 繰り上げ当選メール送信
          await sendPromotionEmail(resendKey, {
            name: promoted.name,
            email: promoted.email,
            partner_name: promoted.partner_name,
            cancel_token: promoted.cancel_token,
            tournament_title: t.title as string,
            tournament_date: t.event_date as string,
            payment_deadline: t.payment_deadline as string | undefined,
            bank_account: t.bank_account as string | undefined,
            paypay_id: t.paypay_id as string | undefined,
            payment_required: t.payment_required as boolean,
            cancel_deadline: t.cancel_deadline as string,
          });

          // 管理者に繰り上げ通知
          await sendPromotionNotifyToAdmin(resendKey, {
            name: promoted.name,
            email: promoted.email,
            tournament_title: t.title as string,
          });
        }
      }

      return json({ success: true, refunded: refundResult.success, refund_attempted: refundResult.attempted });
    }

    return json({ error: "method_not_allowed" }, 405);

  } catch (error) {
    console.error("process-cancel error:", error);
    return json({ error: error.message }, 500);
  }
});

// ─── Helper Functions ─────────────────────────────────────

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

async function sendCancelNotifyToAdmin(resendKey: string, data: {
  name: string;
  email: string;
  tournament_title: string;
  tournament_date: string;
  entry_fee: number;
  payment_required: boolean;
  was_confirmed: boolean;
  payment_method: string | null;
  refund: { attempted: boolean; success: boolean; amount?: number; error?: string };
}) {
  const eventDate = new Date(data.tournament_date).toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });

  const needsManualRefund = data.payment_required && data.was_confirmed && !data.refund.success;
  const methodLabel = data.payment_method === "credit" ? "クレジットカード" : data.payment_method === "paypay" ? "PayPay" : data.payment_method === "bank" ? "銀行振込" : "未確認";

  // 返金ステータスのお知らせブロック
  const refundBlock = data.refund.success
    ? `<div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 18px;font-size:13px;color:#065f46;">
        ✅ Stripeで自動返金済みです（¥${(data.refund.amount ?? 0).toLocaleString()}、キャンセル手数料10%差引後）。参加者への追加対応は不要です。
      </div>`
    : data.refund.attempted && !data.refund.success
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;font-size:13px;color:#991b1b;">
        ⚠️ Stripe自動返金に失敗しました（${data.refund.error ?? "原因不明"}）。Stripeダッシュボードから手動で返金してください。
      </div>`
    : needsManualRefund
    ? `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;font-size:13px;color:#991b1b;">
        💰 参加費（¥${data.entry_fee.toLocaleString()}）の返金が必要です。支払い方法「${methodLabel}」に応じて${data.payment_method === "credit" ? "Stripeダッシュボードから" : "銀行振込またはPayPayで"}返金してください。
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%);padding:28px 32px;border-radius:16px 16px 0 0;">
      <div style="font-size:28px;margin-bottom:8px;">🏸</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">キャンセルが届きました</h1>
      <p style="color:#fecaca;margin:6px 0 0;font-size:14px;">${data.tournament_title}</p>
    </div>
    <div style="background:#ffffff;padding:28px 32px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;">
      <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin-bottom:20px;">
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;">申込者名</td><td style="padding:10px 0;font-weight:700;font-size:16px;">${data.name}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 0;color:#6b7280;font-size:14px;">メール</td><td style="padding:10px 0;"><a href="mailto:${data.email}" style="color:#2563eb;">${data.email}</a></td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 0;color:#6b7280;font-size:14px;">大会名</td><td style="padding:10px 0;font-weight:600;">${data.tournament_title}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 0;color:#6b7280;font-size:14px;">開催日</td><td style="padding:10px 0;font-weight:600;">${eventDate}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:10px 0;color:#6b7280;font-size:14px;">参加ステータス</td><td style="padding:10px 0;font-weight:600;">${data.was_confirmed ? '<span style="color:#dc2626;">確定参加者</span>' : '<span style="color:#f59e0b;">キャンセル待ち</span>'}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;">支払い方法</td><td style="padding:10px 0;font-weight:600;">${data.was_confirmed && data.payment_required ? methodLabel : '—'}</td></tr>
        </table>
      </div>
      ${refundBlock}
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">川口・蕨バド交流杯 管理システム</p>
  </div>
</body>
</html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
      to: [ADMIN_EMAIL],
      subject: `【キャンセル通知】${data.name}さんが${data.tournament_title}をキャンセルしました${data.refund.success ? "（自動返金済み）" : ""}`,
      html,
    }),
  });
}

async function sendPromotionEmail(resendKey: string, data: {
  name: string;
  email: string;
  partner_name?: string;
  cancel_token?: string;
  tournament_title: string;
  tournament_date: string;
  payment_deadline?: string;
  bank_account?: string;
  paypay_id?: string;
  payment_required: boolean;
  cancel_deadline: string;
}) {
  const eventDate = new Date(data.tournament_date).toLocaleDateString("ja-JP", {
    year: "numeric", month: "long", day: "numeric", weekday: "short",
  });
  const payDeadline = data.payment_deadline
    ? new Date(data.payment_deadline).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })
    : "未定";
  const cancelLink = data.cancel_token
    ? `https://badminton-platform.pages.dev/cancel?token=${data.cancel_token}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:linear-gradient(135deg,#047857 0%,#059669 50%,#10b981 100%);padding:28px 32px;border-radius:16px 16px 0 0;">
      <div style="font-size:28px;margin-bottom:8px;">🎉</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">繰り上げ当選のお知らせ</h1>
      <p style="color:#a7f3d0;margin:6px 0 0;font-size:14px;">${data.tournament_title}</p>
    </div>
    <div style="background:#ffffff;padding:28px 32px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${data.name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">キャンセル待ちからの繰り上げ当選が決定しました！</p>

      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:12px;padding:20px;margin:0 0 20px;">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#065f46;">🎊 参加が確定しました</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#065f46;font-size:14px;width:40%;border-bottom:1px solid #a7f3d0;">大会名</td><td style="padding:10px 0;font-weight:600;color:#064e3b;border-bottom:1px solid #a7f3d0;">${data.tournament_title}</td></tr>
          <tr><td style="padding:10px 0;color:#065f46;font-size:14px;border-bottom:1px solid #a7f3d0;">開催日</td><td style="padding:10px 0;font-weight:600;color:#064e3b;border-bottom:1px solid #a7f3d0;">${eventDate}</td></tr>
          <tr><td style="padding:10px 0;color:#065f46;font-size:14px;">お名前</td><td style="padding:10px 0;font-weight:600;color:#064e3b;">${data.name}</td></tr>
          ${data.partner_name ? `<tr><td style="padding:10px 0;color:#065f46;font-size:14px;">ペアの相手</td><td style="padding:10px 0;font-weight:600;color:#064e3b;">${data.partner_name}</td></tr>` : ""}
        </table>
      </div>

      ${data.payment_required ? `
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:0 0 20px;display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">⏰</span>
        <div>
          <p style="margin:0;font-size:13px;color:#991b1b;font-weight:700;">お支払い期限</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#dc2626;">${payDeadline}</p>
        </div>
      </div>
      <p style="font-size:14px;color:#374151;margin:0 0 8px;font-weight:600;">以下のいずれか一方でお支払いください：</p>
      ${data.bank_account ? `
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:12px 0;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1e3a8a;">🏦 銀行振込</p>
        <p style="margin:0 0 12px;font-size:14px;white-space:pre-line;color:#374141;line-height:1.8;">${data.bank_account}</p>
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;">
          📧 振込後はこのメールに返信して「振込完了」とご連絡ください
        </div>
      </div>` : ""}
      ${data.paypay_id ? `
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:20px;margin:12px 0;">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#dc2626;">📱 PayPay</p>
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">PayPay ID</p>
        <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#374141;">${data.paypay_id}</p>
        <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;">
          ✏️ 送金時のメッセージに「<strong>${data.name}</strong>」とご記入ください
        </div>
      </div>` : ""}` : ""}

      ${cancelLink ? `
      <div style="margin-top:24px;padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <p style="margin:0 0 8px;font-size:13px;color:#374151;font-weight:600;">❌ キャンセルについて</p>
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">キャンセルが必要な場合は以下のリンクからお手続きください。</p>
        <a href="${cancelLink}" style="font-size:12px;color:#dc2626;">${cancelLink}</a>
      </div>` : ""}

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0 0 4px;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body>
</html>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
      reply_to: ADMIN_EMAIL,
      to: [data.email],
      subject: `【繰り上げ当選】${data.tournament_title}への参加が確定しました！`,
      html,
    }),
  });
}

async function sendPromotionNotifyToAdmin(resendKey: string, data: {
  name: string;
  email: string;
  tournament_title: string;
}) {
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
      to: [ADMIN_EMAIL],
      subject: `【繰り上げ当選】${data.name}さんが${data.tournament_title}に繰り上げ当選しました`,
      text: `キャンセル待ちからの繰り上げ当選が発生しました。\n\n参加者: ${data.name}\nメール: ${data.email}\n大会: ${data.tournament_title}\n\n繰り上げ当選メールを送信しました。支払い確認をお忘れなく。`,
    }),
  });
}
