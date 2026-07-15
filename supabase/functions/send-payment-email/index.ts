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
  entry_fee?: number;
  cancel_link?: string;
  is_waitlist?: boolean;
  is_promotion?: boolean;
  // クレジット決済対応（Vol.4〜）
  payment_method?: "credit" | "paypay" | "bank";
  entry_id?: number;
  cancel_token?: string; // paypay/bank の payment_method 記録時の本人確認用
  amount_fee?: number;   // クレジット決済手数料
  amount_total?: number; // 手数料込み合計
  paid_at?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  venue_address?: string;
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
      bank_account, paypay_id, payment_required, entry_fee,
      cancel_link, is_waitlist, is_promotion,
      payment_method, entry_id, cancel_token,
      amount_fee, amount_total, paid_at,
      start_time, end_time, location, venue_address,
    } = (await req.json()) as PaymentEmailRequest;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) throw new Error("RESEND_API_KEY is not set");

    // PayPay/銀行振込選択時: payment_method を記録（cancel_token で本人確認、失敗してもメール送信は続行）
    if (entry_id && cancel_token && (payment_method === "paypay" || payment_method === "bank")) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL");
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (supabaseUrl && serviceKey) {
          await fetch(`${supabaseUrl}/rest/v1/entries?id=eq.${entry_id}&cancel_token=eq.${cancel_token}`, {
            method: "PATCH",
            headers: {
              apikey: serviceKey,
              Authorization: `Bearer ${serviceKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ payment_method }),
          });
        }
      } catch (e) {
        console.error("payment_method update failed:", e.message);
      }
    }

    const eventDate = new Date(tournament_date).toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric", weekday: "short",
    });
    const paymentDeadlineStr = payment_deadline
      ? new Date(payment_deadline).toLocaleDateString("ja-JP", {
          year: "numeric", month: "long", day: "numeric",
        })
      : "未定";

    // キャンセル期限：大会日の14日前
    const cancelDeadlineDate = new Date(tournament_date);
    cancelDeadlineDate.setDate(cancelDeadlineDate.getDate() - 14);
    const cancelDeadlineStr = cancelDeadlineDate.toLocaleDateString("ja-JP", {
      year: "numeric", month: "long", day: "numeric",
    });

    // シャトル持参案内（超初級ダブルス=3000円以外の大会に表示）
    const showShuttleNote = entry_fee !== 3000;
    const shuttleBlock = showShuttleNote ? `
      <div style="margin-top:16px;padding:14px 18px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13px;color:#1e40af;font-weight:700;">🏸 シャトルについて</p>
        <p style="margin:0;font-size:12px;color:#1e3a8a;line-height:1.7;">本大会はシャトル持参制です（日本バドミントン協会またはBWF認定の第2種検定球、3〜5球）。<br>お忘れの場合は当日会場にて1球500円でご購入いただけます。</p>
      </div>` : "";
    const shuttleText = showShuttleNote
      ? "\n\n【シャトルについて】\nシャトル持参制です（第2種検定球 3〜5球）。\n当日会場での購入も可能です（1球500円）。"
      : "";

    const results: string[] = [];

    // ── 0a. クレジット決済完了メール ──
    if (payment_method === "credit") {
      const feeYen = (amount_fee ?? 0).toLocaleString();
      const totalYen = (amount_total ?? entry_fee ?? 0).toLocaleString();
      const entryFeeYen = (entry_fee ?? 0).toLocaleString();
      const paidAtStr = paid_at
        ? new Date(paid_at).toLocaleString("ja-JP", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tokyo" })
        : "";
      const timeRange = start_time && end_time ? `${start_time.slice(0, 5)}〜${end_time.slice(0, 5)}` : "";

      // Googleカレンダー追加リンク
      const d = tournament_date.slice(0, 10).replace(/-/g, "");
      const calStart = start_time ? `${d}T${start_time.slice(0, 5).replace(":", "")}00` : d;
      const calEnd = end_time ? `${d}T${end_time.slice(0, 5).replace(":", "")}00` : d;
      const calParams = new URLSearchParams({
        action: "TEMPLATE",
        text: tournament_title,
        dates: `${calStart}/${calEnd}`,
        details: `川口・蕨バド交流杯\n参加費支払い済み（クレジットカード）`,
        location: venue_address || location || "",
      });
      const calUrl = `https://calendar.google.com/calendar/render?${calParams.toString()}`;

      const partnerRowC = partner_name
        ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">ペアの相手</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${partner_name}</td></tr>`
        : "";

      const creditHtml = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="${headerStyle("linear-gradient(135deg,#065f46 0%,#059669 50%,#10b981 100%)")}">
      <div style="font-size:28px;margin-bottom:8px;">✅</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">川口・蕨バド交流杯</h1>
      <p style="color:#a7f3d0;margin:6px 0 0;font-size:14px;">お支払い完了・参加確定</p>
    </div>
    <div style="${bodyStyle}">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">参加費のお支払いが完了し、参加が確定しました！</p>

      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#065f46;font-weight:700;">✅ お支払い済み（クレジットカード）¥${totalYen}</p>
      </div>

      <div style="${infoCardStyle}">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.5px;">📋 参加確認</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">大会名</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${tournament_title}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">日時</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${eventDate}${timeRange ? ` ${timeRange}` : ""}</td></tr>
          ${location ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">会場</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${location}</td></tr>` : ""}
          ${venue_address ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">住所</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${venue_address}</td></tr>` : ""}
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">お名前</td><td style="padding:10px 0;font-weight:600;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">${name}</td></tr>
          ${partnerRowC}
        </table>
      </div>

      <!-- 領収明細 -->
      <div style="${payCardStyle}">
        <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#065f46;">🧾 領収明細</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;">
          <tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6;">参加費</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #f3f4f6;">¥${entryFeeYen}</td></tr>
          <tr><td style="padding:8px 0;color:#6b7280;border-bottom:1px solid #f3f4f6;">決済手数料</td><td style="padding:8px 0;text-align:right;border-bottom:1px solid #f3f4f6;">¥${feeYen}</td></tr>
          <tr><td style="padding:8px 0;font-weight:700;">合計</td><td style="padding:8px 0;text-align:right;font-weight:700;">¥${totalYen}</td></tr>
          ${paidAtStr ? `<tr><td style="padding:8px 0;color:#6b7280;">支払日時</td><td style="padding:8px 0;text-align:right;font-size:13px;">${paidAtStr}</td></tr>` : ""}
        </table>
        <div style="${warningStyle}">🧾 領収書は申し込み完了画面からダウンロードできます。カード明細にも記録が残ります。</div>
      </div>

      <!-- 当日受付の案内 -->
      <div style="margin:24px 0;padding:16px 20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;">
        <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#374151;">🙋 当日の受付について</p>
        <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6;">受付でお名前をお伝えください。参加証などのご提示は不要です。</p>
      </div>

      <!-- カレンダー追加 -->
      <div style="text-align:center;margin:0 0 20px;">
        <a href="${calUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;font-size:14px;font-weight:700;padding:12px 24px;border-radius:10px;text-decoration:none;">📅 Googleカレンダーに追加</a>
      </div>

      <!-- キャンセル期限 -->
      <div style="margin-top:16px;padding:14px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
        <p style="margin:0 0 4px;font-size:13px;color:#9a3412;font-weight:700;">🚫 キャンセル期限：${cancelDeadlineStr}（大会2週間前）</p>
        <p style="margin:0;font-size:12px;color:#7c2d12;line-height:1.6;">期限内のキャンセルは参加費¥${entryFeeYen}をクレジットカードに返金いたします（決済手数料¥${feeYen}は返金対象外です。返金処理に数日かかる場合があります）。<br>期限を過ぎたキャンセルは返金できませんのでご注意ください。</p>
      </div>

      ${cancel_link ? `
      <div style="margin-top:12px;padding:14px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13px;color:#374151;font-weight:600;">❌ キャンセルについて</p>
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">キャンセルが必要な場合は期限内に以下のリンクからお手続きください。</p>
        <a href="${cancel_link}" style="font-size:12px;color:#dc2626;word-break:break-all;">${cancel_link}</a>
      </div>` : ""}

      ${shuttleBlock}

      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body>
</html>`;

      const creditText = `${name} 様\n\n川口・蕨バド交流杯「${tournament_title}」の参加費のお支払いが完了し、参加が確定しました！\n\n【参加確認】\n大会名：${tournament_title}\n日時：${eventDate}${timeRange ? ` ${timeRange}` : ""}${location ? `\n会場：${location}` : ""}${venue_address ? `\n住所：${venue_address}` : ""}${partner_name ? `\nペアの相手：${partner_name}` : ""}\n\n【領収明細】\n参加費：¥${entryFeeYen}\n決済手数料：¥${feeYen}\n合計：¥${totalYen}（クレジットカード支払い済み）${paidAtStr ? `\n支払日時：${paidAtStr}` : ""}\n\n【当日の受付】\n受付でお名前をお伝えください。参加証などのご提示は不要です。\n\n【キャンセル期限】${cancelDeadlineStr}（大会2週間前）\n期限内のキャンセルは参加費¥${entryFeeYen}をクレジットカードに返金いたします（決済手数料¥${feeYen}は返金対象外）。${cancel_link ? `\nキャンセルはこちら：${cancel_link}` : ""}${shuttleText}\n\nGoogleカレンダーに追加：${calUrl}\n\n当日会場でお待ちしています！\n\n川口・蕨バド交流杯`.trim();

      const resC = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          reply_to: ADMIN_EMAIL,
          to: [to],
          subject: `✅【お支払い完了】${tournament_title}への参加が確定しました`,
          text: creditText,
          html: creditHtml,
        }),
      });
      if (!resC.ok) throw new Error(`Credit email error: ${resC.status} ${await resC.text()}`);
      results.push((await resC.json()).id);

      // 管理者通知（決済完了）
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          to: [ADMIN_EMAIL],
          subject: `💳【決済完了】${name}さんが${tournament_title}の参加費をクレジットで支払いました`,
          text: `クレジット決済完了\n\nお名前：${name}${partner_name ? `\nペアの相手：${partner_name}` : ""}\nメール：${to}\n電話：${phone || "未入力"}\n備考：${notes || "なし"}\n大会：${tournament_title}\n開催日：${eventDate}\n\n参加費：¥${entryFeeYen}\n手数料：¥${feeYen}\n合計：¥${totalYen}${paidAtStr ? `\n支払日時：${paidAtStr}` : ""}\n\n※振込確認は不要です。返金が必要な場合は Stripe ダッシュボードから refund してください。`.trim(),
        }),
      });

      return new Response(
        JSON.stringify({ success: true, email_ids: results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── 0. キャンセル待ちメール ──
    if (is_waitlist) {
      const partnerRow = partner_name
        ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;">ペアの相手</td><td style="padding:10px 0;font-weight:600;">${partner_name}</td></tr>`
        : "";

      const waitlistHtml = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="background:linear-gradient(135deg,#b45309 0%,#d97706 50%,#f59e0b 100%);padding:28px 32px;border-radius:16px 16px 0 0;">
      <div style="font-size:28px;margin-bottom:8px;">⏳</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">川口・蕨バド交流杯</h1>
      <p style="color:#fef3c7;margin:6px 0 0;font-size:14px;">キャンセル待ち登録完了</p>
    </div>
    <div style="${bodyStyle}">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">キャンセル待ちにご登録いただきありがとうございます。</p>
      <div style="${infoCardStyle}">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.5px;">📋 登録内容</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">大会名</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${tournament_title}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">開催日</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${eventDate}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">お名前</td><td style="padding:10px 0;font-weight:600;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">${name}</td></tr>
          ${partnerRow}
        </table>
      </div>
      <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px;padding:16px 20px;margin:20px 0;">
        <p style="margin:0 0 8px;font-size:14px;color:#92400e;font-weight:700;">⏳ キャンセル待ち中</p>
        <p style="margin:0;font-size:13px;color:#78350f;line-height:1.6;">現在満員のため、キャンセル待ちとなっています。<br>キャンセルが発生した場合、このメールアドレスに繰り上げ当選のご連絡をします。</p>
      </div>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0 0 4px;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body>
</html>`;

      const res0 = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          reply_to: ADMIN_EMAIL,
          to: [to],
          subject: `【キャンセル待ち登録完了】${tournament_title}`,
          text: `${name} 様\n\n川口・蕨バド交流杯「${tournament_title}」のキャンセル待ちにご登録いただきありがとうございます。\n\n開催日：${eventDate}\n\n現在満員のため、キャンセル待ちとなっています。\nキャンセルが発生した際に、このメールアドレスへ繰り上げ当選のご連絡をします。\n\n川口・蕨バド交流杯`.trim(),
          html: waitlistHtml,
        }),
      });
      if (!res0.ok) throw new Error(`Waitlist email error: ${res0.status} ${await res0.text()}`);
      const r0 = await res0.json();
      results.push(r0.id);

      // 管理者にも通知（キャンセル待ち）
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          to: [ADMIN_EMAIL],
          subject: `【キャンセル待ち登録】${name}さんが${tournament_title}のキャンセル待ちに登録しました`,
          text: `キャンセル待ち登録\n\nお名前：${name}${partner_name ? `\nペアの相手：${partner_name}` : ""}\nメール：${to}\n電話：${phone || "未入力"}\n備考：${notes || "なし"}\n大会：${tournament_title}\n開催日：${eventDate}`.trim(),
        }),
      });

      return new Response(
        JSON.stringify({ success: true, email_ids: results }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // ── 0.5. 管理者手動繰り上げメール ──
    if (is_promotion) {
      const partnerRowP = partner_name
        ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">ペアの相手</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${partner_name}</td></tr>`
        : "";
      const cancelBlockP = cancel_link ? `
      <div style="margin-top:16px;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13px;color:#991b1b;font-weight:600;">❌ キャンセルについて</p>
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">キャンセル期限内であれば以下のリンクからお手続きできます。</p>
        <a href="${cancel_link}" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;text-decoration:none;">キャンセルする</a>
      </div>` : "";
      const promoHtml = `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="${headerStyle("linear-gradient(135deg,#065f46 0%,#059669 50%,#10b981 100%)")}">
      <div style="font-size:28px;margin-bottom:8px;">🎉</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;">川口・蕨バド交流杯</h1>
      <p style="color:#a7f3d0;margin:6px 0 0;font-size:14px;">繰り上げ当選のご案内</p>
    </div>
    <div style="${bodyStyle}">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">キャンセルが発生し、繰り上げ当選となりました！</p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#065f46;font-weight:700;">🎉 参加が確定しました！当日会場でお待ちしています。</p>
      </div>
      <div style="${infoCardStyle}">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;letter-spacing:0.5px;">📋 大会情報</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">大会名</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${tournament_title}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">開催日</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${eventDate}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">お名前</td><td style="padding:10px 0;font-weight:600;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">${name}</td></tr>
          ${partnerRowP}
        </table>
      </div>
      ${payment_required ? `<p style="font-size:14px;color:#374151;margin:16px 0 8px;font-weight:600;">参加費のお支払いをお願いします：</p>
      ${bank_account ? `<div style="${payCardStyle}"><p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#1e3a8a;">🏦 銀行振込</p><p style="margin:0;font-size:14px;white-space:pre-line;line-height:1.8;">${bank_account}</p></div>` : ""}
      ${paypay_id ? `<div style="${payCardStyle}"><p style="margin:0 0 8px;font-size:15px;font-weight:700;color:#dc2626;">📱 PayPay ID: ${paypay_id}</p><div style="${warningStyle}">✏️ 送金時は「${name}」とご記入ください</div></div>` : ""}` : ""}
      ${cancelBlockP}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body></html>`;
      const resP = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          reply_to: ADMIN_EMAIL,
          to: [to],
          subject: `【繰り上げ当選】${tournament_title} への参加が確定しました`,
          text: `${name} 様\n\nキャンセルが発生し、繰り上げ当選となりました！\n\n大会名：${tournament_title}\n開催日：${eventDate}\n\n${cancel_link ? `キャンセルはこちら：${cancel_link}\n\n` : ""}当日会場でお待ちしています。\n\n川口・蕨バド交流杯`,
          html: promoHtml,
        }),
      });
      if (!resP.ok) throw new Error(`Promotion email error: ${resP.status} ${await resP.text()}`);
      results.push((await resP.json()).id);
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          to: [ADMIN_EMAIL],
          subject: `【繰り上げ完了】${name}さんを${tournament_title}に繰り上げました`,
          text: `管理者操作による繰り上げ\n\nお名前：${name}\nメール：${to}\n大会：${tournament_title}\n開催日：${eventDate}`,
        }),
      });
      return new Response(JSON.stringify({ success: true, email_ids: results }), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 });
    }

    // ── 1. 参加者向けメール（支払い必要な場合のみ） ──
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

      <!-- キャンセル期限 -->
      <div style="margin-top:16px;padding:14px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
        <p style="margin:0 0 4px;font-size:13px;color:#9a3412;font-weight:700;">🚫 キャンセル期限：${cancelDeadlineStr}（大会2週間前）</p>
        <p style="margin:0;font-size:12px;color:#7c2d12;line-height:1.6;">期限内のキャンセルは全額返金いたします。<br>期限を過ぎたキャンセルは返金できませんのでご注意ください。</p>
      </div>

      <!-- キャンセルリンク -->
      ${cancel_link ? `
      <div style="margin-top:12px;padding:14px 18px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13px;color:#374151;font-weight:600;">❌ キャンセルについて</p>
        <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">キャンセルが必要な場合は期限内に以下のリンクからお手続きください。</p>
        <a href="${cancel_link}" style="font-size:12px;color:#dc2626;word-break:break-all;">${cancel_link}</a>
      </div>` : ""}

      ${shuttleBlock}

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

      const participantText = `${name} 様\n\n川口・蕨バド交流杯へのご申し込みありがとうございます。\n\n【大会情報】\n大会名：${tournament_title}\n開催日：${eventDate}${partner_name ? `\nペアの相手：${partner_name}` : ""}\n\n【お支払い期限】${paymentDeadlineStr}\n\n${bank_account ? `■ 銀行振込\n${bank_account}\n※振込後、このメールに「振込完了」と返信ください。\n\n` : ""}${paypay_id ? `■ PayPay\nPayPay ID：${paypay_id}\n※送金時のメッセージに「${name}」とご記入ください。\n\n` : ""}【キャンセル期限】${cancelDeadlineStr}（大会2週間前）\n期限内のキャンセルは全額返金いたします。期限を過ぎたキャンセルは返金できません。${shuttleText}\n\nお支払い確認後、参加確定のご連絡をいたします。\n\n川口・蕨バド交流杯`.trim();

      const res1 = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
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
    } else {
      // ── 1b. 支払い不要の場合：申し込み完了確認メール ──
      const partnerRow = partner_name
        ? `<tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;">ペアの相手</td><td style="padding:10px 0;font-weight:600;">${partner_name}</td></tr>`
        : "";

      const cancelBlock = cancel_link
        ? `<div style="margin-top:16px;padding:14px 18px;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;">
        <p style="margin:0 0 6px;font-size:13px;color:#991b1b;font-weight:600;">❌ キャンセルについて</p>
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">キャンセル期限内であれば以下のリンクからお手続きできます。</p>
        <a href="${cancel_link}" style="display:inline-block;background:#dc2626;color:#ffffff;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;text-decoration:none;">キャンセルする</a>
      </div>`
        : "";

      const confirmHtml = `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN',Meiryo,sans-serif;">
  <div style="max-width:600px;margin:32px auto;padding:0 16px;">
    <div style="${headerStyle("linear-gradient(135deg,#065f46 0%,#059669 50%,#10b981 100%)")}">
      <div style="font-size:28px;margin-bottom:8px;">🎉</div>
      <h1 style="color:#ffffff;margin:0;font-size:20px;font-weight:700;letter-spacing:-0.5px;">川口・蕨バド交流杯</h1>
      <p style="color:#a7f3d0;margin:6px 0 0;font-size:14px;">申し込み受付完了</p>
    </div>
    <div style="${bodyStyle}">
      <p style="font-size:16px;font-weight:600;margin:0 0 4px;">${name} 様</p>
      <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">ご申し込みありがとうございます。参加が確定しました！</p>
      <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px 20px;margin:0 0 20px;">
        <p style="margin:0;font-size:14px;color:#065f46;font-weight:700;">✅ 事前振り込みは不要です。参加費は当日会場にて現金またはPayPayでお支払いください。</p>
      </div>
      <div style="${infoCardStyle}">
        <p style="margin:0 0 14px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:0.5px;">📋 申し込み内容</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;width:40%;border-bottom:1px solid #e5e7eb;">大会名</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${tournament_title}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;border-bottom:1px solid #e5e7eb;">開催日</td><td style="padding:10px 0;font-weight:600;border-bottom:1px solid #e5e7eb;">${eventDate}</td></tr>
          <tr><td style="padding:10px 0;color:#6b7280;font-size:14px;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">お名前</td><td style="padding:10px 0;font-weight:600;${partner_name ? "border-bottom:1px solid #e5e7eb;" : ""}">${name}</td></tr>
          ${partnerRow}
        </table>
      </div>
      <!-- キャンセル期限 -->
      <div style="margin-top:16px;padding:14px 18px;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
        <p style="margin:0 0 4px;font-size:13px;color:#9a3412;font-weight:700;">🚫 キャンセル期限：${cancelDeadlineStr}（大会2週間前）</p>
        <p style="margin:0;font-size:12px;color:#7c2d12;line-height:1.6;">期限内のキャンセルは全額返金いたします。<br>期限を過ぎたキャンセルは返金できませんのでご注意ください。</p>
      </div>

      ${cancelBlock}
      ${shuttleBlock}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e5e7eb;">
        <p style="font-size:13px;color:#9ca3af;margin:0;">ご不明な点はこのメールに返信してください。</p>
        <p style="font-size:13px;font-weight:600;color:#374151;margin:16px 0 0;">川口・蕨バド交流杯</p>
      </div>
    </div>
    <p style="text-align:center;font-size:12px;color:#9ca3af;margin:16px 0 32px;">このメールはシステムから自動送信されています</p>
  </div>
</body>
</html>`;

      const confirmText = `${name} 様\n\n川口・蕨バド交流杯へのご申し込みありがとうございます。\n参加が確定しました！\n\n大会名：${tournament_title}\n開催日：${eventDate}${partner_name ? `\nペアの相手：${partner_name}` : ""}\n\n事前振り込みは不要です。参加費は当日会場にて現金またはPayPayでお支払いください。\n\n【キャンセル期限】${cancelDeadlineStr}（大会2週間前）\n期限内のキャンセルは全額返金いたします。期限を過ぎたキャンセルは返金できません。${shuttleText}\n\n${cancel_link ? `キャンセルはこちら：${cancel_link}\n\n` : ""}川口・蕨バド交流杯`.trim();

      const res1b = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
          reply_to: ADMIN_EMAIL,
          to: [to],
          subject: `【申し込み完了】${tournament_title}への参加が確定しました`,
          text: confirmText,
          html: confirmHtml,
        }),
      });
      if (!res1b.ok) throw new Error(`Confirm email error: ${res1b.status} ${await res1b.text()}`);
      const r1b = await res1b.json();
      results.push(r1b.id);
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
        from: "川口・蕨バド交流杯 <noreply@kawabado.com>",
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
