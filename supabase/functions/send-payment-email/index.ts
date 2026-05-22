import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PaymentEmailRequest {
  to: string;
  tournament_title: string;
  tournament_date: string;
  payment_deadline: string;
  bank_account: string;
  paypay_id: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { to, tournament_title, tournament_date, payment_deadline, bank_account, paypay_id } =
      (await req.json()) as PaymentEmailRequest;

    // Format dates
    const eventDate = new Date(tournament_date).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const paymentDeadline = new Date(payment_deadline).toLocaleDateString("ja-JP", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Create email body
    const emailBody = `
川口・蕨バド交流杯へのご参加、ありがとうございます。

【大会情報】
大会名：${tournament_title}
開催日：${eventDate}

【支払い期限】
${paymentDeadline}

以下のいずれかの方法でお振込みください：

■ 銀行振込
${bank_account}

■ PayPay
${paypay_id}

よろしくお願いいたします。

川口・蕨バド交流杯
    `.trim();

    // For now, just log the email (in production, integrate with SendGrid, AWS SES, etc.)
    console.log(`Sending email to: ${to}`);
    console.log(`Subject: 川口・蕨バド交流杯 参加費支払い案内`);
    console.log(`Body:\n${emailBody}`);

    return new Response(
      JSON.stringify({ success: true, message: "Email prepared for sending" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});
