// 自動販売Journey の中核（§14）。
//
//   料金ページ → プラン選択 → 最小入力 → 規約確認 → test決済
//   → 支払結果確認 → アカウント作成/接続 → 利用権付与 → オンボーディング
//
// この層は「どこで人が介在するか」を決める場所でもある。
// 60分・1か月については、この流れの中に**人が入る隙間を作らない**（§4-1〜3）。
//
// 設計の要点:
//   - 金額はサーバー（PlanConfig）が決める。クライアントの申告額を使わない
//   - 支払い結果はゲートウェイに問い合わせて確認する。「成功しました」の自己申告を信じない
//   - 付与は purchaseId でべき等。Webhook再送・再読込・二重送信でも利用権は増えない
//   - 失敗したら利用権は付かない。中途半端な状態を残さない
//
// 永続化は interface 越し。テストは in-memory 実装で全経路を通す。

import { salesPlanById, type SalesPlanConfig, type SalesPlanId, isPriceConfirmed } from './planConfig';
import { buildGrant, type EntitlementGrant } from './entitlement';
import type {
  PaymentGateway, PaymentFailureCode, PurchaseOrder,
} from './paymentGateway';

export type PurchaseStatus =
  | 'created'    // 注文を作った（未払い）
  | 'paid'       // 支払い確認済み
  | 'granted'    // 利用権を付与済み（ここまで来たら学習を始められる）
  | 'failed';    // 支払い失敗

export interface PurchaseRecord {
  orderId: string;
  planId: SalesPlanId;
  planVersion: number;
  /** 注文時にサーバーが確定した金額。**この額と実際の支払額が一致しなければ付与しない** */
  amount: number;
  currency: 'JPY';
  email: string;
  lang: 'ja' | 'zh';
  termsVersion: string;
  gatewayId: string;
  reference: string;
  status: PurchaseStatus;
  paidAmount: number;
  feeAmount: number;
  failureCode?: PaymentFailureCode;
  /** 付与先。決済時点で未ログインなら、支払い確認後に解決する */
  learnerId: string | null;
  createdAtMs: number;
  updatedAtMs: number;
}

/** 永続化の口。Supabase 実装とテスト用 in-memory 実装が同じ形を満たす */
export interface SalesRepository {
  findPurchase(orderId: string): Promise<PurchaseRecord | null>;
  savePurchase(record: PurchaseRecord): Promise<void>;
  listGrants(learnerId: string): Promise<EntitlementGrant[]>;
  insertGrant(grant: EntitlementGrant): Promise<void>;
  /** メールから既存の学習者を探す（**再購入で新しいアカウントを作らない**ため） */
  findLearnerIdByEmail(email: string): Promise<string | null>;
  /** 初回購入者のアカウントを作る */
  createLearner(email: string, lang: 'ja' | 'zh'): Promise<string>;
}

export interface CheckoutDeps {
  repo: SalesRepository;
  gateway: PaymentGateway;
  now: () => number;
  /** 注文IDの採番（テストでは固定値を注入する） */
  newOrderId?: () => string;
}

// ─────────────────────────────────────────────────────────
// 1. 注文の開始
// ─────────────────────────────────────────────────────────

export interface StartCheckoutInput {
  planId: string;
  email: string;
  lang: 'ja' | 'zh';
  termsVersion: string;
  /** 再購入・ログイン済みで learner が分かっているとき */
  learnerId?: string | null;
  /** 二重送信対策のため、画面が同じ値を送り続ける */
  orderId?: string;
}

export type StartCheckoutError =
  | 'unknown_plan'
  | 'plan_not_purchasable'
  | 'price_not_confirmed'
  | 'consultation_only'
  | 'invalid_email'
  | 'terms_not_accepted';

export interface StartCheckoutResult {
  ok: boolean;
  error?: StartCheckoutError;
  purchase?: PurchaseRecord;
  /** 画面内カード入力用 */
  clientSecret?: string;
  /** 決済画面へ遷移する方式のとき */
  redirectUrl?: string;
}

