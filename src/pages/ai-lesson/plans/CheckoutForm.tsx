// 決済フォーム（§14 最小入力 → 規約確認 → test決済 → 結果確認 → 利用権付与）。
//
// 入力は**メールと規約の同意だけ**。氏名・住所・電話は取らない。
// 低単価商品で入力項目を増やすほど、途中でやめる人が増えて採算が悪くなる。
//
// 模擬決済モードでは、テスト用のカード番号を選ぶだけで結果を再現できる。
// 本物のカード情報を入れる欄は**どのモードでも作らない**（このコンポーネントは
// カード番号をゲートウェイへ渡さず、Stripe の要素は test 鍵が入ってから接続する）。

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  startCheckout, completeCheckout,
  type CheckoutDeps, type CompleteCheckoutResult,
} from '../../../lib/aiLesson/course/sales/checkoutFlow';
import { SimulatedTestGateway, failureMessage } from '../../../lib/aiLesson/course/sales/paymentGateway';
import { createLocalSalesRepository } from '../../../lib/aiLesson/course/sales/localSalesRepository';
import type { SalesPlanConfig } from '../../../lib/aiLesson/course/sales/planConfig';
import type { CheckoutMode } from '../../../lib/aiLesson/course/sales/salesEnv';
import { trackCourse } from '../../../lib/aiLesson/course/courseAnalytics';

const t = (lang: 'ja' | 'zh', ja: string, zh: string) => (lang === 'zh' ? zh : ja);

/** 模擬決済で選べる結果。**本物のカード番号は扱わない** */
const SIM_OUTCOMES = [
  { card: '4242424242424242', ja: '支払いが成功する', zh: '支付成功' },
  { card: '4000000000000002', ja: 'カードが拒否される', zh: '卡被拒绝' },
  { card: '4000000000009995', ja: '残高が足りない', zh: '余额不足' },
  { card: '4000000000000010', ja: '結果がすぐ出ない', zh: '结果暂未出来' },
] as const;

export interface CheckoutFormProps {
  plan: SalesPlanConfig;
  lang: 'ja' | 'zh';
  mode: CheckoutMode;
  /** 購入者のアカウント。**必須**（§3）。ここが無いと購入自体が始まらない */
  learnerId: string;
  termsVersion: string;
  onGranted: (result: CompleteCheckoutResult) => void;
}

type Phase = 'input' | 'paying' | 'pending' | 'error';

