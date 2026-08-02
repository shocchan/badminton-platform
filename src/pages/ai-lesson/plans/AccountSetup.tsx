// 購入・相談・体験開始の前に置くアカウント設定（§3）。
//
// 入力はメールアドレスだけ。氏名も住所も取らない（低単価商品で項目を増やすと離脱する）。
// OTPを確認したら、**元のプランの続きへそのまま戻る**（intent に保存済み）。
//
// 実セッションがある人にはこの画面を出さない。呼び出し側が gate の判断で出し分ける。

import { useCallback, useState } from 'react';
import {
  startSimAccount, verifySimAccount, readSimAccount,
} from '../../../lib/aiLesson/course/sales/salesAccount';
import { isPlausibleEmail } from '../../../lib/aiLesson/course/sales/checkoutFlow';
import type { AccountSession } from '../../../lib/aiLesson/course/sales/accountGate';
import { trackCourse } from '../../../lib/aiLesson/course/courseAnalytics';

const t = (lang: 'ja' | 'zh', ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface AccountSetupProps {
  lang: 'ja' | 'zh';
  planName: string;
  /** 模擬モードか。本番の実OTPが使える環境では false にして実ログインへ送る */
  simulated: boolean;
  onReady: (session: AccountSession) => void;
  /** 実ログインへ送る場合の導線（模擬モードでないとき） */
  loginHref?: string;
}

type Step = 'email' | 'code';

export const AccountSetup = ({ lang, planName, simulated, onReady, loginHref }: AccountSetupProps) => {
  const [step, setStep] = useState<Step>(() => (readSimAccount(sessionSafe())?.verified ? 'email' : 'email'));
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(() => {
    if (!isPlausibleEmail(email)) {
      setError(t(lang, 'メールアドレスの形式をご確認ください。', '请确认邮箱地址的格式。'));
      return;
    }
    setError(null);
    trackCourse('account_setup_started', {});
    const acc = startSimAccount(sessionSafe(), email, Date.now());
    setSentCode(acc.code);
    setStep('code');
  }, [email, lang]);

  const verify = useCallback(() => {
    const res = verifySimAccount(sessionSafe(), code);
    if (!res.ok) {
      setError(t(lang, '確認コードが一致しません。', '验证码不一致。'));
      return;
    }
    setError(null);
    trackCourse('account_setup_completed', {});
    onReady({ userId: res.account.userId, email: res.account.email });
  }, [code, lang, onReady]);

  if (!simulated) {
    return (
      <section
        aria-labelledby="account-setup-heading"
        className="mt-6 rounded-2xl border border-lp-line bg-white p-5"
      >
        <h2 id="account-setup-heading" className="text-base font-extrabold text-lp-ink">
          {t(lang, 'はじめにアカウントを作ります', '首先创建账号')}
        </h2>
        <p className="mt-2 text-[0.9rem] leading-relaxed text-lp-ink-soft">
          {t(lang,
            `「${planName}」に進むには、ログインが必要です。学習の進み方と残り時間をアカウントに保存するためです。`,
            `要继续「${planName}」，需要先登录。这样学习进度和剩余时间才能保存到账号中。`)}
        </p>
        <a
          href={loginHref ?? '#'}
          className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-lp-coral px-4 font-bold text-white hover:bg-lp-coral-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
        >
          {t(lang, 'ログイン／アカウント作成へ', '前往登录／创建账号')}
        </a>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="account-setup-heading"
      className="mt-6 rounded-2xl border border-lp-line bg-white p-5"
    >
      <h2 id="account-setup-heading" className="text-base font-extrabold text-lp-ink">
        {t(lang, 'はじめにアカウントを作ります', '首先创建账号')}
      </h2>
      <p className="mt-2 text-[0.9rem] leading-relaxed text-lp-ink-soft">
        {t(lang,
          '学習の進み方と残り時間をアカウントに保存します。あとから同じ続きを開けるようにするためです。',
          '学习进度和剩余时间会保存在账号中，方便你之后从同一处继续。')}
      </p>

      {step === 'email' ? (
        <div className="mt-4">
          <label htmlFor="account-email" className="block text-sm font-bold text-lp-ink">
            {t(lang, 'メールアドレス', '邮箱地址')}
          </label>
          <input
            id="account-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 block min-h-12 w-full rounded-lg border border-lp-line px-3 text-base text-lp-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lp-coral-deep"
          />
          <button
            type="button"
            onClick={send}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-lp-coral px-4 font-bold text-white hover:bg-lp-coral-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
          >
            {t(lang, '確認コードを送る', '发送验证码')}
          </button>
        </div>
      ) : (
        <div className="mt-4">
          {/* 模擬モードなので実際のメールは送らない。そのことを隠さない */}
          <p role="note" data-testid="sim-otp-note" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[0.8rem] text-amber-900">
            {t(lang,
              `確認用の画面です。メールは送られていません。確認コード: ${sentCode}`,
              `这是确认用画面，未发送邮件。验证码：${sentCode}`)}
          </p>
          <label htmlFor="account-code" className="mt-4 block text-sm font-bold text-lp-ink">
            {t(lang, '確認コード', '验证码')}
          </label>
          <input
            id="account-code"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="mt-1.5 block min-h-12 w-full rounded-lg border border-lp-line px-3 text-base text-lp-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-lp-coral-deep"
          />
          <button
            type="button"
            onClick={verify}
            className="mt-4 flex min-h-12 w-full items-center justify-center rounded-xl bg-lp-coral px-4 font-bold text-white hover:bg-lp-coral-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
          >
            {t(lang, '確認して続ける', '确认并继续')}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 text-[0.85rem] font-bold text-red-700">{error}</p>
      )}
    </section>
  );
};

/** SSR やテスト環境で sessionStorage が無い場合に落ちないようにする */
function sessionSafe() {
  try {
    return window.sessionStorage;
  } catch {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  }
}
