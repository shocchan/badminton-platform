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

export type CheckoutMode = 'test' | 'live' | 'disabled';

const readEnv = (key: string): string => {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[key] ?? '';
  } catch {
    return '';
  }
};

/** 鍵の文字列から決済モードを決める（純関数。テストから直接呼べる） */
export const resolveCheckoutMode = (publishableKey: string, allowLive = ALLOW_LIVE_CHECKOUT): CheckoutMode => {
  const k = publishableKey.trim();
  if (k.startsWith('pk_test_')) return 'test';
  if (k.startsWith('pk_live_')) return allowLive ? 'live' : 'disabled';
  return 'disabled';
};

/** 今のビルドの決済モード */
export const checkoutMode = (): CheckoutMode =>
  resolveCheckoutMode(readEnv('VITE_STRIPE_PUBLISHABLE_KEY'));

/** 決済ボタンを出してよいか */
export const isCheckoutEnabled = (): boolean => checkoutMode() !== 'disabled';

/** 画面に出す注記。決済が使えない理由を隠さない（§6 コールド流入の信頼設計） */
export const checkoutNotice = (mode: CheckoutMode, lang: 'ja' | 'zh'): string | null => {
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
