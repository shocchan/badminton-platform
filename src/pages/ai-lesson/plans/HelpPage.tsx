// 自己解決のヘルプ画面 /:lang/ai-course/help（§15）。
//
// 並べ方の意図:
//   1. 「今の利用権の状態」を最初に出す。多くの問い合わせは「使えるのか分からない」から来る
//   2. 各項目は **自分で試す手順が先**、押せる復旧操作が後
//   3. 問い合わせは隠さない。ただし、手順を読む前の一番上には置かない

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useParams } from 'react-router-dom';
import {
  HELP_TOPICS, helpTopicView, describeResync, type HelpActionId, type RecoveryResult,
} from '../../../lib/aiLesson/course/sales/salesHelp';
import { plansPathFor } from '../../../lib/aiLesson/course/sales/plansContent';
import { readSimulatedGrants } from '../../../lib/aiLesson/course/sales/localSalesRepository';
import { resolveEntitlement, emptyConsumption, entitlementSummary } from '../../../lib/aiLesson/course/sales/entitlement';
import { LegalFooterLinks } from '../legal/LegalPage';
import { trackCourse } from '../../../lib/aiLesson/course/courseAnalytics';

const t = (lang: 'ja' | 'zh', ja: string, zh: string) => (lang === 'zh' ? zh : ja);

/**
 * 表示に使う「今」。
 * component の中で直接 Date.now() を呼ぶと描画が純粋でなくなるので、
 * 取得はこのモジュール関数に閉じ込め、結果は state に置く。
 */
const nowMs = (): number => Date.now();

/** 模擬決済で作った利用権を読む（本番では認証済みセッションから読む） */
const readLocalSnapshot = () => {
  try {
    const grants = readSimulatedGrants(window.localStorage, 'sim_learner_1');
    return resolveEntitlement(grants, emptyConsumption(), nowMs());
  } catch {
    return resolveEntitlement([], emptyConsumption(), nowMs());
  }
};

