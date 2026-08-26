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
// - ログインIDは session_id から決定的に導出（再試行で二重アカウントを作らない）。
//   既にユーザーが存在したらパスワードを再設定して続行（メールの初期PWを常に有効にする）
// - 同じ購入者メールの2回目以降の購入は、前回発行したアカウントを再利用して期間を延長
//   （パスワードは変更しない。アカウントが人ごとに増殖しない）
// - 途中で失敗したら status='failed'＋error を記録して 500 を返す（Stripeが再送→再開）
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

const jstDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "numeric", day: "numeric" });

/* ── 購入者向けメール本文 ── */
const buyerMail = (input: {
  locale: "ja" | "zh"; plan: FunctionPlan; validUntilISO: string;
  loginId: string; password: string | null; reusedAccount: boolean;
}): { subject: string; text: string } => {
  const { locale, plan, loginId, password, reusedAccount } = input;
  const until = jstDate(input.validUntilISO);
  const ja = locale === "ja";
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

      if (fullyRefunded) {
        await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${target.id}`, {
          method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
          body: JSON.stringify({ status: "refunded", updated_at: new Date().toISOString() }),
        });
        // この購入で付与した受講権だけを即時終了（学習記録には触れない）
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
              "",
              "学習記録は消していません。復活させる場合は管理画面の受講権タブで期間を設定してください。",
            ].join("\n"),
          }),
        }).catch((e) => console.error("refund mail failed:", e));
      }
      return json({ received: true, handled: event.type, revoked: fullyRefunded });
    }

    /* ── 非同期決済の失敗（2026-08-26 追加）───────────────────────
       Alipay / WeChat Pay は決済確定が遅れることがあり、失敗もあとから来る。
       これを無視していると台帳が pending のまま残り、
       購入者から見ると「払えたのか分からない」状態が続く。
       台帳を failed にして、決済完了ページが「完了していません」と言い切れるようにする。
       **受講権は発行していない**ので取り消すものは無い（誤って権利を消さない）。 */
    if (event.type === "checkout.session.async_payment_failed") {
      const s = event.data?.object ?? {};
      if (typeof s.id === "string") {
        await fetch(
          `${supabaseUrl}/rest/v1/ai_plan_purchases?stripe_session_id=eq.${encodeURIComponent(s.id)}&status=in.(pending,paid)`,
          {
            method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
            body: JSON.stringify({
              status: "failed",
              error: `async_payment_failed（${s.payment_method_types?.[0] ?? "unknown"}）`,
              payment_method: Array.isArray(s.payment_method_types) ? s.payment_method_types[0] ?? null : null,
              updated_at: new Date().toISOString(),
            }),
          },
        ).catch((e) => console.error("async fail patch:", e));
      }
      return json({ received: true, handled: event.type });
    }

    if (
      event.type !== "checkout.session.completed" &&
      event.type !== "checkout.session.async_payment_succeeded"
    ) {
      return json({ received: true, ignored: event.type });
    }
    const session = event.data?.object ?? {};
    if (session.payment_status !== "paid") return json({ received: true, waiting: "payment" });

    const sessionId: string = session.id;
    const buyerEmail: string | null = session.customer_details?.email ?? session.customer_email ?? null;
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

    // 金額の突き合わせ（セッション改ざん・カタログ改定タイミングのズレ検出）
    if (typeof session.amount_total === "number" && session.amount_total !== plan.priceJpy) {
      await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases?id=eq.${row.id}`, {
        method: "PATCH", headers: { ...dbHeaders, Prefer: "return=minimal" },
        body: JSON.stringify({
          status: "failed", updated_at: new Date().toISOString(),
          error: `amount mismatch: paid=${session.amount_total} catalog=${plan.priceJpy}`,
        }),
      });
      console.error("webhook: amount mismatch", sessionId, session.amount_total, plan.priceJpy);
      return json({ error: "amount_mismatch" }, 400); // 4xx=再送不要。failed行を人が確認する
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

    // ── 受講権（ai_course_access）。購入日から accessDays 日間・商品ひも付き ──
    const now = new Date();
    const validUntilISO = new Date(now.getTime() + (plan.accessDays ?? 30) * 24 * 3600 * 1000).toISOString();
    const accessRes = await fetch(
      `${supabaseUrl}/rest/v1/ai_course_access?on_conflict=user_id`,
      {
        method: "POST",
        headers: { ...dbHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          user_id: userId,
          valid_from: now.toISOString(),
          valid_until: validUntilISO,
          note: `購入自動発行: ${plan.nameJa}（${sessionId.slice(0, 20)}…）`,
          granted_by: "ai-course-stripe-webhook",
          plan_id: plan.id,
          plan_version: plan.version,
          source: "purchase",
          ai_seconds_limit: plan.aiMinutes !== null ? plan.aiMinutes * 60 : null,
          // 体験の長さ。開始前は valid_until=購入+30日が「開始の期限」で、
          // 「体験を始める」を押した時点で valid_until が 開始+日数（旧仕様は+分数）に書き換わる。
          // 2026-08-26 から日数制（7日）。60分では翌日の復習＝商品の中心を体験できなかった
          trial_days: plan.trialDays,
          trial_window_minutes: plan.realtimeWindowMinutes,
          trial_started_at: null,
          purchase_id: row.id,
          updated_at: now.toISOString(),
        }),
      },
    );
    if (!accessRes.ok) { await markFailed(`access upsert failed: ${accessRes.status} ${await accessRes.text()}`); return json({ error: "provision_failed" }, 500); }

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
