// 決済ゲートウェイの抽象（§14）。
//
// なぜ抽象にするのか:
//   1. 依頼書の条件は「Stripe test mode **または既存の安全なtest経路**で自動付与まで実証する」。
//      本番鍵しか手元に無い状況で本物を叩くのは論外なので、
//      **同じインターフェースを満たす模擬ゲートウェイ**を用意して、
//      「決済成功 → 利用権付与」の経路そのものをテストで通し切る。
//   2. Stripe の test 鍵が入ったら、実装を差し替えるだけで同じ流れが本物になる。
//      呼び出し側（checkoutFlow）は一切変えない。
//
// **本番鍵ではどのゲートウェイも生成できない**（`salesEnv.assertCheckoutAllowed` を必ず通す）。

import type { SalesPlanId } from './planConfig';
import { assertCheckoutAllowed, type CheckoutMode } from './salesEnv';

export interface PurchaseOrder {
  /** クライアントが作る一意キー。二重送信でも1件しか成立させないための軸 */
  orderId: string;
  planId: SalesPlanId;
  /** 注文時の PlanConfig.version。後から条件を再現できる */
  planVersion: number;
  amount: number;
  currency: 'JPY';
  /** 最小入力（§14）。氏名・住所は取らない */
  email: string;
  lang: 'ja' | 'zh';
  /** 同意した規約のバージョン */
  termsVersion: string;
  createdAtMs: number;
}

export interface PaymentSession {
  /** ゲートウェイ側の識別子。以後の照会はこれで行う */
  reference: string;
  gatewayId: PaymentGatewayId;
  /** 決済画面を別URLで開く方式のとき（Stripe Checkout等） */
  redirectUrl?: string;
  /** 画面内でカード入力する方式のとき */
  clientSecret?: string;
}

export type PaymentStatus = 'succeeded' | 'failed' | 'pending';

export interface PaymentResult {
  reference: string;
  status: PaymentStatus;
  /** 実際に支払われた金額。注文額と一致するかを呼び出し側が必ず検証する */
  paidAmount: number;
  currency: 'JPY';
  /** 失敗理由（利用者に見せる文言へ変換するためのキー。生メッセージは見せない） */
  failureCode?: PaymentFailureCode;
  /** ゲートウェイ側の手数料見込み（採算集計用・円） */
  feeAmount: number;
}

export type PaymentFailureCode =
  | 'card_declined'
  | 'insufficient_funds'
  | 'expired_card'
  | 'processing_error'
  | 'authentication_required';

export type PaymentGatewayId = 'simulated-test' | 'stripe-test';

export interface PaymentGateway {
  readonly id: PaymentGatewayId;
  /** 支払いを開始する。**べき等**: 同じ orderId は同じ reference を返す */
  createPaymentSession(order: PurchaseOrder): Promise<PaymentSession>;
  /** 支払い結果を**ゲートウェイに問い合わせて**確認する（クライアントの自己申告を信じない） */
  confirmPayment(reference: string): Promise<PaymentResult>;
}

/** 決済手数料の想定（採算集計と表示に使う。実際の請求はゲートウェイの明細が正） */
export const PAYMENT_FEE_RATE = 0.036;

export const estimatedFee = (amount: number): number => Math.round(amount * PAYMENT_FEE_RATE);

// ─────────────────────────────────────────────────────────
// 模擬ゲートウェイ（テストと、鍵が無い環境での動作確認用）
// ─────────────────────────────────────────────────────────
//
// 本物のカード番号は一切扱わない。テスト用の番号だけを受け取り、結果を決める。
// 「決済が成功したら利用権が自動で付く」という**経路の検証**が目的で、
// カード処理そのものの検証ではない。

/** 模擬ゲートウェイが解釈するテスト番号。Stripe のテストカードに寄せてある */
export const SIMULATED_TEST_CARDS: Record<string, PaymentStatus | PaymentFailureCode> = {
  '4242424242424242': 'succeeded',
  '4000000000000002': 'card_declined',
  '4000000000009995': 'insufficient_funds',
  '4000000000000069': 'expired_card',
  '4000000000003220': 'authentication_required',
  '4000000000000119': 'processing_error',
  // 何度確認しても pending のまま（結果待ちの画面を確認するため）
  '4000000000000010': 'pending',
};

const normalizeCard = (raw: string): string => raw.replace(/[\s-]/g, '');

export interface SimulatedGatewayOptions {
  /** どのカードで払ったことにするか。未指定は成功 */
  cardNumber?: string;
}

/**
 * 模擬ゲートウェイ。
 * 状態を内部に持つので、**1購入フローにつき1インスタンス**を使う。
 * 実運用の Stripe と同じく「createしてからconfirmする」順序でしか結果が出ない。
 */
export class SimulatedTestGateway implements PaymentGateway {
  readonly id = 'simulated-test' as const;
  private sessions = new Map<string, { order: PurchaseOrder; card: string }>();
  private byOrder = new Map<string, string>();
  private readonly options: SimulatedGatewayOptions;

  constructor(options: SimulatedGatewayOptions = {}) {
    this.options = options;
  }

