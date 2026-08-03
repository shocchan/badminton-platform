// 料金ページ /:lang/ai-course/plans（§5 §6）。
//
// 情報設計:
//   1. 見出し＋サブコピー（今の目的に合う始め方がある、と分かる）
//   2. **ファーストビュー直下に3プランカード**（§5）
//   3. 買ったら何が起きるか（相談なしで始まることを先に見せる）
//   4. 実際に使う画面
//   5. よくある質問・キャンセル・問い合わせ
//
// 迷わせないため、プランカード以外にCTAを増やさない。

import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, useLocation, useParams } from 'react-router-dom';
import {
  plansForDisplay, salesPlanView, isPlansPreview, isTimedPlan,
  type SalesPlanConfig, type SalesPlanView,
} from '../../../lib/aiLesson/course/sales/planConfig';
import {
  plansCopy, plansPathFor, purchasePathFor, helpLinkLabel, repurchaseCtaLabel, repurchaseNote,
  type PlansCopy,
} from '../../../lib/aiLesson/course/sales/plansContent';
import { readSimulatedGrants } from '../../../lib/aiLesson/course/sales/localSalesRepository';
import { helpPathFor } from '../../../lib/aiLesson/course/sales/salesHelp';
import { checkoutMode, checkoutNotice, isCheckoutEnabled } from '../../../lib/aiLesson/course/sales/salesEnv';
import { LegalFooterLinks } from '../legal/LegalPage';
import { resolveSalesSession } from '../../../lib/aiLesson/course/sales/salesAccount';
import { trackCourse } from '../../../lib/aiLesson/course/courseAnalytics';

const CheckIcon = () => (
  <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0 mt-0.5 text-lp-coral-deep" aria-hidden="true" fill="currentColor">
    <path d="M8.1 14.4 4 10.3l1.4-1.4 2.7 2.6 6.5-6.5L16 6.4z" />
  </svg>
);

const NoteIcon = () => (
  <svg viewBox="0 0 20 20" className="w-4 h-4 shrink-0 mt-0.5 text-lp-ink-soft" aria-hidden="true" fill="currentColor">
    <path d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.9 12H9.1v-1.8h1.8V14Zm0-3.2H9.1V6h1.8v4.8Z" />
  </svg>
);

