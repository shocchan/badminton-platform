// 購入・相談の入口 /:lang/ai-course/plans/:planId。
//
// Phase 1 の役割: 「何を・いくらで・どこまで」を確定して見せ、規約の確認を取るところまで。
// 決済そのもの（test mode）と利用権の自動付与は Phase 2 でこの画面に接続する。
//
// 6か月伴走だけ `ctaMode: 'consult'` なので、この画面は相談申込の入口になる（§14）。

import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import {
  salesPlanById, salesPlanView, acceptsPurchase, isTimedPlan, isPlansPreview,
} from '../../../lib/aiLesson/course/sales/planConfig';
import { plansCopy, plansPathFor } from '../../../lib/aiLesson/course/sales/plansContent';
import { checkoutMode, checkoutNotice, isCheckoutEnabled } from '../../../lib/aiLesson/course/sales/salesEnv';
import { CURRENT_SALES_TERMS_VERSION } from '../../../lib/aiLesson/course/sales/salesTerms';
import type { CompleteCheckoutResult } from '../../../lib/aiLesson/course/sales/checkoutFlow';
import { LegalFooterLinks } from '../legal/LegalPage';
import { CheckoutForm } from './CheckoutForm';
import { PurchaseComplete } from './PurchaseComplete';

const label = (lang: 'ja' | 'zh', ja: string, zh: string) => (lang === 'zh' ? zh : ja);

export const PurchasePage = () => {
  const params = useParams();
  const location = useLocation();
  const lang: 'ja' | 'zh' = params.lang === 'zh' ? 'zh' : 'ja';
  const plan = salesPlanById(params.planId ?? '');
  const copy = plansCopy(lang);
  const [granted, setGranted] = useState<CompleteCheckoutResult | null>(null);

  // 存在しない・非公開のプランのURLを直に叩かれても、行き止まりにせず料金ページへ戻す
  if (!plan || plan.status === 'draft') return <Navigate to={plansPathFor(lang)} replace />;

  const view = salesPlanView(plan, lang, isCheckoutEnabled(location.search), isPlansPreview(location.search));
  const mode = checkoutMode(location.search);
  const notice = checkoutNotice(mode, lang);
  const consult = plan.ctaMode === 'consult';

  // 付与まで終わったら、注文画面ではなく「始められます」の画面に切り替える
  if (granted) {
    return <PurchaseComplete plan={plan} lang={lang} result={granted} />;
  }

  return (
    <div className="min-h-screen bg-lp-ivory">
      <Helmet>
        <title>{`${view.name}｜${copy.documentTitle}`}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <Link to={plansPathFor(lang)} className="text-sm underline underline-offset-2 opacity-70">
          {label(lang, '料金プランへ戻る', '返回价格方案')}
        </Link>

        <h1 className="mt-5 text-2xl font-extrabold text-lp-ink">
          {consult
            ? label(lang, '伴走コースのご相談', '陪伴课程咨询')
            : label(lang, 'お申し込み内容の確認', '确认申请内容')}
        </h1>

        {/* 注文内容。金額・期間・範囲を、決済の直前でもう一度そろえて見せる */}
        <section
          aria-label={label(lang, '注文内容', '订单内容')}
          className="mt-5 rounded-2xl border border-lp-line bg-white p-5"
        >
          <p className="text-lg font-extrabold text-lp-ink">{view.name}</p>
          <p className="mt-1 text-sm text-lp-ink-soft">{view.tagline}</p>

          <dl className="mt-4 space-y-2 text-[0.92rem]">
            <div className="flex justify-between gap-4">
              <dt className="text-lp-ink-soft">{label(lang, '料金', '价格')}</dt>
              <dd className="font-bold text-lp-ink">{view.price}（{view.taxNote}）</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-lp-ink-soft">{label(lang, '使える範囲', '可用范围')}</dt>
              <dd className="text-right text-lp-ink">
                {isTimedPlan(plan)
                  ? label(lang,
                      `累計${plan.includedActiveMinutes}分（${plan.validityDays}日以内）`,
                      `累计${plan.includedActiveMinutes}分钟（${plan.validityDays}天内）`)
                  : label(lang, `${plan.durationDays}日間`, `${plan.durationDays}天`)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-lp-ink-soft">{label(lang, '人間のレッスン', '真人课程')}</dt>
              <dd className="text-lp-ink">
                {plan.humanLessonCount > 0
                  ? label(lang, `${plan.humanLessonCount}回`, `${plan.humanLessonCount}次`)
                  : label(lang, 'なし', '无')}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-lp-ink-soft">{label(lang, '自動更新', '自动续费')}</dt>
              <dd className="text-lp-ink">
                {plan.autoRenew ? label(lang, 'あり', '有') : label(lang, 'なし', '无')}
              </dd>
            </div>
          </dl>
        </section>

        {notice && !consult && (
          <p role="note" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[0.85rem] leading-relaxed text-amber-900">
            {notice}
          </p>
        )}

        {!acceptsPurchase(plan) && (
          <p role="note" className="mt-4 rounded-xl border border-slate-300 bg-slate-50 p-3 text-[0.85rem] text-slate-700">
            {view.priceConfirmed ? copy.pausedBadge : copy.priceTbdBadge}
          </p>
        )}

        {/* 決済が使えるときだけフォームを出す。使えないときは下の流れ説明だけが残る */}
        {!consult && acceptsPurchase(plan) && mode !== 'disabled' && (
          <CheckoutForm
            plan={plan}
            lang={lang}
            mode={mode}
            termsVersion={CURRENT_SALES_TERMS_VERSION}
            onGranted={setGranted}
          />
        )}

        <section className="mt-6 rounded-2xl border border-lp-line bg-white p-5">
          <h2 className="text-base font-extrabold text-lp-ink">
            {consult
              ? label(lang, 'この先の流れ', '接下来的流程')
              : label(lang, 'お支払いのあと', '付款之后')}
          </h2>
          <ol className="mt-3 space-y-2 text-[0.9rem] leading-relaxed text-lp-ink-soft">
            {(consult
              ? [
                  label(lang, 'ご相談の内容をお送りいただきます', '请发送咨询内容'),
                  label(lang, '受付の自動通知メールが届きます', '会收到自动受理通知邮件'),
                  label(lang, '担当が内容を確認してご連絡します', '负责人确认后与你联系'),
                ]
              : [
                  label(lang, 'その場で利用権が付きます（順番待ちはありません）', '当场获得使用权（无需排队）'),
                  label(lang, '目的を選び、現在地を測ります', '选择目的，测量当前位置'),
                  label(lang, 'そのまま学習を始められます', '可以直接开始学习'),
                ]
            ).map((s, i) => (
              <li key={s} className="flex gap-2">
                <span className="font-bold text-lp-coral-deep">{i + 1}.</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        </section>

        <p className="mt-5 text-[0.82rem] leading-relaxed text-lp-ink-soft">
          {label(lang,
            'お申し込みの前に、利用規約・キャンセルポリシー・特定商取引法に基づく表記をご確認ください。',
            '申请前请阅读用户条款、取消政策，以及基于特定商业交易法的标示。')}
        </p>

        <hr className="my-10 border-lp-line" />
        <LegalFooterLinks lang={lang} />
      </main>
    </div>
  );
};

export default PurchasePage;
