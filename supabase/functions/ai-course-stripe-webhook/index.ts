// AIコース セルフサービス決済: Stripe Webhook（決済確認 → アカウント自動発行 → メール通知）。
//
// 人の手を挟まない全自動フロー（CEO指示 2026-08-19）:
//   checkout.session.completed（支払済み）を受けたら、
//   1. 台帳（ai_plan_purchases）を paid に
//   2. 生徒アカウントを発行（scripts/ai-course/create-student-login.mjs と同じ構成:
//      内部メール {loginId}@id.badminton-platform.pages.dev ＋ signup grant ＋ ai_course_access）
//   3. 購入者の実メールへ ログインID・初期パスワード・開始手順 を送信（Resend）
//   4. info@kawabado.com へ購入通知のコピー
//
// 冪等性（Stripeは失敗時に再送する）:
// - stripe_session_id unique の台帳が要。status='provisioned' なら何もせず200
// - 受講権の反映は ai_grant_purchase_access RPC（migration 20260824140000）が
//   purchase_id unique で二重延長を止める。**アプリ側で read-modify-write しない**
// - ログインIDは session_id から決定的に導出（再試行で二重アカウントを作らない）。
//   既にユーザーが存在したらパスワードを再設定して続行（メールの初期PWを常に有効にする）
// - 同じ購入者メールの2回目以降の購入は、前回発行したアカウントを再利用して期間を延長
//   （パスワードは変更しない。アカウントが人ごとに増殖しない）
// - 途中で失敗したら status='failed'＋error を記録して 500 を返す（Stripeが再送→再開）
//
// 非同期決済（Alipay / WeChat Pay）:
// - checkout.session.completed が payment_status='unpaid' で先に届く。
//   **未払いのままアカウントを発行しない**（台帳を awaiting_payment にして待つ）
// - 入金確定は checkout.session.async_payment_succeeded、失敗は
//   checkout.session.async_payment_failed。どちらも処理する
//
// デプロイ（CEO承認後・**--no-verify-jwt 必須**。StripeはSupabaseのJWTを付けられない）:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy \
//     ai-course-stripe-webhook --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { FUNCTION_PLAN_CATALOG, isSelfServePlan, type FunctionPlan } from "../_shared/aiCoursePlans.ts";

const ID_DOMAIN = "id.badminton-platform.pages.dev";
const ADMIN_EMAIL = "info@kawabado.com";
const MAIL_FROM = "日本語の相棒 <noreply@kawabado.com>";
/** 生徒向けの正準ドメイン（WeChatが *.pages.dev をブロックするため必ずこちらを案内） */
const STUDENT_SITE = "https://study.kawabado.com";
const LEGAL_SITE = "https://kawabado.com";