export const HelpPage = () => {
  const params = useParams();
  const lang: 'ja' | 'zh' = params.lang === 'zh' ? 'zh' : 'ja';
  const [snapshot, setSnapshot] = useState(readLocalSnapshot);
  // 「あと何日」の表示に使う現在時刻。描画のたびに変わると表示が揺れるので、
  // mount 時に一度だけ確定させる（再同期を押したときに取り直す）。
  const [asOfMs, setAsOfMs] = useState(nowMs);
  const [recovery, setRecovery] = useState<RecoveryResult | null>(null);
  const [otpSent, setOtpSent] = useState(false);

  const runAction = (action: HelpActionId) => {
    if (action === 'resync_entitlement') {
      const before = snapshot;
      const after = readLocalSnapshot();
      setSnapshot(after);
      setAsOfMs(nowMs());
      const result = describeResync(before, after);
      setRecovery(result);
      trackCourse(
        result.outcome === 'still_failing' ? 'entitlement_resync_failed' : 'entitlement_resync_succeeded',
        { outcome: result.outcome },
      );
      return;
    }
    if (action === 'resend_otp') {
      setOtpSent(true);
      trackCourse('otp_resend_succeeded', {});
    }
  };

  return (
    <div className="min-h-screen bg-lp-ivory">
      <Helmet>
        <title>{t(lang, '困ったときは｜AI日本語コース', '遇到问题时｜AI日语课程')}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <Link to={`/${lang}/ai-course`} className="text-sm underline underline-offset-2 opacity-70">
          {t(lang, 'コースへ戻る', '返回课程')}
        </Link>

        <h1 className="mt-5 text-2xl font-extrabold text-lp-ink">
          {t(lang, '困ったときは', '遇到问题时')}
        </h1>
        <p className="mt-2 text-[0.95rem] leading-relaxed text-lp-ink-soft">
          {t(lang,
            'よくあるものは、この画面でそのまま直せます。',
            '常见的问题，可以在这个页面直接解决。')}
        </p>

        {/* 1. 今の状態を最初に見せる */}
        <section
          aria-label={t(lang, '今の利用状況', '当前使用状态')}
          className="mt-6 rounded-2xl border border-lp-line bg-white p-5"
        >
          <h2 className="text-base font-extrabold text-lp-ink">
            {t(lang, '今の利用状況', '当前使用状态')}
          </h2>
          <p className="mt-1 text-[0.95rem] text-lp-ink" data-testid="entitlement-summary">
            {entitlementSummary(snapshot, asOfMs, lang)}
          </p>
          {recovery && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-lg border border-lp-line bg-lp-ivory p-3 text-[0.88rem] leading-relaxed text-lp-ink"
              data-testid="recovery-message"
            >
              {lang === 'zh' ? recovery.messageZh : recovery.messageJa}
            </p>
          )}
          {otpSent && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-lg border border-lp-line bg-lp-ivory p-3 text-[0.88rem] text-lp-ink"
              data-testid="otp-message"
            >
              {t(lang,
                'コードを送り直しました。数分待っても届かないときは、迷惑メールをご確認ください。',
                '已重新发送验证码。等几分钟仍未收到时，请查看垃圾邮件。')}
            </p>
          )}
        </section>

        {/* 2. 各項目：手順が先、操作が後 */}
        <section className="mt-8">
          <h2 className="text-base font-extrabold text-lp-ink">
            {t(lang, 'よくある症状', '常见情况')}
          </h2>
          <div className="mt-3 space-y-3">
            {HELP_TOPICS.map((topic) => {
              const v = helpTopicView(topic, lang);
              return (
                <details key={v.id} className="rounded-xl border border-lp-line bg-white p-4" data-testid={`help-${v.id}`}>
                  <summary className="min-h-11 cursor-pointer list-none font-bold text-lp-ink marker:hidden">
                    {v.question}
                  </summary>
                  <ol className="mt-2 space-y-1.5">
                    {v.steps.map((s, i) => (
                      <li key={s} className="flex gap-2 text-[0.9rem] leading-relaxed text-lp-ink-soft">
                        <span className="font-bold text-lp-coral-deep">{i + 1}.</span>
                        <span>{s}</span>
                      </li>
                    ))}
                  </ol>
                  {v.action === 'go_plans' && (
                    <Link
                      to={plansPathFor(lang)}
                      className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-lp-coral px-4 text-sm font-bold text-lp-coral-deep"
                    >
                      {v.actionLabel}
                    </Link>
                  )}
                  {(v.action === 'resync_entitlement' || v.action === 'resend_otp') && (
                    <button
                      type="button"
                      onClick={() => runAction(v.action)}
                      className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-lp-coral px-4 text-sm font-bold text-lp-coral-deep"
                    >
                      {v.actionLabel}
                    </button>
                  )}
                </details>
              );
            })}
          </div>
        </section>

        {/* 3. 問い合わせは隠さない（ただし手順の下） */}
        <section className="mt-8 rounded-xl border border-lp-line bg-white p-5">
          <h2 className="text-base font-extrabold text-lp-ink">
            {t(lang, 'それでも解決しないときは', '如果仍然没有解决')}
          </h2>
          <p className="mt-1 text-[0.9rem] leading-relaxed text-lp-ink-soft">
            {t(lang,
              'お問い合わせください。いただいた順にお返事します。',
              '请联系我们。我们会按顺序回复。')}
          </p>
          <Link
            to={`/${lang}/ai-course/contact`}
            onClick={() => trackCourse('support_contacted', { from: 'help' })}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-lp-coral px-4 text-sm font-bold text-lp-coral-deep"
          >
            {t(lang, 'お問い合わせ', '联系我们')}
          </Link>
        </section>

        <hr className="my-10 border-lp-line" />
        <LegalFooterLinks lang={lang} />
      </main>
    </div>
  );
};

export default HelpPage;
