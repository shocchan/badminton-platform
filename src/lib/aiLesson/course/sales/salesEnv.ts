// 決済を有効にしてよいかの判定。**本番課金の事故を型と分岐で止める層**。
//
// 依頼書の指示: production deploy・本番決済は行わない。Stripe は test mode まで。
//
// そこで「鍵があれば決済ON」にはしない。**test鍵のときだけON**にする。
//   - `pk_test_…` → test mode の決済が動く
//   - `pk_live_…` → 決済は **OFF**（CTAは申込フォームへ落ちる）
//   - 未設定      → 決済は OFF
//
// この向きにしておくと、うっかり本番ビルド（`.env.production` に pk_live がある）で
// AIコースの決済画面が生きてしまう事故が構造的に起きない。
// 本番販売を始めるときは、ここの `ALLOW_LIVE_CHECKOUT` を明示的に true にする
// CEO判断が1回必要になる（勝手に有効化されない）。

/** 本番（live）鍵での決済を許可するか。**CEO判断でのみ true にする** */
export const ALLOW_LIVE_CHECKOUT = false;

/**
 * 決済モード。
 * - `simulated` … 模擬決済。**production ビルドでは絶対に選ばれない**。
 *   staging で `?checkout=sim` を付けたときだけ。カード処理は一切行わず、
 *   「決済成功 → 利用権が自動で付く」という経路をCEOが実際に歩いて確認するためのもの。
 * - `test`      … Stripe test mode（pk_test_…）
 * - `live`      … 本番。ALLOW_LIVE_CHECKOUT が true のときだけ
 * - `disabled`  … 決済しない（申込フォームへ落とす）
 */
export type CheckoutMode = 'simulated' | 'test' | 'live' | 'disabled';

/** 模擬決済へのオプトイン用クエリ */
export const SIMULATED_CHECKOUT_QUERY = 'checkout';
export const SIMULATED_CHECKOUT_VALUE = 'sim';

const readEnv = (key: string): string => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[key] ?? '';
  } catch {
    return '';
  }
};

export interface CheckoutModeInput {
  publishableKey: string;
  /** ビルドモード。'production' では模擬決済を絶対に許さない */
  buildMode: string;
  /** URLのクエリ文字列 */
  search?: string;
  allowLive?: boolean;
}

/** 決済モードを決める（純関数。テストから直接呼べる） */
export const resolveCheckoutMode = (input: CheckoutModeInput): CheckoutMode => {
  const allowLive = input.allowLive ?? ALLOW_LIVE_CHECKOUT;

  // 模擬決済は「本番ビルドではない」かつ「明示のオプトイン」の両方が必要。
  // どちらか一方でも欠けたら通常の鍵判定へ落ちる。
  const optedIn =
    new URLSearchParams(input.search ?? '').get(SIMULATED_CHECKOUT_QUERY) === SIMULATED_CHECKOUT_VALUE;
  if (input.buildMode !== 'production' && optedIn) return 'simulated';

  const k = input.publishableKey.trim();
  if (k.startsWith('pk_test_')) return 'test';
  if (k.startsWith('pk_live_')) return allowLive ? 'live' : 'disabled';
  return 'disabled';
};

const buildMode = (): string => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.MODE ?? 'production';   // 判定できないときは安全側（本番扱い）へ倒す
  } catch {
    return 'production';
  }
};

/** 今のビルド・URLでの決済モード */
export const checkoutMode = (search = ''): CheckoutMode =>
  resolveCheckoutMode({
    publishableKey: readEnv('VITE_STRIPE_PUBLISHABLE_KEY'),
    buildMode: buildMode(),
    search,
  });

/** 決済ボタンを出してよいか */
export const isCheckoutEnabled = (search = ''): boolean => checkoutMode(search) !== 'disabled';

/** 画面に出す注記。決済が使えない理由を隠さない（§6 コールド流入の信頼設計） */
export const checkoutNotice = (mode: CheckoutMode, lang: 'ja' | 'zh'): string | null => {
  if (mode === 'simulated') {
    return lang === 'zh'
      ? '这是确认用的模拟支付。不会与任何支付服务通信，也不会产生费用。请勿输入真实的银行卡信息。'
      : 'これは確認用の模擬決済です。決済サービスとの通信も請求も発生しません。本物のカード情報は入力しないでください。';
  }
  if (mode === 'test') {
    return lang === 'zh'
      ? '当前为测试环境。不会实际扣款，请勿输入真实的银行卡信息。'
      : 'ここはテスト環境です。実際の請求は発生しません。本物のカード情報は入力しないでください。';
  }
  if (mode === 'disabled') {
    return lang === 'zh'
      ? '目前尚未开放在线支付。可以先提交申请，我们会通过邮件告知付款方式。'
      : 'ただいまオンライン決済は準備中です。先にお申し込みいただければ、お支払い方法をメールでご案内します。';
  }
  return null;
};

/** 決済処理を通してよいかの最終ガード（サーバー側の判定と対にする） */
export const assertCheckoutAllowed = (mode: CheckoutMode): void => {
  if (mode === 'disabled') throw new Error('checkout_disabled');
  if (mode === 'live' && !ALLOW_LIVE_CHECKOUT) throw new Error('live_checkout_not_approved');
};

/** 実際にお金が動くモードか（画面の警告文と、採算集計への計上を分けるため） */
export const isRealMoneyMode = (mode: CheckoutMode): boolean => mode === 'live';