/* ── Stripe署名検証（v1・HMAC-SHA256・許容ズレ5分） ── */
const verifyStripeSignature = async (
  payload: string, sigHeader: string, secret: string,
): Promise<boolean> => {
  const parts = new Map<string, string[]>();
  for (const kv of sigHeader.split(",")) {
    const [k, v] = kv.split("=", 2);
    if (!k || !v) continue;
    parts.set(k.trim(), [...(parts.get(k.trim()) ?? []), v.trim()]);
  }
  const t = parts.get("t")?.[0];
  const v1s = parts.get("v1") ?? [];
  if (!t || v1s.length === 0) return false;
  const age = Math.abs(Date.now() / 1000 - Number(t));
  if (!Number.isFinite(age) || age > 300) return false;

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${payload}`));
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // 比較は全候補に対して定数時間風に行う
  return v1s.some((v1) => {
    if (v1.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= v1.charCodeAt(i) ^ expected.charCodeAt(i);
    return diff === 0;
  });
};

/* ── ログインID（session_idから決定的に導出＝再試行で同じIDになる） ── */
const loginIdFor = async (sessionId: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sessionId));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `s${hex.slice(0, 7)}`; // 英小文字はじまり8字（既存IDルール ^[a-z][a-z0-9]{1,19}$ に適合）
};

/* ── 初期パスワード（12字・紛らわしい文字なし） ── */
const generatePassword = (): string => {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
};

/** 期限の表示。値が取れなかったときに「Invalid Date」と書かない（購入者に嘘を見せない） */
const jstDate = (iso: string | null): string =>
  iso && Number.isFinite(Date.parse(iso))
    ? new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" })
    : "ログイン後の画面でご確認ください";

/* ── 購入者向けメール本文 ── */
const buyerMail = (input: {
  locale: "ja" | "zh"; plan: FunctionPlan; validUntilISO: string | null;
  loginId: string; password: string | null; reusedAccount: boolean;
}): { subject: string; text: string } => {
  const { locale, plan, loginId, password, reusedAccount } = input;
  const ja = locale === "ja";
  // 期限が取れなかったときは推測した日付を書かない（購入者の言語で案内へ倒す）
  const until = input.validUntilISO && Number.isFinite(Date.parse(input.validUntilISO))
    ? jstDate(input.validUntilISO)
    : (ja ? "ログイン後の画面でご確認ください" : "请在登录后的页面确认");
  const name = ja ? plan.nameJa : plan.nameZh;
  const price = ja ? plan.priceLabelJa : plan.priceLabelZh;
  const duration = ja ? plan.durationLabelJa : plan.durationLabelZh;
  const loginUrl = `${STUDENT_SITE}/${locale}/ai-course/login`;
  const trialNote = plan.trialDays !== null
    ? (ja
      ? `・ログイン後に「体験を始める」を押すと、そこから${plan.trialDays}日間ご利用いただけます（開始は購入後30日以内）\n`
        + `・AI先生との音声会話は合計3回まで（1日2回まで）。翌日の復習まで一周ためせます\n`
      : `・登录后按下「开始体验」，即可从那一刻起使用${plan.trialDays}天（请在购买后30天内开始）\n`
        + `・AI老师的语音会话共3次（每天最多2次）。可以完整体验到第二天的复习\n`)
    : plan.realtimeWindowMinutes !== null
    ? (ja
      ? `・ログイン後に「体験を始める」を押すと、そこから${plan.realtimeWindowMinutes}分間ご利用いただけます（開始は購入後30日以内・途中で閉じてもカウントは止まりません）\n`
      : `・登录后按下「开始体验」，即可从那一刻起使用${plan.realtimeWindowMinutes}分钟（请在购买后30天内开始・中途关闭页面计时也不会停止）\n`)
    : plan.aiMinutes !== null
      ? (ja ? `・AI会話は累計${plan.aiMinutes}分までご利用いただけます\n` : `・AI会话累计可使用${plan.aiMinutes}分钟\n`)
      : "";

  if (ja) {
    const loginBlock = reusedAccount
      ? `ログインページ：${loginUrl}\nログインID：${loginId}\nパスワード：これまでと同じものをご利用ください（変更されていません）`
      : `ログインページ：${loginUrl}\nログインID：${loginId}\n初期パスワード：${password}`;
    return {
      subject: `【日本語の相棒】ご購入ありがとうございます（${name}）`,
      text: `${name}のご購入を確認しました。${reusedAccount ? "お使いのアカウントに利用期間を追加しました。" : "アカウントを発行しましたので、下記からログインしてください。"}

■ ご購入内容
プラン：${name}
金額：${price}
利用期間：${duration}（${until} まで）

■ ログイン情報
${loginBlock}

■ はじめかた
1. ログインページを開き、IDとパスワードを入力します
2. お名前を入力すると、学習の準備が始まります
3. ログイン後、「設定」からパスワードを変更できます

■ ご注意
・アカウントの共有・譲渡はできません（利用規約 第4条）
・本プランは買い切りで、自動更新はありません
${trialNote}
ご不明な点はこのメールに返信するか、${ADMIN_EMAIL} へご連絡ください。
利用規約: ${LEGAL_SITE}/ja/ai-course/terms
特定商取引法に基づく表記: ${LEGAL_SITE}/ja/ai-course/tokushoho

kawabado 安田翔`,
    };
  }
  const loginBlock = reusedAccount
    ? `登录页面：${loginUrl}\n登录ID：${loginId}\n密码：请使用之前的密码（未变更）`
    : `登录页面：${loginUrl}\n登录ID：${loginId}\n初始密码：${password}`;
  return {
    subject: `【你的日语搭档】感谢购买（${name}）`,
    text: `已确认你购买了${name}。${reusedAccount ? "已为你的账号追加了使用期限。" : "账号已开通，请从下方登录。"}

■ 购买内容
方案：${name}
金额：${price}
使用期限：${duration}（至 ${until}）

■ 登录信息
${loginBlock}

■ 开始方法
1. 打开登录页面，输入ID和密码
2. 输入名字后，学习准备就会开始
3. 登录后可在「设置」中修改密码

■ 注意事项
・账号不可共享或转让（使用条款 第4条）
・本方案为一次性付费，不会自动续费
${trialNote}
如有疑问，请直接回复本邮件，或联系 ${ADMIN_EMAIL}。
使用条款: ${LEGAL_SITE}/zh/ai-course/terms
特定商业交易法标示: ${LEGAL_SITE}/zh/ai-course/tokushoho

kawabado 安田翔`,
  };
};

/**
 * 運用アラートを立てる（2026-08-23 監査P0）。管理画面「運用」タブに出る。
 * 初期パスワードは購入者メールにしか届かないので、そこが欠けた購入は
 * **人が気づける形で残さないと、支払った人が黙って詰む**。
 * PIIは入れない（メール本文は書かない・ログインIDまで）。
 */
const raiseAlert = async (
  supabaseUrl: string, dbHeaders: Record<string, string>,
  a: { dedupeKey: string; kind: string; severity: "critical" | "warning" | "info"; title: string; detail: string },
): Promise<void> => {
  try {
    const nowISO = new Date().toISOString();
    const res = await fetch(
      `${supabaseUrl}/rest/v1/ai_course_alerts?dedupe_key=eq.${encodeURIComponent(a.dedupeKey)}&select=id,occurrences`,
      { headers: dbHeaders },
    );
    const rows = res.ok ? await res.json() : [];
    if (Array.isArray(rows) && rows.length > 0) {
      await fetch(`${supabaseUrl}/rest/v1/ai_course_alerts?id=eq.${rows[0].id}`, {
        method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({
          occurrences: Number(rows[0].occurrences ?? 1) + 1, last_seen_at: nowISO,
          detail: a.detail, resolved: false, resolved_at: null, resolved_by: null,
        }),
      });
      return;
    }
    await fetch(`${supabaseUrl}/rest/v1/ai_course_alerts`, {
      method: "POST", headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        dedupe_key: a.dedupeKey, kind: a.kind, severity: a.severity,
        title: a.title, detail: a.detail, first_seen_at: nowISO, last_seen_at: nowISO,
      }),
    });
  } catch (e) {
    console.error("raiseAlert failed:", e instanceof Error ? e.message : "unknown");
  }
};

serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" }, status });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    const webhookSecret = Deno.env.get("AI_COURSE_STRIPE_WEBHOOK_SECRET") ?? "";
    // 鍵は大会決済の STRIPE_SECRET_KEY と共用（checkout関数と同じフォールバック）
    const stripeKey = Deno.env.get("AI_COURSE_STRIPE_SECRET_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!webhookSecret || !stripeKey) return json({ error: "not_configured" }, 503);

    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };
    const authAdmin = (path: string, init: RequestInit = {}) =>
      fetch(`${supabaseUrl}/auth/v1${path}`, {
        ...init,
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json", ...(init.headers ?? {}),
        },
      });

    // ── 署名検証（生ボディで行う。JSON.parse より先） ──
    const payload = await req.text();
    const sig = req.headers.get("stripe-signature") ?? "";
    if (!(await verifyStripeSignature(payload, sig, webhookSecret))) {
      return json({ error: "invalid_signature" }, 400);
    }

    const event = JSON.parse(payload);

    /* ── 返金・チャージバック（2026-08-20 追加）─────────────────────
       返金したのに学習を続けられる状態を人手で止める運用をやめる。
       - charge.refunded（**全額返金のときだけ**）: 台帳を refunded にし、受講権を即時終了
       - charge.dispute.created: 自動では止めず管理者へ通知（異議申立ての段階で
         正規の生徒を締め出さない。止めるかは人が決める）
       いずれも「その購入で付けた受講権」だけを対象にする（purchase_id で照合）。
       あとから上位プランを買っている場合、そちらの権利は絶対に消さない */
    if (event.type === "charge.refunded" || event.type === "charge.dispute.created") {
      const charge = event.data?.object ?? {};
      const pi: string | null = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (!pi) return json({ received: true, skipped: "no_payment_intent" });

      const rowRes = await fetch(
        `${supabaseUrl}/rest/v1/ai_plan_purchases?stripe_payment_intent_id=eq.${encodeURIComponent(pi)}&select=*`,
        { headers: dbHeaders },
      );
      const target = rowRes.ok ? (await rowRes.json())?.[0] : null;
      if (!target) {
        console.error("refund/dispute: purchase not found for", pi);
        return json({ received: true, skipped: "purchase_not_found" });
      }

      const isDispute = event.type === "charge.dispute.created";
      const fullyRefunded = !isDispute
        && typeof charge.amount_refunded === "number" && typeof charge.amount === "number"
        && charge.amount_refunded >= charge.amount;

      let refundRecorded = true;
      if (fullyRefunded) {
        // status='refunded' は 20260824140000 でCHECKに追加した値。
        // それ以前は CHECK 違反(23514)で**返金の記録が黙って落ちていた**ので、結果を見る
        const refundPatch = await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${target.id}`, {
          method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ status: "refunded", updated_at: new Date().toISOString() }),
        });
        refundRecorded = refundPatch.ok;
        if (!refundPatch.ok) {
          console.error("refund status patch failed:", refundPatch.status, await refundPatch.text());
          await raiseAlert(supabaseUrl, dbHeaders, {
            dedupeKey: `refund_not_recorded:${target.id}`,
            kind: "refund_not_recorded",
            severity: "warning",
            title: "返金を台帳に記録できませんでした",
            detail: `購入ID ${target.id} / 受講権の終了は実行済み。台帳の状態だけが古いままです（migration 20260824140000 未適用の可能性）`,
          });
        }
        /* この購入で付与した受講権だけを即時終了（学習記録には触れない）。
           格下げガードが働いた購入（上位プランを持つ人の下位購入）は
           purchase_id を書き換えていないので、ここは0行更新になる＝
           **上位の受講権を返金で消さない**。延長したぶんの日数は残るので、
           必要なら管理画面で調整する（機械が期間を削るほうが事故が大きい） */
        if (target.user_id) {
          await fetch(
            `${supabaseUrl}/rest/v1/ai_course_access?user_id=eq.${target.user_id}&purchase_id=eq.${target.id}`,
            {
              method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
              body: JSON.stringify({
                valid_until: new Date().toISOString(),
                note: `返金により終了（${new Date().toISOString().slice(0, 10)}）`,
                updated_at: new Date().toISOString(),
              }),
            },
          );
        }
      }

      if (resendKey) {
        const tag = event.livemode ? "" : "[TEST]";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: MAIL_FROM, to: [ADMIN_EMAIL],
            subject: isDispute
              ? `⚠️${tag}【AIコース】チャージバック（異議申立て）が発生しました`
              : `↩️${tag}【AIコース】返金を処理しました（${target.plan_id}）`,
            text: [
              isDispute
                ? "Stripeで異議申立て（チャージバック）が発生しました。**自動では利用を止めていません。**"
                : (fullyRefunded
                  ? "全額返金を検知したので、この購入で付けた受講権を終了しました。"
                  : "一部返金を検知しました。**受講権はそのままです**（必要なら管理画面で調整してください）。"),
              "",
              `プラン: ${target.plan_id}`,
              `ログインID: ${target.login_id ?? "(未発行)"}`,
              `購入者: ${target.buyer_email ?? "(不明)"}`,
              `返金額: ${charge.amount_refunded ?? "-"} / 決済額: ${charge.amount ?? "-"}`,
              `payment_intent: ${pi}`,
              ...(fullyRefunded && !refundRecorded
                ? ["", "⚠️ 台帳の状態を『返金済み』に更新できませんでした（管理画面では古い状態のまま見えます）。"]
                : []),
              "",
              "学習記録は消していません。復活させる場合は管理画面の受講権タブで期間を設定してください。",
            ].join("\n"),
          }),
        }).catch((e) => console.error("refund mail failed:", e));
      }
      return json({ received: true, handled: event.type, revoked: fullyRefunded });
    }

    /* ── 非同期決済の失敗（2026-08-24 追加 / 2026-08-26 統合）───────────────
       Alipay / WeChat Pay は「決済ページで承認 → あとで入金確定」の順に進む。
       確定しなかった場合 checkout.session.async_payment_failed が届く。
       これを無視すると台帳が pending のまま残り、**買おうとして失敗した人が
       管理画面から見えない**（離脱と区別が付かない）。購入者から見ても
       「払えたのか分からない」状態が続く。台帳を failed にして、
       決済完了ページが「完了していません」と言い切れるようにする。

       対象の状態は pending / awaiting_payment / paid の3つ。
       **provisioned は含めない**（すでにアカウントを発行した行を巻き込まない）。
       受講権はまだ出していないので取り消すものは無い。 */
    if (event.type === "checkout.session.async_payment_failed") {
      const s = event.data?.object ?? {};
      const sid: string = typeof s.id === "string" ? s.id : "";
      if (!sid) return json({ received: true, skipped: "no_session_id" });
      const method = Array.isArray(s.payment_method_types) ? s.payment_method_types[0] ?? null : null;
      await fetch(
        `${supabaseUrl}/rest/v1/ai_plan_purchases?stripe_session_id=eq.${encodeURIComponent(sid)}` +
          `&status=in.(pending,awaiting_payment,paid)`,
        {
          method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({
            status: "failed",
            error: `async_payment_failed: ${s.payment_status ?? "unknown"}（${method ?? "unknown"}）`,
            // どの決済手段で落ちたかを残す（中国向け手段の失敗率を見るため）
            payment_method: method,
            updated_at: new Date().toISOString(),
          }),
        },
      ).catch((e) => console.error("async_payment_failed patch:", e));
      return json({ received: true, handled: event.type });
    }

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return json({ received: true, ignored: event.type });
    }
    const session = event.data?.object ?? {};

    /* 未払いのまま先に来た completed（＝Alipay / WeChat Pay の承認直後）。
       **ここでアカウントを発行してはいけない。** 入金待ちだと分かる形で台帳に残し、
       async_payment_succeeded を待つ。台帳に行が無ければ作る（metadataから復元）。 */
    if (session.payment_status !== "paid") {
      const sid: string = session.id ?? "";
      const waitPlanId: string = session.metadata?.plan_id ?? "";
      if (sid && waitPlanId) {
        const waitPatch = await fetch(
          `${supabaseUrl}/rest/v1/ai_plan_purchases?stripe_session_id=eq.${encodeURIComponent(sid)}` +
            `&status=eq.pending`,
          {
            method: "PATCH", headers: { ...dbHeaders, Prefer: "return=representation" },
            body: JSON.stringify({ status: "awaiting_payment", updated_at: new Date().toISOString() }),
          },
        ).catch(() => null);
        const patched = waitPatch?.ok ? await waitPatch.json().catch(() => []) : [];
        if (!Array.isArray(patched) || patched.length === 0) {
          // 台帳に行が無い（checkout関数を経由していない）ケースの復元。
          // 既に行がある（＝2回目の配信）なら on_conflict で何もしない
          const waitPlan = FUNCTION_PLAN_CATALOG.find((p) => p.id === waitPlanId);
          await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?on_conflict=stripe_session_id`, {
            method: "POST",
            headers: { ...dbHeaders, Prefer: "resolution=ignore-duplicates,return=minimal" },
            body: JSON.stringify({
              stripe_session_id: sid,
              plan_id: waitPlanId,
              plan_version: Number(session.metadata?.plan_version ?? waitPlan?.version ?? 0),
              amount_jpy: session.amount_total ?? waitPlan?.priceJpy ?? 0,
              currency: session.currency ?? "jpy",
              livemode: !!event.livemode,
              locale: session.metadata?.locale === "zh" ? "zh" : "ja",
              status: "awaiting_payment",
            }),
          }).catch((e) => console.error("awaiting_payment insert:", e));
        }
      }
      return json({ received: true, waiting: "payment" });
    }

    const sessionId: string = session.id;
    /**
     * 購入者の実メール。**これが取れないと初期パスワードが誰にも渡らない。**
     * customer_details → customer_email の順に見て、それでも空なら
     * customer_creation=always で作られた Customer から取り直す（2026-08-24）。
     */
    let buyerEmail: string | null =
      session.customer_details?.email ?? session.customer_email ?? null;
    if (!buyerEmail && typeof session.customer === "string" && session.customer) {
      try {
        const cRes = await fetch(`https://api.stripe.com/v1/customers/${session.customer}`, {
          headers: { Authorization: `Bearer ${stripeKey}` },
        });
        const c = cRes.ok ? await cRes.json() : null;
        if (typeof c?.email === "string" && c.email.includes("@")) buyerEmail = c.email;
      } catch (e) {
        console.error("customer lookup failed:", e instanceof Error ? e.message : "unknown");
      }
    }
    const locale: "ja" | "zh" = session.metadata?.locale === "zh" ? "zh" : "ja";
    const planId: string = session.metadata?.plan_id ?? "";
    const plan = FUNCTION_PLAN_CATALOG.find((p) => p.id === planId);
    if (!plan || !isSelfServePlan(plan)) {
      console.error("webhook: unknown/not-self-serve plan:", planId, sessionId);
      return json({ error: "unknown_plan" }, 400);
    }

    // ── 台帳の行を取得（無ければ metadata から復元して作る） ──
    const rowRes = await fetch(
      `${supabaseUrl}/rest/v1/ai_plan_purchases?stripe_session_id=eq.${encodeURIComponent(sessionId)}&select=*`,
      { headers: dbHeaders },
    );
    if (!rowRes.ok) return json({ error: "ledger_unavailable" }, 500);
    let row = (await rowRes.json())?.[0] ?? null;
    if (!row) {
      const ins = await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases`, {
        method: "POST",
        headers: { ...dbHeaders, Prefer: "return=representation" },
        body: JSON.stringify({
          stripe_session_id: sessionId,
          plan_id: plan.id,
          plan_version: Number(session.metadata?.plan_version ?? plan.version),
          amount_jpy: session.amount_total ?? plan.priceJpy,
          currency: session.currency ?? "jpy",
          livemode: !!event.livemode,
          locale,
          status: "pending",
        }),
      });
      if (!ins.ok) return json({ error: "ledger_insert_failed" }, 500);
      row = (await ins.json())?.[0];
    }

    // 冪等: 発行まで完了していれば何もしない（Stripeの再送・二重配信対策）
    if (row.status === "provisioned") return json({ received: true, already: true });

    // 金額・通貨の突き合わせ（セッション改ざん・カタログ改定タイミングのズレ検出）。
    // 通貨はAlipay/WeChat Payでも請求はJPYのまま（checkout関数がJPYで作る）＝ここは変わらない
    const currency = typeof session.currency === "string" ? session.currency.toLowerCase() : "jpy";
    const amountBad = typeof session.amount_total === "number" && session.amount_total !== plan.priceJpy;
    const currencyBad = currency !== "jpy";
    if (amountBad || currencyBad) {
      const reason = amountBad
        ? `amount mismatch: paid=${session.amount_total} catalog=${plan.priceJpy}`
        : `currency mismatch: paid=${currency} expected=jpy`;
      await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${row.id}`, {
        method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "failed", updated_at: new Date().toISOString(), error: reason,
        }),
      });
      console.error("webhook:", reason, sessionId);
      return json({ error: amountBad ? "amount_mismatch" : "currency_mismatch" }, 400); // 4xx=再送不要
    }

    const markFailed = async (msg: string) => {
      console.error("provision failed:", sessionId, msg);
      await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${row.id}`, {
        method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({ status: "failed", error: msg.slice(0, 800), updated_at: new Date().toISOString() }),
      }).catch(() => null);
    };

    // ── paid を記録 ──
    const paidPatch = await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${row.id}`, {
      method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "paid",
        stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : null,
        buyer_email: buyerEmail,
        livemode: !!event.livemode,
        // どの決済手段で買われたか（card / alipay / wechat_pay）。
        // 中国語話者がどれを使うかは集客の判断に直結するので必ず残す（2026-08-26）
        payment_method: Array.isArray(session.payment_method_types)
          ? session.payment_method_types[0] ?? null : null,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!paidPatch.ok) return json({ error: "ledger_update_failed" }, 500);

    // ── アカウントの用意 ──
    // 同じ購入者メールで過去に発行済みなら、そのアカウントを再利用（増殖させない・期間を延長）
    let userId: string | null = null;
    let loginId: string | null = null;
    let password: string | null = null;
    let reusedAccount = false;

    // ① ログイン中に買った場合（体験終了後のアップグレード等）は checkout が
    //    user_id を先に入れている。**購入時のメールが違っても学習記録のある本人に付ける**
    if (row.user_id) {
      const meRes = await fetch(
        `${supabaseUrl}/rest/v1/ai_plan_purchases?user_id=eq.${row.user_id}` +
          `&login_id=not.is.null&order=provisioned_at.desc&limit=1&select=login_id`,
        { headers: dbHeaders },
      );
      const me = meRes.ok ? (await meRes.json())?.[0] : null;
      userId = row.user_id;
      // 過去の購入で発行済みのIDがあればそれ。無ければ内部メールから復元する
      if (me?.login_id) {
        loginId = me.login_id;
      } else {
        const uRes = await authAdmin(`/admin/users/${row.user_id}`);
        const u = uRes.ok ? await uRes.json() : null;
        const email: string = u?.email ?? "";
        loginId = email.endsWith(`@${ID_DOMAIN}`) ? email.slice(0, -(`@${ID_DOMAIN}`.length)) : null;
      }
      reusedAccount = true;
    }

    // ② ログインしていない購入は、同じ購入者メールの過去実績からアカウントを再利用する
    if (!userId && buyerEmail) {
      const prevRes = await fetch(
        `${supabaseUrl}/rest/v1/ai_plan_purchases?buyer_email=eq.${encodeURIComponent(buyerEmail)}` +
          `&status=eq.provisioned&user_id=not.is.null&order=provisioned_at.desc&limit=1&select=user_id,login_id`,
        { headers: dbHeaders },
      );
      const prev = prevRes.ok ? (await prevRes.json())?.[0] : null;
      if (prev?.user_id && prev?.login_id) {
        userId = prev.user_id;
        loginId = prev.login_id;
        reusedAccount = true;
      }
    }

    /**
     * ③ **購入者メールが取れない新規購入は、アカウントを発行しないで止める**（2026-08-24）。
     *
     * 初期パスワードは購入者メールにしか届かない。従来はメールが無くてもアカウントを
     * 作っており、**誰もログインできないアカウントだけが残り、パスワードは
     * 生成された直後に捨てられていた**（後から助けるにも作り直しが要る）。
     * 何も作らずに critical アラートを立てておけば、CEOがStripe側の Customer に
     * メールアドレスを入れてからイベントを再送信するだけで、同じ処理がやり直せる
     * （この関数は Customer からもメールを読むので、副作用ゼロで復旧できる）。
     *
     * 既存アカウントを引き継ぐ購入（reusedAccount）はパスワードが既に本人の手元に
     * あるので止めない。領収の案内が出せないだけなので警告に留める。
     */
    if (!userId && !buyerEmail) {
      await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${row.id}`, {
        method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({
          error: "no_buyer_email: アカウント発行を保留しました（連絡先が取得できないため）",
          updated_at: new Date().toISOString(),
        }),
      }).catch(() => null);
      await raiseAlert(supabaseUrl, dbHeaders, {
        dedupeKey: `provision_held_no_email:${sessionId}`,
        kind: "provision_held_no_email",
        severity: "critical",
        title: "連絡先が取れず、アカウント発行を保留しました",
        detail: [
          `プラン: ${plan.id}`,
          "購入は成立しているがメールアドレスが取得できなかったため、アカウントを作っていません",
          "対応: Stripe管理画面で購入者を特定 → Customer にメールアドレスを登録 → 該当イベントを再送信すると自動発行がやり直される。連絡先が分からなければ返金する",
        ].join(" / "),
      });
      if (resendKey) {
        const tag = event.livemode ? "" : "[TEST]";
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: MAIL_FROM, to: [ADMIN_EMAIL],
            subject: `🚨${tag}【要対応・AIコース購入】連絡先が取れずアカウント発行を保留（${plan.nameJa}）`,
            text: [
              "購入は成立していますが、購入者のメールアドレスが取得できませんでした。",
              "**アカウントは作っていません**（誰もログインできないアカウントを残さないため）。",
              "",
              `プラン: ${plan.nameJa} / ${plan.priceJpy}円 / livemode: ${event.livemode}`,
              `session: ${sessionId}`,
              "",
              "対応手順:",
              "1. Stripe管理画面 → 支払い → 該当セッションを開き、購入者の連絡先を確認",
              "2. 連絡先が分かる → Stripe の該当イベントで「イベントを再送信」（自動発行がやり直される）",
              "3. 分からない → Stripe から返金する",
            ].join("\n"),
          }),
        }).catch((e) => console.error("hold mail failed:", e));
      }
      // 200で返す（Stripeに再送させても状況は変わらない）。台帳は paid のまま＝
      // 監視の provision_stuck でも拾われ続ける
      return json({ received: true, held: "no_buyer_email" });
    }

    if (!userId) {
      loginId = await loginIdFor(sessionId);
      const internalEmail = `${loginId}@${ID_DOMAIN}`;
      password = generatePassword();
      const createRes = await authAdmin("/admin/users", {
        method: "POST",
        body: JSON.stringify({
          email: internalEmail, password, email_confirm: true,
          user_metadata: {
            login_id: loginId, buyer_email: buyerEmail,
            provisioned_by: "ai-course-stripe-webhook",
            purchase_session: sessionId, provisioned_at: new Date().toISOString(),
          },
        }),
      });
      if (createRes.ok) {
        userId = (await createRes.json()).id;
      } else if (createRes.status === 422) {
        // 前回の試行でユーザーだけ作れていた（冪等リトライ）。取得してパスワードを揃える
        const listRes = await authAdmin(`/admin/users?page=1&per_page=1&filter=${encodeURIComponent(internalEmail)}`);
        const listed = listRes.ok ? await listRes.json() : { users: [] };
        const existing = (listed.users ?? []).find((u: { email?: string }) => u.email === internalEmail);
        if (!existing) { await markFailed(`user create 422 but not found: ${internalEmail}`); return json({ error: "provision_failed" }, 500); }
        userId = existing.id;
        const resetRes = await authAdmin(`/admin/users/${userId}`, {
          method: "PUT", body: JSON.stringify({ password }),
        });
        if (!resetRes.ok) { await markFailed(`password reset failed: ${resetRes.status}`); return json({ error: "provision_failed" }, 500); }
      } else {
        await markFailed(`user create failed: ${createRes.status} ${await createRes.text()}`);
        return json({ error: "provision_failed" }, 500);
      }

      // learner作成のRLS（ai_learners_insert）は signup_grants の行を要求する（発行スクリプトと同じ）
      const grantRes = await fetch(
        `${supabaseUrl}/rest/v1/ai_course_signup_grants?on_conflict=email`,
        {
          method: "POST",
          headers: { ...dbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({
            email: internalEmail, invite_id: null,
            expires_at: new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString(),
            is_test: false, consumed_at: null,
          }),
        },
      );
      if (!grantRes.ok) { await markFailed(`signup grant failed: ${grantRes.status} ${await grantRes.text()}`); return json({ error: "provision_failed" }, 500); }
    }

    /* ── 受講権（ai_course_access）──────────────────────────────
       **アプリ側で read-modify-write しない。** DB の ai_grant_purchase_access が
       1トランザクションで次をやる（migration 20260824140000）:
         1. 同じ purchase_id の再実行なら何もしない（Webhook再送・同時配信で二重延長しない）
         2. 期間は必ず延長: greatest(現在の valid_until, now) + accessDays
            （旧実装は now+accessDays の上書きで、残り20日ある人が1か月プランを
              買い足すと 50日 ではなく 30日になっていた）
         3. いま有効な受講権のほうが強ければ**格下げ**として期間だけ足し、
            plan_id / trial_window_minutes / ai_seconds_limit / purchase_id は据え置く
            （10万円の6か月コース受講中に600円の体験パスを買っても権利が消えない）
       ─────────────────────────────────────────────────────── */
    const grantRpc = await fetch(`${supabaseUrl}/rest/v1/rpc/ai_grant_purchase_access`, {
      method: "POST", headers: dbHeaders,
      body: JSON.stringify({
        p_user_id: userId,
        p_purchase_id: row.id,
        p_plan_id: plan.id,
        p_plan_version: plan.version,
        p_access_days: plan.accessDays ?? 30,
        p_ai_seconds_limit: plan.aiMinutes !== null ? plan.aiMinutes * 60 : null,
        // リアルタイム体験（開始ボタンから実時間◯分）。開始前は valid_until が開始期限
        p_trial_window_minutes: plan.realtimeWindowMinutes,
        p_note: `購入自動発行: ${plan.nameJa}（${sessionId.slice(0, 20)}…）`,
      }),
    });
    if (!grantRpc.ok) {
      await markFailed(`access grant failed: ${grantRpc.status} ${await grantRpc.text()}`);
      return json({ error: "provision_failed" }, 500);
    }
    const grant = await grantRpc.json().catch(() => null);
    if (!grant?.ok) {
      await markFailed(`access grant rejected: ${grant?.code ?? "unknown"}`);
      return json({ error: "provision_failed" }, 500);
    }
    // メールに書く期限は**DBが返した実際の値**を使う（画面と文面と実体をずらさない）。
    // 取れなかったときは日付を書かない（推測した日付を送るほうが害が大きい）
    const validUntilISO: string | null =
      typeof grant.validUntil === "string" ? grant.validUntil : null;

    /* 格下げガードが働いた購入は人が見ておく。
       「上位プランを持っている人が下位プランを買った」＝返金や案内の判断が要る場面。
       権利は守られている（＝critical ではない）が、黙って流さない。 */
    if (grant.downgradeGuarded) {
      await raiseAlert(supabaseUrl, dbHeaders, {
        dedupeKey: `plan_downgrade_guarded:${sessionId}`,
        kind: "plan_downgrade_guarded",
        severity: "warning",
        title: "上位の受講権を持つ人が下位プランを購入しました",
        detail: [
          `購入プラン: ${plan.id}`,
          `既存の受講権: ${grant.planId ?? "手動発行（プラン紐づけなし）"}`,
          "既存の権利は維持し、利用期間だけ延長しました（プラン内容は上書きしていません）",
          "対応: 意図した購入か確認し、必要なら返金・案内をしてください",
        ].join(" / "),
      });
    }

    /* ── 体験の長さ（trial_days）──────────────────────────────
       2026-08-26 から体験は日数制（7日）。60分では**翌日の復習＝商品の中心**を
       体験できなかったため（migration 20260826150000_ai_trial_seven_days）。

       RPC ai_grant_purchase_access は trial_days を引数に持たない（20260824140000 の
       時点でこの列が無かった）ので、発行のあとにこの1列だけ書く。
       ここが書かれないと ai_start_trial が trial_window_minutes へフォールバックし、
       **購入メールには「7日間」と書いてあるのに60分で切れる**という食い違いになる。

       - 格下げガードが働いた購入では書かない（上位の受講権の属性を触らない）
       - `trial_started_at is null` の行だけを対象にする（進行中の体験を伸縮させない）
       - 体験以外のプランでは null を書いて、前の体験の残りかすを消す
       - 冪等。Webhook再送で `already` が返ったときも、初回が途中で落ちていた場合に
         ここで直るよう、あえて実行する
       - 失敗しても発行そのものは成功しているので落とさない。人が直せるよう通知する */
    if (!grant.downgradeGuarded) {
      const trialRes = await fetch(
        `${supabaseUrl}/rest/v1/ai_course_access?user_id=eq.${userId}&trial_started_at=is.null`,
        {
          method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ trial_days: plan.trialDays ?? null, updated_at: new Date().toISOString() }),
        },
      ).catch((e) => { console.error("trial_days patch:", e); return null; });
      if (!trialRes || !trialRes.ok) {
        console.error("trial_days patch failed:", trialRes ? `${trialRes.status} ${await trialRes.text()}` : "network");
        if (plan.trialDays !== null) {
          await raiseAlert(supabaseUrl, dbHeaders, {
            dedupeKey: `trial_days_write_failed:${sessionId}`,
            kind: "trial_days_write_failed",
            severity: "warning",
            title: "体験の日数（trial_days）を書けませんでした",
            detail: [
              `購入プラン: ${plan.id}（体験${plan.trialDays}日）`,
              "受講権の発行そのものは成功しています",
              `影響: このまま「体験を始める」を押すと ${plan.realtimeWindowMinutes ?? "?"}分で切れます（メールの案内と食い違う）`,
              "対応: 管理画面の受講権タブで trial_days を設定してください",
            ].join(" / "),
          });
        }
      }
    }

    // ── 台帳を provisioned に ──
    const doneRes = await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${row.id}`, {
      method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "provisioned", user_id: userId, login_id: loginId,
        provisioned_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null,
      }),
    });
    if (!doneRes.ok) { await markFailed(`final update failed: ${doneRes.status}`); return json({ error: "provision_failed" }, 500); }

    // ── メール送信（購入者＋管理者コピー）。ここで落ちても発行済みなので 200 を返し、
    //    管理者通知の失敗だけなら再送で二重発行しないようにする（メール失敗はログへ） ──
    /**
     * 購入者への案内メール。**ここが届かないと初期パスワードが誰にも渡らない**
     * （アカウントは発行済みになる）ので、失敗を握りつぶさず運用アラートへ上げる（2026-08-23 監査P0）。
     */
    let mailDelivered = false;
    let mailProblem: string | null = null;
    if (resendKey && buyerEmail) {
      const mail = buyerMail({ locale, plan, validUntilISO, loginId: loginId!, password, reusedAccount });
      const sendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: MAIL_FROM, to: [buyerEmail], reply_to: ADMIN_EMAIL,
          subject: mail.subject, text: mail.text,
        }),
      });
      mailDelivered = sendRes.ok;
      if (!sendRes.ok) {
        mailProblem = `send_failed_${sendRes.status}`;
        console.error("buyer mail failed:", sendRes.status, await sendRes.text());
      }
    } else if (!buyerEmail) {
      mailProblem = "no_buyer_email";
      console.error("no buyer email on session:", sessionId);
    } else {
      mailProblem = "resend_key_missing";
      console.error("resend key missing; buyer mail not sent:", sessionId);
    }

    if (mailProblem) {
      await raiseAlert(supabaseUrl, dbHeaders, {
        dedupeKey: `login_mail_undelivered:${sessionId}`,
        kind: "login_mail_undelivered",
        severity: "critical",
        title: "購入者にログイン情報が届いていない可能性",
        detail: [
          `理由: ${mailProblem}`,
          `ログインID: ${loginId ?? "(未発行)"}`,
          `プラン: ${plan.id}`,
          reusedAccount ? "既存アカウントの期間延長" : "新規アカウント発行",
          "対応: 管理画面の購入台帳から購入者を特定し、ログインIDと初期パスワードを個別に案内してください。",
        ].join(" / "),
      });
    }

    if (resendKey) {
      const tag = event.livemode ? "" : "[TEST]";
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: MAIL_FROM, to: [ADMIN_EMAIL],
          subject: mailProblem
            ? `🚨${tag}【要対応・AIコース購入】ログイン情報が届いていない可能性（${plan.nameJa}）`
            : `💴${tag}【AIコース購入】${plan.nameJa} ${plan.priceJpy}円`,
          text: [
            `プラン: ${plan.nameJa}（v${plan.version}）`,
            `金額: ${plan.priceJpy}円 / livemode: ${event.livemode}`,
            `購入者: ${buyerEmail ?? "(メール不明)"}`,
            `案内メール: ${mailDelivered ? "送信済み" : `未送信（${mailProblem}）→ 個別に連絡が必要`}`,
            `ログインID: ${loginId}${reusedAccount ? "（既存アカウント再利用・期間延長）" : "（新規発行）"}`,
            `利用期限: ${jstDate(validUntilISO)}`,
            `session: ${sessionId}`,
            "",
            "台帳: 管理画面（受講権タブ）または ai_admin_list_purchases() で確認できます。",
          ].join("\n"),
        }),
      }).catch((e) => console.error("admin mail failed:", e));
    }

    return json({ received: true, provisioned: true });
  } catch (e) {
    console.error("ai-course-stripe-webhook error:", e);
    return json({ error: "internal" }, 500);
  }
});
