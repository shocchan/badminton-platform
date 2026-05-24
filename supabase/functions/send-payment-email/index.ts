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
  tournament_title: string;
  tournament_date: string;
  payment_deadline: string;
  bank_account: string;
  paypay_id: string;
  payment_required: boolean;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      to, name, phone, notes,
      tournament_title, tournament_date, payment_deadline,
      bank_account, paypay_id, payment_required,
    } = (await req.json()) as PaymentEmailRequest;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("RESEND_API_KEY is not set");
    }

    // Format dates
    const eventDate = new Date(tournament_date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const paymentDeadlineStr = payment_deadline
      ? new Date(payment_deadline).toLocaleDateString("ja-JP", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })
      : "未定";

    const results: string[] = [];

    // ── 1. 参加者向け支払い案内メール（payment_required の場合のみ）──
    if (payment_required) {
      const paymentMethodsText = [];
      if (bank_account) {
        paymentMethodsText.push(`■ 銀行振込\n${bank_account}\n※ お振込み後、このメールに返信して「振込完了」とご連絡ください。`);
      }
      if (paypay_id) {
        paymentMethodsText.push(`■ PayPay\nPayPay ID：${paypay_id}\n※ 送金時のメッセージに「${name}」とご記入ください。`);
      }
      const paymentSectionText = paymentMethodsText.length > 0
        ? `以下のいずれか一方でお支払いください：\n\n${paymentMethodsText.join("\n\n")}`
        : "主催者にお問い合わせください。";

      const participantText = `
${name} 様

川口・蕨バド交流杯へのご申し込み、ありがとうございます。

【大会情報】
大会名：${tournament_title}
開催日：${eventDate}

【参加費お支払いのご案内】
お支払い期限：${paymentDeadlineStr}

${paymentSectionText}

お支払い確認後、参加確定のご連絡をいたします。
ご不明な点がございましたら、このメールに返信してください。

川口・蕨バド交流杯
      `.trim();

      const participantHtml = `
<!DOCTYPE html>
<html lang="ja">
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
  <div style="background: linear-gradient(135deg, #2563eb, #3b82f6); padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 20px;">🏸 川口・蕨バド交流杯</h1>
    <p style="color: #bfdbfe; margin: 4px 0 0;">参加費お支払いのご案内</p>
  </div>
  <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;">
    <p><strong>${name}</strong> 様</p>
    <p>このたびは<strong>${tournament_title}</strong>（${eventDate}）へのご申し込みありがとうございます。</p>
    <p>以下のいずれか一方の方法で参加費をお支払いください。</p>

    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 8px; font-weight: bold; color: #dc2626;">⏰ お支払い期限：${paymentDeadlineStr}</p>
    </div>

    ${bank_account ? `
    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 8px; font-weight: bold;">🏦 銀行振込</p>
      <p style="margin: 0 0 10px; white-space: pre-line; color: #475569;">${bank_account}</p>
      <p style="margin: 0; background: #fef9c3; border-radius: 6px; padding: 8px 12px; font-size: 13px; color: #854d0e;">
        📧 振込後はこのメールに返信して「振込完了」とご連絡ください
      </p>
    </div>` : ""}

    ${paypay_id ? `
    <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 8px; font-weight: bold;">📱 PayPay</p>
      <p style="margin: 0 0 10px; color: #475569;">PayPay ID：<strong>${paypay_id}</strong></p>
      <p style="margin: 0; background: #fef9c3; border-radius: 6px; padding: 8px 12px; font-size: 13px; color: #854d0e;">
        ✏️ 送金時のメッセージに「<strong>${name}</strong>」とご記入ください
      </p>
    </div>` : ""}

    <p style="color: #64748b; font-size: 14px; margin-top: 16px;">お支払い確認後、参加確定のご連絡をいたします。<br>ご不明な点はこのメールに返信してください。</p>
  </div>
</body>
</html>
      `.trim();

      const res1 = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
          reply_to: ADMIN_EMAIL,
          to: [to],
          subject: `【参加費支払い案内】${tournament_title}`,
          text: participantText,
          html: participantHtml,
        }),
      });

      if (!res1.ok) {
        const err = await res1.text();
        throw new Error(`Participant email error: ${res1.status} ${err}`);
      }
      const r1 = await res1.json();
      results.push(r1.id);
      console.log("Participant email sent:", r1.id);
    }

    // ── 2. 管理者向け通知メール（常に送信）──
    const adminHtml = `
<!DOCTYPE html>
<html lang="ja">
<body style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #333;">
  <div style="background: linear-gradient(135deg, #059669, #10b981); padding: 20px 24px; border-radius: 12px 12px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 18px;">🏸 新規エントリーが届きました</h1>
    <p style="color: #d1fae5; margin: 4px 0 0; font-size: 14px;">${tournament_title}</p>
  </div>
  <div style="background: #f8fafc; padding: 24px; border-radius: 0 0 12px 12px; border: 1px solid #e2e8f0;">
    <table style="width: 100%; border-collapse: collapse;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; font-weight: bold; color: #64748b; width: 30%;">お名前</td>
        <td style="padding: 10px 0;">${name}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; font-weight: bold; color: #64748b;">メール</td>
        <td style="padding: 10px 0;"><a href="mailto:${to}">${to}</a></td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; font-weight: bold; color: #64748b;">電話</td>
        <td style="padding: 10px 0;">${phone || "未入力"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; font-weight: bold; color: #64748b;">備考</td>
        <td style="padding: 10px 0;">${notes || "なし"}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px 0; font-weight: bold; color: #64748b;">開催日</td>
        <td style="padding: 10px 0;">${eventDate}</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; font-weight: bold; color: #64748b;">支払い</td>
        <td style="padding: 10px 0;">${payment_required ? `必要（期限：${paymentDeadlineStr}）` : "不要"}</td>
      </tr>
    </table>
    ${payment_required ? `
    <div style="margin-top: 16px; background: #fef9c3; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #854d0e;">
      💡 参加者への支払い案内メールを送信済みです。振込完了の返信はこのアドレスに届きます。
    </div>` : ""}
  </div>
</body>
</html>
    `.trim();

    const adminText = `
【新規エントリー通知】${tournament_title}

お名前：${name}
メール：${to}
電話：${phone || "未入力"}
備考：${notes || "なし"}
開催日：${eventDate}
支払い：${payment_required ? `必要（期限：${paymentDeadlineStr}）` : "不要"}
    `.trim();

    const res2 = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "川口・蕨バド交流杯 <onboarding@resend.dev>",
        to: [ADMIN_EMAIL],
        subject: `【新規エントリー】${name}さんが${tournament_title}に申し込みました`,
        text: adminText,
        html: adminHtml,
      }),
    });

    if (!res2.ok) {
      const err = await res2.text();
      throw new Error(`Admin notification error: ${res2.status} ${err}`);
    }
    const r2 = await res2.json();
    results.push(r2.id);
    console.log("Admin notification sent:", r2.id);

    return new Response(
      JSON.stringify({ success: true, email_ids: results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("Email sending error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
