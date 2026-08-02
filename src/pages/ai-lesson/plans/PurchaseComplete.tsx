// 購入完了 → オンボーディング（§14 §7）。
//
// ここで**売り込みをしない**（§12「購入直後には強く売り込まないでください」）。
// 出すのは「使えるようになった」ことと「次の一歩」だけ。
//
// 再購入・アップグレードの人には、診断をやり直させない案内にする（§11）。

import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import {
  onboardingStepsFor, purchaseCompleteMessage, type CompleteCheckoutResult,
} from '../../../lib/aiLesson/course/sales/checkoutFlow';
import { CARRIED_OVER_ON_REPURCHASE } from '../../../lib/aiLesson/course/sales/entitlement';
import type { SalesPlanConfig } from '../../../lib/aiLesson/course/sales/planConfig';
import { LegalFooterLinks } from '../legal/LegalPage';

const t = (lang: 'ja' | 'zh', ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export interface PurchaseCompleteProps {
  plan: SalesPlanConfig;
  lang: 'ja' | 'zh';
  result: CompleteCheckoutResult;
}

export const PurchaseComplete = ({ plan, lang, result }: PurchaseCompleteProps) => {
  const returning = !result.learnerCreated;
  const steps = onboardingStepsFor({ returningLearner: returning });
  const grant = result.grant;

  return (
    <div className="min-h-screen bg-lp-ivory">
      <Helmet>
        <title>{t(lang, 'お申し込みありがとうございます', '感谢你的申请')}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-extrabold text-lp-ink" data-testid="purchase-complete-heading">
          {purchaseCompleteMessage(plan, returning, lang)}
        </h1>

        {/* 何がどれだけ使えるのかを、まず数字で出す（§15「残り時間が違う」を自己解決させる） */}
        <section
          aria-label={t(lang, '使えるようになったもの', '已开通的内容')}
          className="mt-5 rounded-2xl border border-lp-line bg-white p-5"
        >
          <dl className="space-y-2 text-[0.92rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-lp-ink-soft">{t(lang, 'プラン', '方案')}</dt>
              <dd className="font-bold text-lp-ink">{lang === 'zh' ? plan.nameZh : plan.nameJa}</dd>
            </div>
            {grant?.activeSeconds != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-lp-ink-soft">{t(lang, '使える時間', '可用时间')}</dt>
                <dd className="text-lp-ink" data-testid="granted-minutes">
                  {t(lang, `${Math.floor(grant.activeSeconds / 60)}分`, `${Math.floor(grant.activeSeconds / 60)}分钟`)}
                </dd>
              </div>
            )}
            {grant?.periodEndsAtMs != null && (
              <div className="flex justify-between gap-4">
                <dt className="text-lp-ink-soft">{t(lang, '利用できる期間', '可用期间')}</dt>
                <dd className="text-lp-ink">
                  {new Date(grant.periodEndsAtMs).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP')}
                  {t(lang, ' まで', ' 为止')}
                </dd>
              </div>
            )}
            {grant && (
              <div className="flex justify-between gap-4">
                <dt className="text-lp-ink-soft">{t(lang, '使い切る期限', '使用期限')}</dt>
                <dd className="text-lp-ink">
                  {new Date(grant.expiresAtMs).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP')}
                </dd>
              </div>
            )}
          </dl>
        </section>

        {returning && (
          // 再購入者への約束。ここに書いたものは実際に消えない（entitlement.ts の台帳がそう作られている）
          <section className="mt-4 rounded-xl border border-lp-line bg-white p-4" data-testid="carryover-note">
            <p className="text-[0.9rem] font-bold text-lp-ink">
              {t(lang, 'これまでの学習はそのまま残っています', '之前的学习内容都还在')}
            </p>
            <p className="mt-1 text-[0.85rem] leading-relaxed text-lp-ink-soft">
              {t(lang,
                '診断のやり直しはありません。復習の予定も、冒険マップの進み具合も、そのまま続きます。',
                '不需要重新测评。复习的安排和冒险地图的进度，都会照原样继续。')}
            </p>
            <p className="sr-only">{CARRIED_OVER_ON_REPURCHASE.join(',')}</p>
          </section>
        )}

        <section className="mt-6">
          <h2 className="text-base font-extrabold text-lp-ink">
            {t(lang, 'ここからの流れ', '接下来的流程')}
          </h2>
          <ol className="mt-3 space-y-3">
            {steps.map((s, i) => (
              <li key={s.id} className="rounded-xl border border-lp-line bg-white p-4">
                <p className="font-bold text-lp-ink">
                  {i + 1}. {lang === 'zh' ? s.titleZh : s.titleJa}
                </p>
                <p className="mt-1 text-[0.88rem] leading-relaxed text-lp-ink-soft">
                  {lang === 'zh' ? s.bodyZh : s.bodyJa}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <Link
          to={`/${lang}/ai-course`}
          className="mt-6 flex min-h-12 w-full items-center justify-center rounded-xl bg-lp-coral px-4 font-bold text-white hover:bg-lp-coral-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
        >
          {t(lang, '学習を始める', '开始学习')}
        </Link>

        <p className="mt-4 text-[0.82rem] leading-relaxed text-lp-ink-soft">
          {t(lang,
            'お申し込みの控えをメールでお送りします。届かないときは、迷惑メールをご確認のうえ、お問い合わせください。',
            '申请凭证会通过邮件发送。如果没有收到，请先查看垃圾邮件，然后联系我们。')}
        </p>

        <hr className="my-10 border-lp-line" />
        <LegalFooterLinks lang={lang} />
      </main>
    </div>
  );
};

export default PurchaseComplete;