  async createPaymentSession(order: PurchaseOrder): Promise<PaymentSession> {
    // べき等: 同じ注文なら同じ reference を返す（二重に決済セッションを作らない）
    const existing = this.byOrder.get(order.orderId);
    if (existing) return { reference: existing, gatewayId: this.id };

    const reference = `sim_${order.orderId}`;
    this.sessions.set(reference, {
      order,
      card: normalizeCard(this.options.cardNumber ?? '4242424242424242'),
    });
    this.byOrder.set(order.orderId, reference);
    return { reference, gatewayId: this.id, clientSecret: `sim_secret_${order.orderId}` };
  }

  async confirmPayment(reference: string): Promise<PaymentResult> {
    const s = this.sessions.get(reference);
    if (!s) {
      return { reference, status: 'failed', paidAmount: 0, currency: 'JPY',
               failureCode: 'processing_error', feeAmount: 0 };
    }
    const outcome = SIMULATED_TEST_CARDS[s.card] ?? 'card_declined';
    if (outcome === 'succeeded') {
      return {
        reference, status: 'succeeded', paidAmount: s.order.amount, currency: 'JPY',
        feeAmount: estimatedFee(s.order.amount),
      };
    }
    if (outcome === 'pending') {
      return { reference, status: 'pending', paidAmount: 0, currency: 'JPY', feeAmount: 0 };
    }
    return {
      reference, status: 'failed', paidAmount: 0, currency: 'JPY',
      failureCode: outcome as PaymentFailureCode, feeAmount: 0,
    };
  }
}

// ─────────────────────────────────────────────────────────
// Stripe test mode ゲートウェイ
// ─────────────────────────────────────────────────────────
//
// 実際のカード処理は Edge Function（サーバー）側で行う。
// クライアントは金額を送らない。**金額はサーバーが planId から引く**。
// （クライアントが金額を送れると、600円の商品を1円で買われる）

export interface EdgeInvoker {
  (fn: string, body: Record<string, unknown>): Promise<Record<string, unknown>>;
}

export class StripeTestGateway implements PaymentGateway {
  readonly id = 'stripe-test' as const;
  private readonly invoke: EdgeInvoker;

  constructor(invoke: EdgeInvoker) {
    this.invoke = invoke;
  }

  async createPaymentSession(order: PurchaseOrder): Promise<PaymentSession> {
    const res = await this.invoke('ai-course-checkout', {
      action: 'create',
      orderId: order.orderId,
      planId: order.planId,          // 金額は送らない（サーバーが決める）
      planVersion: order.planVersion,
      email: order.email,
      lang: order.lang,
      termsVersion: order.termsVersion,
    });
    return {
      reference: String(res.reference ?? ''),
      gatewayId: this.id,
      clientSecret: res.clientSecret ? String(res.clientSecret) : undefined,
      redirectUrl: res.redirectUrl ? String(res.redirectUrl) : undefined,
    };
  }

  async confirmPayment(reference: string): Promise<PaymentResult> {
    const res = await this.invoke('ai-course-checkout', { action: 'confirm', reference });
    return {
      reference,
      status: (res.status as PaymentStatus) ?? 'failed',
      paidAmount: Number(res.paidAmount ?? 0),
      currency: 'JPY',
      failureCode: res.failureCode as PaymentFailureCode | undefined,
      feeAmount: Number(res.feeAmount ?? 0),
    };
  }
}

/**
 * 決済モードに応じたゲートウェイを作る。
 * **disabled / live では必ず例外**（ここを通らずにゲートウェイを作る経路を残さない）。
 */
export const createGateway = (
  mode: CheckoutMode,
  deps: { invoke?: EdgeInvoker; simulated?: SimulatedGatewayOptions } = {},
): PaymentGateway => {
  assertCheckoutAllowed(mode);
  if (mode === 'test' && deps.invoke) return new StripeTestGateway(deps.invoke);
  return new SimulatedTestGateway(deps.simulated);
};

/** 失敗理由を、利用者が次に何をすればよいか分かる文言へ（生の英語メッセージは見せない） */
export const failureMessage = (code: PaymentFailureCode | undefined, lang: 'ja' | 'zh'): string => {
  const ja: Record<PaymentFailureCode, string> = {
    card_declined: 'カードが使えませんでした。別のカードをお試しいただくか、カード会社にご確認ください。',
    insufficient_funds: '残高が足りないようです。別のカードをお試しください。',
    expired_card: 'カードの有効期限が切れています。別のカードをお試しください。',
    processing_error: '処理中に問題が起きました。少し時間をおいてもう一度お試しください。',
    authentication_required: 'カード会社の追加確認が必要です。表示された案内に従って進めてください。',
  };
  const zh: Record<PaymentFailureCode, string> = {
    card_declined: '这张卡无法使用。请换一张卡，或与发卡行确认。',
    insufficient_funds: '余额似乎不足。请换一张卡试试。',
    expired_card: '卡片已过期。请换一张卡试试。',
    processing_error: '处理过程中出现问题。请稍后再试一次。',
    authentication_required: '需要发卡行的额外验证。请按照显示的指引继续。',
  };
  const fallbackJa = '決済を完了できませんでした。もう一度お試しください。';
  const fallbackZh = '支付未能完成。请再试一次。';
  if (!code) return lang === 'zh' ? fallbackZh : fallbackJa;
  return lang === 'zh' ? zh[code] : ja[code];
};
