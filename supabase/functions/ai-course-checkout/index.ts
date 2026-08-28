// AIコース セルフサービス決済: Stripe Checkout セッション作成。
//
// 対象は**人間レッスンを含まない商品だけ**（AI体験パス600円・1か月AI自学プラン2,980円）。
// 6か月コース（10万円）は isSelfServePlan がサーバー側で拒否する＝無断のオンライン決済を
// 構造的に不可能にする（金額はクライアントから受け取らず、生成カタログから読む）。
//
// モードの安全装置:
// - AI_COURSE_CHECKOUT_MODE（'test' | 'live'）と鍵の接頭辞（sk_test_ / sk_live_）が
//   一致しないと起動しない（テストのつもりで実課金、を構造的に防ぐ）
// - 未設定なら 503（LP側は apply フォームへフォールバック済みなので実害なし）
//
// 決済手段（2026-08-24 点検・**結論: このファイルは触らない**）:
// - 使える決済手段を**このコードで列挙しない**。Stripeダッシュボードで有効なもののうち、
//   通貨（JPY）・金額・国に合うものだけが自動でCheckoutに出る。中国向けの決済手段を
//   CEOがダッシュボードで有効化すれば、**このファイルを1行も変えずに**増える
// - 逆に、ここで手段を列挙すると**書いていない手段が消える**（Link決済が消えた事故が
//   2026-08 にあった）。src/pages/ai-lesson/landing/paymentMethodsNote.test.tsx が
//   機械で止めている。承認が下りても、まずはダッシュボード側だけで足すこと
// - 承認が要る決済手段は**非同期決済**（承認 → あとで入金確定）。success_url へ戻った
//   時点ではまだ入金が確定していないことがある。アカウント発行の判断は必ず Webhook 側の
//   session.payment_status で行う（この関数は発行に関与しない）
//
// デプロイ（CEO承認後）:
//   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy \
//     ai-course-checkout --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { FUNCTION_PLAN_CATALOG, isSelfServePlan } from "../_shared/aiCoursePlans.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** 戻り先URLに使ってよいオリジン（それ以外は kawabado.com へ倒す） */
const ORIGIN_ALLOW = [
  /^https:\/\/kawabado\.com$/,
  /^https:\/\/www\.kawabado\.com$/,
  /^https:\/\/study\.kawabado\.com$/,
  /^https:\/\/[a-z0-9-]+\.badminton-platform\.pages\.dev$/,
  /^http:\/\/localhost:\d+$/,
];

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status,
    });

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    // ── モードと鍵の整合性（実課金事故の防止） ──
    // 鍵は AI_COURSE_STRIPE_SECRET_KEY を優先し、無ければ大会決済と同じ
    // STRIPE_SECRET_KEY（本番キー・設定済み）を共用する（CEO決定 2026-08-19。
    // 鍵を分けたくなったら AI_COURSE_STRIPE_SECRET_KEY を設定すれば上書きされる）
    const mode = Deno.env.get("AI_COURSE_CHECKOUT_MODE") ?? "";
    const stripeKey = Deno.env.get("AI_COURSE_STRIPE_SECRET_KEY") ?? Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    if (mode !== "test" && mode !== "live") return json({ error: "checkout_not_ready" }, 503);
    if (!stripeKey) return json({ error: "checkout_not_ready" }, 503);
    if (mode === "test" && !stripeKey.startsWith("sk_test_")) {
      return json({ error: "checkout_misconfigured" }, 503);
    }
    if (mode === "live" && !stripeKey.startsWith("sk_live_")) {
      return json({ error: "checkout_misconfigured" }, 503);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const dbHeaders = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    const body = await req.json().catch(() => ({}));
    const planId = typeof body.planId === "string" ? body.planId : "";
    const locale = body.locale === "zh" ? "zh" : "ja";

    /**
     * ログイン中の購入（体験終了後のアップグレード等）なら、**そのアカウントへ紐づける**。
     * Authorization の access token を Supabase に検証させて user_id を得る（自己申告は信じない）。
     * これで購入時に別のメールアドレスを使っても、学習記録のあるアカウントの期間が伸びる。
     */
    let attachUserId: string | null = null;
    const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (bearer) {
      const who = await fetch(`${Deno.env.get("SUPABASE_URL")!}/auth/v1/user`, {
        headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", Authorization: `Bearer ${bearer}` },
      });
      if (who.ok) {
        const u = await who.json().catch(() => null);
        if (u?.id) attachUserId = u.id as string;
      }
    }
    // UTM（流入元）。個人情報は受け取らない。キーを固定して余計な値を保存しない
    const utm: Record<string, string> = {};
    if (body.utm && typeof body.utm === "object") {
      // ref = 紹介コード（2026-08-23）。utm と同じ入れ物で受けて台帳の utm 列へ入れる
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref"]) {
        const v = (body.utm as Record<string, unknown>)[k];
        if (typeof v === "string" && v.length <= 200) utm[k] = v;
      }
    }
    /*
     * 購入したブラウザの匿名ID（2026-08-26 Phase S1）。
     * ai_attribution へ join して「どこから来た人が買ったか」を出すためだけに使う。
     * 個人を指すものではない。形が違えば黙って捨てる（決済は止めない）。
     */
    const anonId = typeof body.anonId === "string"
      && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(body.anonId)
      ? body.anonId : null;

    // ── 商品検証（金額はサーバー側カタログから。クライアントの金額は信じない） ──
    const plan = FUNCTION_PLAN_CATALOG.find((p) => p.id === planId);
    if (!plan) return json({ error: "unknown_plan" }, 400);
    if (!isSelfServePlan(plan)) return json({ error: "plan_not_self_serve" }, 400);

    // ── 台帳の存在確認（migration未適用なら受け付けない。孤児セッションを作らない） ──
    const probe = await fetch(
      `${supabaseUrl}/rest/v1/ai_plan_purchases?select=id&limit=0`,
      { headers: dbHeaders },
    );
    if (!probe.ok) return json({ error: "checkout_not_ready" }, 503);

    // ── 戻り先URL（Originを許可リストで検証） ──
    const reqOrigin = req.headers.get("origin") ?? "";
    const origin = ORIGIN_ALLOW.some((re) => re.test(reqOrigin)) ? reqOrigin : "https://kawabado.com";
    const successUrl = `${origin}/${locale}/ai-course/purchase/complete?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${origin}/${locale}/ai-course?checkout=cancelled#price`;

    // ── Stripe Checkout セッション作成 ──
    const name = locale === "zh" ? plan.nameZh : plan.nameJa;
    const duration = locale === "zh" ? plan.durationLabelZh : plan.durationLabelJa;
    const params = new URLSearchParams({
      mode: "payment",
      locale: locale === "zh" ? "zh" : "ja",
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "jpy",
      "line_items[0][price_data][unit_amount]": String(plan.priceJpy),
      "line_items[0][price_data][product_data][name]": name,
      "line_items[0][price_data][product_data][description]": duration,
      "metadata[plan_id]": plan.id,
      "metadata[plan_version]": String(plan.version),
      "metadata[locale]": locale,
      "payment_intent_data[description]": `AI日本語コース ${plan.nameJa}`,
      /*
        放棄カートの回収（2026-08-20）。
        決済ページまで来て離脱した人に、Stripeから「続きから再開する」リンク付きメールが届く。
        実測で「決済ページを開いたが未完了」は完了より多かった＝ここを拾えないと取りこぼす。
        ⚠️ 送信の実行はStripeダッシュボード側の設定（設定→請求→カスタマーメール）に従う。
           このパラメーターは回収URLを有効にするもの。割引は付けない（値引きの自動配布はしない）
      */
      "after_expiration[recovery][enabled]": "true",
      "after_expiration[recovery][allow_promotion_codes]": "false",
      /*
        購入者メールを確実に残す（2026-08-23 監査P0）。
        初期パスワードはメールでしか届かないので、メールが取れないと
        「支払ったのにログインできない」人が出る（アカウントは発行済みになる）。
        customer_creation=always にすると Stripe が Customer を作り、
        session.customer_details.email が欠けにくくなる。
        ※ Checkout は payment モードでメール欄を必ず出すが、Link 等の経路で
          customer が既にある場合に details が薄くなることがあるための保険。
      */
      customer_creation: "always",
    });
    const stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const session = await stripeRes.json();
    if (!stripeRes.ok || !session?.id || !session?.url) {
      console.error("stripe session create failed:", JSON.stringify(session?.error ?? session));
      return json({ error: "stripe_error" }, 502);
    }

    // ── 台帳へ pending 行を記録（webhook が metadata からも復元できるが、UTMはここでしか取れない） ──
    const insRes = await fetch(`${supabaseUrl}/rest/v1/ai_plan_purchases`, {
      method: "POST",
      headers: { ...dbHeaders, Prefer: "return=minimal" },
      body: JSON.stringify({
        stripe_session_id: session.id,
        plan_id: plan.id,
        plan_version: plan.version,
        amount_jpy: plan.priceJpy,
        currency: "jpy",
        livemode: mode === "live",
        locale,
        status: "pending",
        // ログイン中の購入なら発行先アカウントを先に決めておく（webhookはこれを最優先で使う）
        user_id: attachUserId,
        utm: Object.keys(utm).length > 0 ? utm : null,
        anon_id: anonId,
        // 流入元は購入時点の値を焼き付ける（あとで台帳が更新されても売上の出どころは動かない）
        attribution_source: utm.utm_source ?? null,
        attribution_campaign: utm.utm_campaign ?? null,
      }),
    });
    if (!insRes.ok) {
      // 台帳に書けないなら受け付けない（決済だけ通って記録が無い、が最悪）。セッションを失効させる
      console.error("purchase insert failed:", insRes.status, await insRes.text());
      await fetch(`https://api.stripe.com/v1/checkout/sessions/${session.id}/expire`, {
        method: "POST",
        headers: { Authorization: `Bearer ${stripeKey}` },
      }).catch(() => null);
      return json({ error: "ledger_error" }, 500);
    }

    return json({ url: session.url });
  } catch (e) {
    console.error("ai-course-checkout error:", e);
    return json({ error: "internal" }, 500);
  }
});