/** ごく基本の形式確認だけ。厳しくしすぎると正当な住所が弾かれる */
export const isPlausibleEmail = (v: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

export const startCheckout = async (
  input: StartCheckoutInput,
  deps: CheckoutDeps,
): Promise<StartCheckoutResult> => {
  const plan = salesPlanById(input.planId);
  if (!plan) return { ok: false, error: 'unknown_plan' };
  if (plan.status !== 'published') return { ok: false, error: 'plan_not_purchasable' };
  // 価格がCEO未確定のプランは課金しない。画面を直しても、ここを通らなければ売れない
  if (!isPriceConfirmed(plan)) return { ok: false, error: 'price_not_confirmed' };
  // 6か月伴走はここを通さない。相談導線で受ける（§1 §14）
  if (plan.ctaMode === 'consult') return { ok: false, error: 'consultation_only' };
  if (!isPlausibleEmail(input.email)) return { ok: false, error: 'invalid_email' };
  if (!input.termsVersion) return { ok: false, error: 'terms_not_accepted' };

  const now = deps.now();
  const orderId = input.orderId ?? deps.newOrderId?.() ?? `ord_${now}`;

  // 同じ注文IDで戻ってきたら、作り直さずに前の注文をそのまま使う
  const existing = await deps.repo.findPurchase(orderId);
  if (existing && existing.status !== 'failed') {
    const session = await deps.gateway.createPaymentSession(toOrder(existing));
    return { ok: true, purchase: existing, clientSecret: session.clientSecret, redirectUrl: session.redirectUrl };
  }

  const record: PurchaseRecord = {
    orderId,
    planId: plan.planId,
    planVersion: plan.version,
    amount: plan.priceAmount,      // ★金額はここで確定。クライアントからは受け取らない
    currency: plan.currency,
    email: input.email.trim(),
    lang: input.lang,
    termsVersion: input.termsVersion,
    gatewayId: deps.gateway.id,
    reference: '',
    status: 'created',
    paidAmount: 0,
    feeAmount: 0,
    learnerId: input.learnerId ?? null,
    createdAtMs: now,
    updatedAtMs: now,
  };

  const session = await deps.gateway.createPaymentSession(toOrder(record));
  record.reference = session.reference;
  await deps.repo.savePurchase(record);

  return { ok: true, purchase: record, clientSecret: session.clientSecret, redirectUrl: session.redirectUrl };
};

const toOrder = (r: PurchaseRecord): PurchaseOrder => ({
  orderId: r.orderId,
  planId: r.planId,
  planVersion: r.planVersion,
  amount: r.amount,
  currency: r.currency,
  email: r.email,
  lang: r.lang,
  termsVersion: r.termsVersion,
  createdAtMs: r.createdAtMs,
});

// ─────────────────────────────────────────────────────────
// 2. 支払い確認 → アカウント接続 → 利用権付与（ここが自動化の本体）
// ─────────────────────────────────────────────────────────

export type CompleteCheckoutOutcome =
  | 'granted'          // 利用権が付いた（学習を始められる）
  | 'already_granted'  // 既に付いていた（再送・再読込）
  | 'pending'          // まだ結果が出ていない
  | 'payment_failed'
  | 'amount_mismatch'  // 支払額が注文額と違う（付与しない）
  | 'unknown_order';

export interface CompleteCheckoutResult {
  outcome: CompleteCheckoutOutcome;
  purchase: PurchaseRecord | null;
  grant: EntitlementGrant | null;
  learnerId: string | null;
  failureCode?: PaymentFailureCode;
  /** 新しくアカウントを作ったか（オンボーディングの出し分けに使う） */
  learnerCreated: boolean;
}

export const completeCheckout = async (
  orderId: string,
  deps: CheckoutDeps,
): Promise<CompleteCheckoutResult> => {
  const purchase = await deps.repo.findPurchase(orderId);
  if (!purchase) {
    return { outcome: 'unknown_order', purchase: null, grant: null, learnerId: null, learnerCreated: false };
  }

  // 既に付与済みなら、何もせず同じ結果を返す（べき等）
  if (purchase.status === 'granted' && purchase.learnerId) {
    const grants = await deps.repo.listGrants(purchase.learnerId);
    const grant = grants.find((g) => g.purchaseId === purchase.orderId) ?? null;
    return { outcome: 'already_granted', purchase, grant, learnerId: purchase.learnerId, learnerCreated: false };
  }

  // ★ 支払い結果はゲートウェイに聞く。画面からの「成功しました」を信用しない
  const result = await deps.gateway.confirmPayment(purchase.reference);
  const now = deps.now();

  if (result.status === 'pending') {
    return { outcome: 'pending', purchase, grant: null, learnerId: purchase.learnerId, learnerCreated: false };
  }

  if (result.status === 'failed') {
    const failed: PurchaseRecord = {
      ...purchase, status: 'failed', failureCode: result.failureCode, updatedAtMs: now,
    };
    await deps.repo.savePurchase(failed);
    return {
      outcome: 'payment_failed', purchase: failed, grant: null,
      learnerId: purchase.learnerId, failureCode: result.failureCode, learnerCreated: false,
    };
  }

  // ★ 金額の一致確認。ここが崩れると「1円で60分パス」が通る
  if (result.paidAmount !== purchase.amount) {
    const mismatched: PurchaseRecord = {
      ...purchase, status: 'failed', failureCode: 'processing_error',
      paidAmount: result.paidAmount, updatedAtMs: now,
    };
    await deps.repo.savePurchase(mismatched);
    return { outcome: 'amount_mismatch', purchase: mismatched, grant: null, learnerId: null, learnerCreated: false };
  }

  // アカウントの接続。**既にあれば作らない**（再購入で進捗が切れる事故を防ぐ・§11）
  let learnerId = purchase.learnerId;
  let learnerCreated = false;
  if (!learnerId) {
    learnerId = await deps.repo.findLearnerIdByEmail(purchase.email);
    if (!learnerId) {
      learnerId = await deps.repo.createLearner(purchase.email, purchase.lang);
      learnerCreated = true;
    }
  }

  // 利用権の付与。purchaseId でべき等
  const plan = salesPlanById(purchase.planId)!;
  const existingGrants = await deps.repo.listGrants(learnerId);
  const { grant, duplicated } = buildGrant({
    learnerId,
    planId: purchase.planId,
    planVersion: purchase.planVersion,
    purchaseId: purchase.orderId,
    nowMs: now,
    activeMinutes: plan.includedActiveMinutes,
    validityDays: plan.validityDays,
    durationDays: plan.durationDays,
    voiceMinutesCap: plan.cost.voiceMinutesCap,
    aiReportCap: plan.cost.aiReportCap,
  }, existingGrants);

  const paid: PurchaseRecord = {
    ...purchase,
    status: 'granted',
    paidAmount: result.paidAmount,
    feeAmount: result.feeAmount,
    learnerId,
    updatedAtMs: now,
  };

  if (duplicated) {
    await deps.repo.savePurchase(paid);
    const already = existingGrants.find((g) => g.purchaseId === purchase.orderId) ?? null;
    return { outcome: 'already_granted', purchase: paid, grant: already, learnerId, learnerCreated };
  }

  await deps.repo.insertGrant(grant!);
  await deps.repo.savePurchase(paid);
  return { outcome: 'granted', purchase: paid, grant: grant!, learnerId, learnerCreated };
};

// ─────────────────────────────────────────────────────────
// 3. 購入後オンボーディング（§7 §14）
// ─────────────────────────────────────────────────────────
//
// 60分パスは「60分ぶん情報を取れる権利」ではなく「必要な学習を60分進める権利」。
// だからオンボーディングは**目的 → 現在地 → 今日使う時間**の順で、
// 教材の一覧には一度も触れさせない。

export type OnboardingStepId =
  | 'choose_goal'        // 目的を選ぶ
  | 'quick_placement'    // 現在地の簡易確認
  | 'choose_minutes'     // 今日使う時間を選ぶ
  | 'start_learning';    // 学習開始

export interface OnboardingStep {
  id: OnboardingStepId;
  titleJa: string;
  titleZh: string;
  bodyJa: string;
  bodyZh: string;
  /** この手順を飛ばせるか（再購入者は診断をやり直さない・§11） */
  skippableForReturning: boolean;
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'choose_goal',
    titleJa: '目的を選ぶ', titleZh: '选择目的',
    bodyJa: '「N2に合格したい」「会話ができるようになりたい」から1つ選びます。',
    bodyZh: '从「想通过N2」「想能开口会话」中选一个。',
    skippableForReturning: true,
  },
  {
    id: 'quick_placement',
    titleJa: '現在地を測る', titleZh: '测量当前位置',
    bodyJa: '短い問題で、今のあなたの位置を確かめます。長い試験ではありません。',
    bodyZh: '用简短的题目确认你现在的位置。不是长时间的考试。',
    skippableForReturning: true,
  },
  {
    id: 'choose_minutes',
    titleJa: '今日使う時間を選ぶ', titleZh: '选择今天要用的时间',
    bodyJa: '10分だけでも大丈夫です。残りは次回に持ち越せます。',
    bodyZh: '只用10分钟也可以。剩下的能留到下一次。',
    skippableForReturning: false,
  },
  {
    id: 'start_learning',
    titleJa: '学習を始める', titleZh: '开始学习',
    bodyJa: '今のあなたに必要な問題をAIが選びます。',
    bodyZh: '由AI挑选此刻你需要的题目。',
    skippableForReturning: false,
  },
] as const;

/**
 * その人に出すオンボーディング手順。
 * 再購入・アップグレードでは、診断をやり直させない（§11 §12）。
 */
export const onboardingStepsFor = (opts: { returningLearner: boolean }): OnboardingStep[] =>
  ONBOARDING_STEPS.filter((s) => !(opts.returningLearner && s.skippableForReturning));

/** 購入直後に見せる一文（アップセルは出さない・§12「購入直後には強く売り込まない」） */
export const purchaseCompleteMessage = (
  plan: SalesPlanConfig,
  returning: boolean,
  lang: 'ja' | 'zh',
): string => {
  if (returning) {
    return lang === 'zh'
      ? '已添加使用权。可以从上次的地方继续。'
      : '利用権を追加しました。前回の続きから始められます。';
  }
  const name = lang === 'zh' ? plan.nameZh : plan.nameJa;
  return lang === 'zh'
    ? `${name}已开通。现在就可以开始。`
    : `${name}が使えるようになりました。今から始められます。`;
};
