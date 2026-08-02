// AIコース セルフサービス決済（**Stripe test mode 専用**）。
//
// ⚠️ **未デプロイ**。staging と production は同じ Supabase プロジェクトを共有しているため、
//    Edge Function のデプロイ = production へのデプロイ。CEO 承認なしには実行しない。
//
// 役割:
//   action=create  … 支払いを開始する。**金額は planId からサーバーが引く**
//   action=confirm … Stripe に問い合わせて結果を確認し、成功なら利用権を自動で付与する
//
// 3つの防波堤:
//   1. `sk_test_` 以外の秘密鍵では**起動しない**（本番課金の事故を鍵の形で止める）
//   2. 金額はクライアントから受け取らない（1円で60分パスを買われない）
//   3. 付与は purchase_id の一意制約でべき等（Webhook再送・二重送信で増えない）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import PLAN_CATALOG from '../_shared/planCatalog.json' with { type: 'json' };

interface ServerPlan {
  planId: string;
  status: string;
  ctaMode: string;
  priceAmount: number;
  currency: string;
  planVersion: number;
  includedActiveMinutes: number | null;
  validityDays: number;
  durationDays: number;
  voiceMinutesCap: number;
  aiReportCap: number;
}

const PLANS = PLAN_CATALOG as ServerPlan[];
const DAY_MS = 86_400_000;
const FEE_RATE = 0.036;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** ★ test 鍵でなければ、この関数は何もしない */
const stripeTestKey = (): string | null => {
  const key = Deno.env.get('STRIPE_TEST_SECRET_KEY') ?? '';
  return key.startsWith('sk_test_') ? key : null;
};

const stripe = async (key: string, path: string, form?: Record<string, string>) => {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: form ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  return { ok: res.ok, body: await res.json() };
};

const admin = () =>
  createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );

const plausibleEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const key = stripeTestKey();
  if (!key) {
    // 本番鍵や未設定では決済経路そのものを開かない
    return json({ error: 'checkout_disabled', reason: 'test_key_required' }, 503);
  }

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: 'bad_request' }, 400); }

  const action = String(payload.action ?? '');
  const db = admin();

  // ── 支払いを開始する ──────────────────────────────
  if (action === 'create') {
    const orderId = String(payload.orderId ?? '').slice(0, 64);
    const planId = String(payload.planId ?? '');
    const email = String(payload.email ?? '').trim();
    const lang = payload.lang === 'zh' ? 'zh' : 'ja';
    const termsVersion = String(payload.termsVersion ?? '');

    const plan = PLANS.find((p) => p.planId === planId);
    if (!orderId) return json({ error: 'order_id_required' }, 400);
    if (!plan) return json({ error: 'unknown_plan' }, 400);
    if (plan.status !== 'published') return json({ error: 'plan_not_purchasable' }, 400);
    if (plan.ctaMode !== 'checkout') return json({ error: 'consultation_only' }, 400);
    if (!plausibleEmail(email)) return json({ error: 'invalid_email' }, 400);
    if (!termsVersion) return json({ error: 'terms_not_accepted' }, 400);

    // 同じ注文が既にあれば作り直さない（べき等）
    const { data: existing } = await db.from('ai_plan_purchases')
      .select('*').eq('order_id', orderId).maybeSingle();
    if (existing && existing.status !== 'failed' && existing.reference) {
      return json({ reference: existing.reference, alreadyStarted: true });
    }

    // ★ 金額は plan から。payload の金額は一切見ない
    const intent = await stripe(key, 'payment_intents', {
      amount: String(plan.priceAmount),
      currency: 'jpy',
      'metadata[order_id]': orderId,
      'metadata[plan_id]': plan.planId,
      'automatic_payment_methods[enabled]': 'true',
    });
    if (!intent.ok) return json({ error: 'gateway_error' }, 502);

    await db.from('ai_plan_purchases').upsert({
      order_id: orderId,
      plan_id: plan.planId,
      plan_version: plan.planVersion,
      amount: plan.priceAmount,
      currency: 'JPY',
      email,
      lang,
      terms_version: termsVersion,
      gateway_id: 'stripe-test',
      reference: intent.body.id,
      status: 'created',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'order_id' });

    return json({ reference: intent.body.id, clientSecret: intent.body.client_secret });
  }

  // ── 結果を確認し、成功なら利用権を付ける ──────────
  if (action === 'confirm') {
    const reference = String(payload.reference ?? '');
    if (!reference) return json({ error: 'reference_required' }, 400);

    const { data: purchase } = await db.from('ai_plan_purchases')
      .select('*').eq('reference', reference).maybeSingle();
    if (!purchase) return json({ error: 'unknown_order' }, 404);
    if (purchase.status === 'granted') {
      return json({ status: 'succeeded', paidAmount: purchase.paid_amount, feeAmount: purchase.fee_amount, alreadyGranted: true });
    }

    // ★ Stripe に問い合わせる。クライアントの「成功しました」は使わない
    const pi = await stripe(key, `payment_intents/${reference}`);
    if (!pi.ok) return json({ error: 'gateway_error' }, 502);

    const st = String(pi.body.status ?? '');
    if (st !== 'succeeded') {
      const pending = st === 'processing' || st === 'requires_action' || st === 'requires_confirmation';
      if (pending) return json({ status: 'pending', paidAmount: 0, feeAmount: 0 });
      await db.from('ai_plan_purchases').update({
        status: 'failed',
        failure_code: pi.body.last_payment_error?.code ?? 'processing_error',
        updated_at: new Date().toISOString(),
      }).eq('order_id', purchase.order_id);
      return json({ status: 'failed', paidAmount: 0, feeAmount: 0, failureCode: pi.body.last_payment_error?.code ?? 'processing_error' });
    }

    const paidAmount = Number(pi.body.amount_received ?? 0);
    // ★ 金額の一致確認。違えば付与しない
    if (paidAmount !== purchase.amount) {
      await db.from('ai_plan_purchases').update({
        status: 'failed', failure_code: 'amount_mismatch',
        paid_amount: paidAmount, updated_at: new Date().toISOString(),
      }).eq('order_id', purchase.order_id);
      return json({ status: 'failed', paidAmount, feeAmount: 0, failureCode: 'amount_mismatch' });
    }

    // アカウントの接続。既にあれば作らない（再購入で進捗が切れない・§11）
    let learnerId: string | null = purchase.learner_id;
    if (!learnerId) {
      const { data: found } = await db.from('ai_learners')
        .select('id').eq('email', purchase.email).maybeSingle();
      learnerId = found?.id ?? null;
      if (!learnerId) {
        const { data: created, error } = await db.from('ai_learners')
          .insert({ email: purchase.email, display_name: '' }).select('id').single();
        if (error) return json({ error: 'learner_create_failed' }, 500);
        learnerId = created.id;
      }
    }

    const plan = PLANS.find((p) => p.planId === purchase.plan_id);
    if (!plan) return json({ error: 'unknown_plan' }, 500);
    const now = Date.now();
    const feeAmount = Math.round(paidAmount * FEE_RATE);

    // 一意制約（purchase_id）が二重付与の最終防波堤。既にあれば無視される
    await db.from('ai_plan_entitlements').upsert({
      id: `ent_${purchase.order_id}`,
      learner_id: learnerId,
      plan_id: plan.planId,
      plan_version: plan.planVersion,
      purchase_id: purchase.order_id,
      granted_at: new Date(now).toISOString(),
      expires_at: new Date(now + Math.max(plan.validityDays, 1) * DAY_MS).toISOString(),
      active_seconds: plan.includedActiveMinutes === null ? null : plan.includedActiveMinutes * 60,
      voice_seconds: plan.voiceMinutesCap * 60,
      ai_reports: plan.aiReportCap,
      period_ends_at: plan.durationDays > 0 ? new Date(now + plan.durationDays * DAY_MS).toISOString() : null,
      status: 'active',
    }, { onConflict: 'purchase_id', ignoreDuplicates: true });

    await db.from('ai_plan_purchases').update({
      status: 'granted', paid_amount: paidAmount, fee_amount: feeAmount,
      learner_id: learnerId, updated_at: new Date().toISOString(),
    }).eq('order_id', purchase.order_id);

    return json({ status: 'succeeded', paidAmount, feeAmount, learnerId });
  }

  return json({ error: 'unknown_action' }, 400);
});
