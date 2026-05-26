import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "shodorannga@gmail.com";

interface PaymentEmailRequest {
  to: string;
  name: string;
  phone?: string;
  notes?: string;
  partner_name?: string;
  tournament_title: string;
  tournament_date: string;
  payment_deadline: string;
  bank_account: string;
  paypay_id: string;
  payment_required: boolean;
}

const headerStyle = (color: string) => `
  background: ${color};
  padding: 28px 32px;
  border-radius: 16px 16px 0 0;
`;

const bodyStyle = `
  background: #ffffff;
  padding: 28px 32px;
  border-radius: 0 0 16px 16px;
  border: 1px solid #e5e7eb;
  border-top: none;
`;

const infoCardStyle = `
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  margin: 20px 0;
`;

const payCardStyle = `
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  margin: 16px 0;
`;

const warningStyle = `
  background: #fefce8;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 12px 16px;
  margin-top: 12px;
  font-size: 13px;
  color: #92400e;
`;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to, name, phone, notes, partner_name,
      tournament_title, tournament_date, payment_deadline,
      bank_account, paypay_id, payment_required,
    } = (await req.json()) as PaymentEmailRequest;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");

    const eventDate = new Date(tournament_date).toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric", weekday: "short",
    });
    const paymentDeadlineStr = payment_deadline
      ? new Date(payment_deadline).toLocaleDateString("ja-JP", {
          year: "numeric", month: "long", day: "numeric",
        })
      : "未定";

    const results: string[] = [];

    // ── 1. 参加者向けメール ──
    if (payment_required) {
      const partnerRow = partner_name
        ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;">ペアの相手</td><td style="padding:10px 0;font-weight:600;">${partner_name}</td></tr>`
        : "";

      const participantHtml = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">

    <!-- ヘッダー -->
    <div style="${headerStyle("linear-gradient(135deg,#1d4ed8 0%,#2563eb 50%,#3b82f6 100%)")}">
      <div style="font-size:28px;margin-bottom:8px;">🏸</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">川口・蕨バド交流杯</h1>
      <p style="color:#bfdbfe;margin:6px 0 0;font-size:14px;">参加費お支払いのご案内</p>
    </div>

    <!-- 本文 -->
    <div style="${bodyStyle}">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">ご申し込みありがとうございます。</p>

      <!-- 大会情報カード -->
      <div style="${infoCardStyle}">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">📋 申し込み内容</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">大会名</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${tournament_title}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">開催日</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${eventDate}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">お名前</td><td style="padding:10px 0;font-weight:600;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">${name}</td></tr>
          ${partnerRow}
        </table>
      </div>

      <!-- 支払い期限バナー -->
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:20px 0;display:flex;align-items:center;gap:12px;">
        <span style="font-size:24px;">⏰</span>
        <div>
          <p style="margin:0;font-size:13px;color:#991b1b;font-weight:700;">お支払い期限</p>
          <p style="margin:4px 0 0;font-size:18px;font-weight:700;color:#dc2626;">${paymentDeadlineStr}</p>
        </div>
      </div>

      <p style="font-size:14px;color:#374151;margin:0 0 8px;font-weight:600;">以下のいずれか一方でお支払いください：</p>

      ${bank_account ? `
      <!-- 銀行振込 -->
      <div style="${payCardStyle}">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#1e3a8a;">🏦 銀行振込</p>
        <p style="margin:0 0 12px;font-size:14px;white-space:pre-line;color:#374141;line-height:1.8;">${bank_account}</p>
        <div style="${warningStyle}">
          📧 振込後はこのメールに返信して「振込完了」とご連絡ください
        </div>
      </div>` : ""}

      ${paypay_id ? `
      <!-- PayPay -->
      <div style="${payCardStyle}">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#dc2626;">📱 PayPay</p>
        <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">PayPay ID</p>
        <p style="margin:0 0 12px;font-size:18px;font-weight:700;color:#374141;">${paypay_id}</p>
        <div style="${warningStyle}">
          ✏️ 送金時のメッセージに「<strong>${name}</strong>」とご記入ください
        </div>
      </div>` : ""}

      <!-- フッター -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0 0 4px;">お支払い確認後、参加確定のご連絡をいたします。</p>
        <p style="font-size:13px;color:#9ca3af;margin:0;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>

    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body>
</html>`;

      const participantText = `${name} 様\n\n川口・蕨バド交流杯へのご申し込みありがとうございます。\n\n【大会情報】\n大会名：${tournament_title}\n開催日：${eventDate}${partner_name ? `\nペアの相手：${partner_name}` : ""}\n\n【お支払い期限】${paymentDeadlineStr}\n\n${bank_account ? `■ 銀行振込\n${bank_account}\n※振込後、このメールに「振込完了」と返信ください。\n\n` : ""}${paypay_id ? `■ PayPay\nPayPay ID：${paypay_id}\n※送金時のメッセージに「${name}」とご記入ください。\n\n` : ""}お支払い確認後、参加確定のご連絡をいたします。\n\n川口・蕨バド交流杯`.trim();

      const res1 = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
          reply_to: ADMIN_EMAIL,
          to: [to],
          subject: `【参加費支払い案内】${tournament_title}（期限：${paymentDeadlineStr}）`,
          text: participantText,
          html: participantHtml,
        }),
      });
      if (!res1.ok) throw new Error(`Participant email error: ${res1.status} ${await res1.text()}`);
      const r1 = await res1.json();
      results.push(r1.id);
    }

    // ── 2. 管理者向け通知メール ──
    const partnerAdminRow = partner_name
      ? `<tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:12px 0;font-size:14px;color:#6b7280;width:35%;">ペアの相手</td><td style="padding:12px 0;font-size:14px;font-weight:600;">${partner_name}</td></tr>`
      : "";

    const adminHtml = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">

    <div style="${headerStyle("linear-gradient(135deg,#065f46 0%,#059669 100%)")}">
      <div style="font-size:28px;margin-bottom:8px;">🏸</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">新規エントリーが届きました</h1>
      <p style="color:#a7f3d0;margin:6px 0 0;font-size:14px;">${tournament_title}</p>
    </div>

    <div style="${bodyStyle}">
      <div style="${infoCardStyle}">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.5px;">👤 申し込み者情報</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:12px 0;font-size:14px;color:#6b7280;width:35%;">お名前</td><td style="padding:12px 0;font-size:16px;font-weight:700;">${name}</td></tr>
          ${partnerAdminRow}
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:12px 0;font-size:14px;color:#6b7280;">メール</td><td style="padding:12px 0;font-size:14px;"><a href="mailto:${to}" style="color:#2563eb;">${to}</a></td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:12px 0;font-size:14px;color:#6b7280;">電話</td><td style="padding:12px 0;font-size:14px;font-weight:600;">${phone || "未入力"}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:12px 0;font-size:14px;color:#6b7280;">備考</td><td style="padding:12px 0;font-size:14px;">${notes || "なし"}</td></tr>
          <tr style="border-bottom:1px solid #e5e7eb;"><td style="padding:12px 0;font-size:14px;color:#6b7280;">開催日</td><td style="padding:12px 0;font-size:14px;font-weight:600;">${eventDate}</td></tr>
          <tr><td style="padding:12px 0;font-size:14px;color:#6b7280;">支払い</td><td style="padding:12px 0;font-size:14px;font-weight:600;">${payment_required ? `<span style="color:#dc2626;">必要</span>（期限：${paymentDeadlineStr}）` : '<span style="color:#059669;">不要</span>'}</td></tr>
        </table>
      </div>

      ${payment_required ? `
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:14px 18px;font-size:13px;color:#065f46;">
        ✅ 参加者へ支払い案内メールを送信済みです。振込完了の返信はこのアドレスに届きます。
      </div>` : ""}
    </div>

    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">川口・蕨バド交流杯 管理システム</p>
  </div>
</body>
</html>`;

    const adminText = `【新規エントリー】${tournament_title}\n\nお名前：${name}${partner_name ? `\nペアの相手：${partner_name}` : ""}\nメール：${to}\n電話：${phone || "未入力"}\n備考：${notes || "なし"}\n開催日：${eventDate}\n支払い：${payment_required ? `必要（期限：${paymentDeadlineStr}）` : "不要"}`.trim();

    const res2 = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `【新規エントリー】${name}さんが${tournament_title}に申し込みました`,
        text: adminText,
        html: adminHtml,
      }),
    });
    if (!res2.ok) throw new Error(`Admin email error: ${res2.status} ${await res2.text()}`);
    const r2 = await res2.json();
    results.push(r2.id);

    return new Response(
      JSON.stringify({ success: true, email_ids: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Email error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