const PlanCard = ({
  plan, view, copy, lang, owned,
}: { plan: SalesPlanConfig; view: SalesPlanView; copy: PlansCopy; lang: 'ja' | 'zh'; owned: boolean }) => {
  const timed = isTimedPlan(plan);
  const headingId = `plan-${plan.planId}-name`;
  // 既に買ったことがある人には「買い直す」ではなく「足す・続ける」と言う（§11）
  const repurchaseLabel = owned ? repurchaseCtaLabel(plan.planId, lang, plan.includedActiveMinutes) : null;

  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col rounded-2xl border border-lp-line bg-white p-5 sm:p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id={headingId} className="text-lg font-extrabold text-lp-ink">{view.name}</h3>
          <p className="text-sm text-lp-ink-soft mt-0.5">{view.tagline}</p>
        </div>
        {plan.status === 'draft' && (
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[0.7rem] font-bold text-amber-900">
            {copy.previewBadge}
          </span>
        )}
        {plan.status === 'paused' && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-bold text-slate-700">
            {copy.pausedBadge}
          </span>
        )}
      </div>

      <p className="mt-4 flex items-baseline gap-2">
        <span className="text-[1.9rem] font-extrabold leading-none text-lp-ink">{view.price}</span>
        <span className="text-xs text-lp-ink-soft">{view.taxNote}</span>
      </p>

      {/* 「どこまで使えるか」を金額のすぐ下に置く（§6 usage_scope） */}
      <p className="mt-1.5 text-[0.82rem] text-lp-ink-soft" data-testid={`scope-${plan.planId}`}>
        {/* validityDays は台帳側の期限。学習者が使えるのは
            「購入から startDeadlineDays 日以内に開始 → 開始から validityHours 時間」 */}
        {timed
          ? (lang === 'zh'
              ? `累计${plan.includedActiveMinutes}分钟 ／ ${plan.startDeadlineDays}天内开始・开始后${plan.validityHoursAfterActivation}小时`
              : `累計${plan.includedActiveMinutes}分 ／ ${plan.startDeadlineDays}日以内に開始・開始から${plan.validityHoursAfterActivation}時間`)
          : (lang === 'zh'
              ? `${plan.durationDays}天`
              : `${plan.durationDays}日間`)}
      </p>

      <h4 className="mt-5 text-[0.78rem] font-bold tracking-wide text-lp-ink-soft">{copy.featuresLabel}</h4>
      <ul className="mt-1.5 space-y-1.5">
        {view.features.map((f) => (
          <li key={f} className="flex gap-1.5 text-[0.9rem] leading-relaxed text-lp-ink">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {/* 不利なことを隠さない。ここを畳まないのが信頼設計の要（§6） */}
      <h4 className="mt-5 text-[0.78rem] font-bold tracking-wide text-lp-ink-soft">{copy.limitationsLabel}</h4>
      <ul className="mt-1.5 space-y-1.5">
        {view.limitations.map((l) => (
          <li key={l} className="flex gap-1.5 text-[0.85rem] leading-relaxed text-lp-ink-soft">
            <NoteIcon />
            <span>{l}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 pt-1 mt-auto">
        {view.acceptsPurchase ? (
          <Link
            to={purchasePathFor(lang, plan.planId)}
            onClick={() => trackCourse('plan_selected', { plan_id: plan.planId, cta_mode: view.ctaMode })}
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-lp-coral px-4 text-center font-bold text-white transition hover:bg-lp-coral-deep focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-coral-deep"
          >
            {repurchaseLabel ?? view.ctaLabel}
          </Link>
        ) : (
          <p
            className="flex min-h-12 w-full items-center justify-center rounded-xl bg-slate-100 px-4 text-center text-sm font-bold text-slate-600"
            role="note"
          >
            {view.priceConfirmed ? copy.pausedBadge : copy.priceTbdBadge}
          </p>
        )}
        {repurchaseLabel && (
          <p className="mt-2 text-[0.8rem] leading-relaxed text-lp-ink-soft" data-testid={`repurchase-note-${plan.planId}`}>
            {repurchaseNote(lang)}
          </p>
        )}
      </div>
    </article>
  );
};

export const PlansPage = () => {
  const params = useParams();
  const location = useLocation();
  const lang: 'ja' | 'zh' = params.lang === 'zh' ? 'zh' : 'ja';
  const copy = plansCopy(lang);
  const preview = isPlansPreview(location.search);
  const plans = plansForDisplay(location.search);
  const mode = checkoutMode(location.search);
  const notice = checkoutNotice(mode, lang);

  // 過去に買ったプランを知って、CTAの言い方を変える（§11）。
  // 利用権は**ログインしている本人のもの**しか見ない。
  // 固定IDで引くと、誰の利用権でも「購入済み」に見えてしまう
  // mount時に一度だけ読む。useMemo だと React Compiler がメモ化を保てず、
  // effect で setState すると余分な再描画が入る
  const [ownedPlanIds] = useState<Set<string>>(() => {
    try {
      const session = resolveSalesSession(null, window.sessionStorage, true);
      if (!session) return new Set<string>();
      return new Set(readSimulatedGrants(window.localStorage, session.userId).map((g) => g.planId));
    } catch {
      // 保存領域が使えない環境では「購入済み」を出さないだけにする
      return new Set<string>();
    }
  });

  // ページ表示の計測。SPA内で料金ページへ戻ってきたときも1回ずつ数えたいので
  // モジュール単位の「一度だけ」ではなく、mount単位でガードする（StrictModeの二重実行も吸収）。
  const viewSent = useRef(false);
  useEffect(() => {
    if (viewSent.current) return;
    viewSent.current = true;
    trackCourse('pricing_page_viewed', { lang, plan_count: plans.length });
  }, [lang, plans.length]);

  return (
    <div className="min-h-screen bg-lp-ivory">
      <Helmet>
        <title>{copy.documentTitle}</title>
        <meta name="description" content={copy.metaDescription} />
        {preview && <meta name="robots" content="noindex,nofollow" />}
        <link rel="canonical" href={`https://kawabado.com${plansPathFor(lang)}`} />
        <link rel="alternate" hrefLang="ja" href={`https://kawabado.com${plansPathFor('ja')}`} />
        <link rel="alternate" hrefLang="zh" href={`https://kawabado.com${plansPathFor('zh')}`} />
      </Helmet>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
        <Link to={`/${lang}/ai-course`} className="text-sm underline underline-offset-2 opacity-70">
          {lang === 'zh' ? '返回课程' : 'コースへ戻る'}
        </Link>

        {/* ── 1. ファーストビュー ── */}
        <header className="mt-5 max-w-2xl">
          <h1 className="text-[clamp(1.6rem,5vw,2.4rem)] font-extrabold leading-tight text-lp-ink">
            {copy.heroTitle}
          </h1>
          <p className="mt-4 whitespace-pre-line text-[1rem] leading-relaxed text-lp-ink-soft">
            {copy.heroSubtitle}
          </p>
        </header>

        {notice && (
          <p
            role="note"
            className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[0.85rem] leading-relaxed text-amber-900"
            data-testid="checkout-notice"
          >
            {notice}
          </p>
        )}

        {/* ── 2. ファーストビュー直下に3プラン（§5） ── */}
        <section aria-labelledby="plans-section-heading" className="mt-8">
          {/* 見出しの階層を飛ばさないための h2。視覚的には見出しを増やしたくないので sr-only */}
          <h2 id="plans-section-heading" className="sr-only">{copy.planSectionLabel}</h2>
          <p className="mb-4 text-[0.9rem] leading-relaxed text-lp-ink-soft">{copy.compareNote}</p>
          <div className="grid gap-4 sm:gap-5 lg:grid-cols-3">
            {plans.map((p) => (
              <PlanCard
                key={p.planId}
                plan={p}
                view={salesPlanView(p, lang, isCheckoutEnabled(location.search), isPlansPreview(location.search))}
                copy={copy}
                lang={lang}
                owned={ownedPlanIds.has(p.planId)}
              />
            ))}
          </div>
        </section>

        {/* ── 3. 誰向けか ── */}
        <section className="mt-14 max-w-2xl">
          <h2 className="text-xl font-extrabold text-lp-ink">{copy.whoForHeading}</h2>
          <ul className="mt-3 space-y-2">
            {copy.whoFor.map((w) => (
              <li key={w} className="flex gap-2 text-[0.95rem] leading-relaxed text-lp-ink-soft">
                <CheckIcon />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── 4. 購入後すぐ何が起きるか（§6） ── */}
        <section className="mt-14">
          <h2 className="text-xl font-extrabold text-lp-ink">{copy.afterPurchaseHeading}</h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-lp-ink-soft">{copy.afterPurchaseLead}</p>
          <ol className="mt-4 grid gap-3 sm:grid-cols-2">
            {copy.afterPurchaseSteps.map((s) => (
              <li key={s.title} className="rounded-xl border border-lp-line bg-white p-4">
                <p className="font-bold text-lp-ink">{s.title}</p>
                <p className="mt-1 text-[0.88rem] leading-relaxed text-lp-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ── 5. 実際の画面（実装済みのものだけ・§6） ── */}
        <section className="mt-14">
          <h2 className="text-xl font-extrabold text-lp-ink">{copy.screensHeading}</h2>
          <p className="mt-2 text-[0.95rem] leading-relaxed text-lp-ink-soft">{copy.screensLead}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {copy.screens.map((s) => (
              <li key={s.name} className="rounded-xl border border-lp-line bg-white p-4">
                <p className="font-bold text-lp-ink">{s.name}</p>
                <p className="mt-1 text-[0.88rem] leading-relaxed text-lp-ink-soft">{s.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[0.82rem] leading-relaxed text-lp-ink-soft" data-testid="no-testimonial-note">
            {copy.noTestimonialNote}
          </p>
        </section>

        {/* ── 6. よくある質問（§15 自己解決） ── */}
        <section className="mt-14 max-w-3xl">
          <h2 className="text-xl font-extrabold text-lp-ink">{copy.faqHeading}</h2>
          <dl className="mt-4 space-y-4">
            {copy.faq.map((f) => (
              <div key={f.q} className="rounded-xl border border-lp-line bg-white p-4">
                <dt className="font-bold text-lp-ink">{f.q}</dt>
                <dd className="mt-1 text-[0.9rem] leading-relaxed text-lp-ink-soft">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── 7. 問い合わせ（隠さない・§15） ── */}
        <section className="mt-12 max-w-3xl rounded-xl border border-lp-line bg-white p-5">
          <h2 className="text-base font-extrabold text-lp-ink">{copy.contactHeading}</h2>
          <p className="mt-1 text-[0.9rem] leading-relaxed text-lp-ink-soft">{copy.contactBody}</p>
          <Link
            to={`/${lang}/ai-course/contact`}
            className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-lp-coral px-4 text-sm font-bold text-lp-coral-deep"
          >
            {copy.contactCta}
          </Link>
          <Link
            to={helpPathFor(lang)}
            className="mt-3 ml-2 inline-flex min-h-11 items-center rounded-lg border border-lp-line px-4 text-sm font-bold text-lp-ink-soft"
          >
            {helpLinkLabel(lang)}
          </Link>
        </section>

        <hr className="my-10 border-lp-line" />
        <LegalFooterLinks lang={lang} />
      </main>
    </div>
  );
};

export default PlansPage;