export const CheckoutForm = ({ plan, lang, mode, learnerId, termsVersion, onGranted }: CheckoutFormProps) => {
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [simCard, setSimCard] = useState<string>(SIM_OUTCOMES[0].card);
  const [phase, setPhase] = useState<Phase>('input');
  const [message, setMessage] = useState<string | null>(null);

  // 二重送信でも注文が増えないよう、注文IDは一度作ったら使い回す。
  // 生成はレンダー中ではなく、最初の送信時に1回だけ行う（描画を純粋に保つ）。
  const orderIdRef = useRef<string | null>(null);
  const orderId = () => {
    if (!orderIdRef.current) {
      orderIdRef.current = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    }
    return orderIdRef.current;
  };

  const deps = useMemo<CheckoutDeps | null>(() => {
    if (mode !== 'simulated') return null;
    return {
      repo: createLocalSalesRepository(window.localStorage),
      gateway: new SimulatedTestGateway({ cardNumber: simCard }),
      now: () => Date.now(),
    };
  }, [mode, simCard]);

  const submit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (phase === 'paying') return;          // 連打で二重に走らせない
    setMessage(null);

    if (!deps) {
      // test / live は Edge Function 経由。鍵が入るまでここには来ない
      setPhase('error');
      setMessage(t(lang, 'この環境では決済を開始できません。', '当前环境无法开始支付。'));
      return;
    }

    setPhase('paying');
    trackCourse('checkout_started', { plan_id: plan.planId, mode });

    const started = await startCheckout({
      planId: plan.planId, email, lang, termsVersion, orderId: orderId(), learnerId,
    }, deps);

    if (!started.ok) {
      setPhase('error');
      trackCourse('checkout_failed', { plan_id: plan.planId, reason: started.error ?? 'unknown' });
      setMessage(
        started.error === 'invalid_email'
          ? t(lang, 'メールアドレスの形をご確認ください。', '请确认邮箱地址的格式。')
          : started.error === 'terms_not_accepted'
            ? t(lang, '規約への同意が必要です。', '需要同意条款。')
            : t(lang, 'お申し込みを開始できませんでした。', '未能开始申请。'),
      );
      return;
    }

    const done = await completeCheckout(started.purchase!.orderId, deps);

    if (done.outcome === 'granted' || done.outcome === 'already_granted') {
      trackCourse('checkout_completed', { plan_id: plan.planId, mode });
      trackCourse('entitlement_granted', { plan_id: plan.planId, repeat: done.learnerCreated ? 0 : 1 });
      onGranted(done);
      return;
    }

    if (done.outcome === 'pending') {
      setPhase('pending');
      setMessage(t(lang,
        '結果を確認しています。この画面を閉じても、あとで同じ場所から確認できます。',
        '正在确认结果。即使关闭此页面，之后也可以从同一位置确认。'));
      return;
    }

    setPhase('error');
    trackCourse('checkout_failed', { plan_id: plan.planId, reason: done.outcome });
    setMessage(
      done.outcome === 'payment_failed'
        ? failureMessage(done.failureCode, lang)
        : t(lang, '確認できませんでした。もう一度お試しください。', '未能确认。请再试一次。'),
    );
  }, [deps, email, lang, learnerId, mode, onGranted, phase, plan.planId, termsVersion]);

  const busy = phase === 'paying';

  return (
    <form onSubmit={submit} className="mt-6 rounded-2xl border border-lp-line bg-white p-5" noValidate>
      <h2 className="text-base font-extrabold text-lp-ink">
        {t(lang, 'お申し込み', '申请')}
      </h2>

      {/* label で囲むだけにせず id / htmlFor で明示的に結ぶ。
          支援技術によっては内包だけだと名前が解決されないことがある */}
      <div className="mt-4">
        <label htmlFor="checkout-email" className="block text-sm font-bold text-lp-ink">
          {t(lang, 'メールアドレス', '邮箱地址')}
        </label>
        <span id="checkout-email-help" className="mt-0.5 block text-[0.78rem] text-lp-ink-soft">
          {t(lang, 'ログインと、お支払いのご案内に使います。', '用于登录和付款相关通知。')}
        </span>
        <input
          id="checkout-email"
          aria-describedby="checkout-email-help"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
          className="mt-1.5 block min-h-12 w-full rounded-lg border border-lp-line px-3 text-base text-lp-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lp-coral-deep"
        />
      </div>

      {mode === 'simulated' && (
        <fieldset className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <legend className="px-1 text-[0.78rem] font-bold text-amber-900">
            {t(lang, '模擬決済：どの結果を試しますか', '模拟支付：想试哪种结果')}
          </legend>
          <div className="mt-1 space-y-1.5">
            {SIM_OUTCOMES.map((o) => (
              <label key={o.card} className="flex min-h-11 items-center gap-2 text-[0.88rem] text-amber-900">
                <input
                  type="radio"
                  name="sim-outcome"
                  value={o.card}
                  checked={simCard === o.card}
                  onChange={() => setSimCard(o.card)}
                  disabled={busy}
                  // value（カード番号）が読み上げ名にならないよう明示する
                  aria-label={t(lang, o.ja, o.zh)}
                  className="h-4 w-4"
                />
                <span>{t(lang, o.ja, o.zh)}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <label className="mt-5 flex min-h-11 items-start gap-2">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          disabled={busy}
          aria-label={t(lang, '規約に同意する', '同意条款')}
          className="mt-1 h-4 w-4"
        />
        <span className="text-[0.88rem] leading-relaxed text-lp-ink">
          {t(lang,
            '利用規約・キャンセルポリシー・特定商取引法に基づく表記を読み、同意します。',
            '我已阅读并同意用户条款、取消政策，以及基于特定商业交易法的标示。')}
        </span>
      </label>

      {message && (
        <p
          role="alert"
          aria-live="assertive"
          className="mt-4 rounded-lg border border-rose-300 bg-rose-50 p-3 text-[0.88rem] leading-relaxed text-rose-900"
        >
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={!agreed || !email || busy}
        className="mt-5 flex min-h-12 w-full items-center justify-center rounded-xl bg-lp-coral px-4 font-bold text-white transition disabled:cursor-not-allowed disabled:bg-slate-300 hover:bg-lp-coral-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
      >
        {busy
          ? t(lang, '確認しています…', '正在确认…')
          : t(lang, '支払いに進む', '前往支付')}
      </button>

      <p className="mt-3 text-[0.78rem] leading-relaxed text-lp-ink-soft">
        {t(lang,
          '支払いが確認できると、その場で使えるようになります。順番待ちや個別のご連絡はありません。',
          '确认付款后即可开始使用。没有排队，也不需要单独联系。')}
      </p>
    </form>
  );
};

export default CheckoutForm;
