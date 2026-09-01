import { useState } from 'react';
import type { Lang } from '../../../contexts/LanguageContext';
import { LP } from './lpContent';
import { Reveal, SectionHeading, Check, CtaButton, ArrowRight } from './lpUi';
import { scrollToSection, track } from './lpHelpers';
import {
  publishedPlans, allPlans, planView, acceptsApplication, RECOMMENDED_BADGE,
  type PlanId, type PlanView,
} from '../../../lib/aiLesson/course/plans/planCatalog';
import { entitlementsFor } from '../../../lib/aiLesson/course/plans/planEntitlements';
import { canStartCheckout, startCheckout } from '../../../lib/aiLesson/course/plans/planCheckout';
import { X as XIcon } from 'lucide-react';

/**
 * 支払い方法の案内（2026-08-23）。
 *
 * 【これは「選択欄」ではない】
 * AIコースの決済は Stripe のホスト型 Checkout へ遷移する方式で、
 * 支払い方法を選ぶ画面は**Stripe側が描画する**（こちらのコードには無い）。
 * `PaymentMethodSelector` はバドミントン大会の申込フォーム専用で、別事業のもの。
 * そのため、ここは「いま何で払えるか／何が準備中か」を**購入前に伝える表示**で、
 * 押して選ぶものではない（押せる見た目にすると、Stripeの画面で選べず混乱する）。
 *
 * 【Stripe側は一切触っていない】
 * Alipay・WeChat Pay は本人確認の承認待ちで capability が無い。
 * Checkout セッションに payment_method_types / payment_method_options を
 * 先に入れると Link 決済が消える事故が過去にあったため、決済ロジックは無変更。
 * 承認が下りたら、ここの `ready: false` を外すのと合わせてStripe側を有効化する。
 */
/*
 * 使える支払い方法（2026-09-01 に絵文字をやめた）。
 *
 * 【なぜ絵文字をやめたか】
 * 支付宝に 🅰️（Aボタンの絵文字。ブランドと無関係）、
 * 微信支付に 💬（汎用の吹き出し）を当てていた。
 * CEOの指摘どおり**偽物に見える**。600円とはいえお金を預ける画面で、
 * 支払いブランドの記号が偽物に見えるのはいちばん効く不信になる。
 *
 * 【本物のロゴを置かない理由】
 * 微信支付の公式素材（pay.weixin.qq.com/material/brand.shtml）を実際に取得して
 * 中を確認した。配布されているのは**作図ガイドのシート**で、きれいなロゴ単体は入っていない。
 * 取り出すにはガイドの図版を切り抜くことになるが、規約が
 * 「図形の分解・改変・文字だけの使用」を禁じている。
 * 規約を外れた素材を置けば、結局また偽物になる。
 *
 * 【いまの形】
 * 記号を置かず、**名前だけを並べる**。名前を書くのは「この方法が使える」と
 * 言っているだけで、ロゴの使用ではない。
 * 本物のロゴは、実際に払う Stripe の決済ページに公式のものが出る。
 * 公式素材を正式に用意できたら、そのときロゴへ差し替える（判断はCEO）。
 */
export const PAYMENT_METHODS: ReadonlyArray<{
  id: string; label: { ja: string; zh: string }; ready: boolean;
}> = [
  { id: 'card',   label: { ja: 'クレジットカード', zh: '信用卡' }, ready: true },
  { id: 'alipay', label: { ja: 'Alipay（支付宝）', zh: '支付宝' }, ready: true },
  { id: 'wechat', label: { ja: 'WeChat Pay（微信支付）', zh: '微信支付' }, ready: true },
];

export function PaymentMethodsNote({ lang }: { lang: Lang }) {
  const pending = PAYMENT_METHODS.filter((m) => !m.ready);
  return (
    <div className="mt-8 rounded-2xl border border-lp-line bg-lp-ivory-2 px-4 py-4">
      <p className="text-[0.82rem] font-extrabold text-lp-ink-soft mb-2.5">
        {lang === 'zh' ? '付款方式' : 'お支払い方法'}
      </p>
      <ul className="flex flex-wrap gap-2">
        {PAYMENT_METHODS.map((m) => (
          <li key={m.id}
            // 押せるものではないと支援技術にも伝える（見た目だけのグレーアウトにしない）
            aria-disabled={!m.ready || undefined}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.88rem] ${
              m.ready
                ? 'border-lp-line bg-lp-card font-bold text-lp-ink'
                : 'border-lp-line/60 bg-lp-card/50 text-lp-ink-soft/60'
            }`}>
            <span>{m.label[lang === 'zh' ? 'zh' : 'ja']}</span>
            {!m.ready && (
              <span className="ml-0.5 rounded-full bg-lp-ink-soft/15 px-1.5 py-0.5 text-[0.72rem] font-bold text-lp-ink-soft/80">
                {lang === 'zh' ? '准备中' : '準備中'}
              </span>
            )}
          </li>
        ))}
      </ul>
      {pending.length > 0 ? (
        <p className="mt-2.5 text-[0.82rem] leading-relaxed text-lp-ink-soft">
          {lang === 'zh'
            ? '支付宝・微信支付正在准备中，目前还不能使用。现在可以用信用卡付款。'
            : 'Alipay・WeChat Payは準備中で、まだご利用いただけません。いまはクレジットカードでお支払いいただけます。'}
        </p>
      ) : (
        /* 表示される決済手段は、国・端末・金額によってStripe側が出し分ける。
           「必ず全部出る」と断定しない（出なかった人に嘘をついたことになる） */
        <p className="mt-2.5 text-[0.82rem] leading-relaxed text-lp-ink-soft">
          {lang === 'zh'
            ? '在支付页面可以看到各支付方式的官方标识并选择。可选项会根据所在地区与设备有所不同。'
            : '決済ページで各社の公式マークを確認して選べます。ご利用の地域・端末によって表示される方法が異なることがあります。'}
        </p>
      )}
    </div>
  );
}

/**
 * 料金セクション。**価格・内容は planCatalog から読む**（ここに数値を書かない）。
 *
 * - 出すのは公開中（published）のプランだけ。draft は `?plans=preview` のときだけ見える
 * - ボタンの行き先は `ctaMode`（apply＝申込フォーム／consult＝無料相談）。
 *   `checkout` は production Stripe を有効化していないので使わない
 * - 6か月伴走コースは recommended（おすすめ）として最も目立たせる
 * - 60分・1か月プランには「含まれないもの」を明示する（人間レッスンが付くと誤解させない）
 * - キャンセル・返金は商品ごとに違いうるので、断定せず暫定表示を出す
 */
export function PricingSection({ lang, onConsult, onApply, preview = false }: {
  lang: Lang; onConsult: () => void;
  onApply: (planId: PlanId) => void;
  /** CEO確認用。draft のプランも並べる */
  preview?: boolean;
}) {
  const p = LP.pricing;
  const plans = (preview ? allPlans() : publishedPlans()).map((x) => ({ cfg: x, view: planView(x, lang) }));
  // オンライン決済（Stripe Checkout）への遷移中プラン。二度押し・二重セッションを防ぐ
  const [checkoutBusy, setCheckoutBusy] = useState<PlanId | null>(null);
  const [checkoutNote, setCheckoutNote] = useState<string | null>(null);

  const handleCta = async (view: PlanView) => {
    if (view.ctaMode === 'consult') { onConsult(); return; }
    // checkout: 環境が有効なら決済へ。無効・失敗時は申込フォームへフォールバック
    const cfg = plans.find((x) => x.cfg.id === view.id)?.cfg;
    if (view.ctaMode === 'checkout' && cfg && canStartCheckout(cfg)) {
      if (checkoutBusy) return;
      setCheckoutBusy(view.id);
      setCheckoutNote(null);
      track('begin_checkout', {
        plan: view.id, value: view.priceJpy ?? undefined, currency: 'JPY', location: 'pricing',
      });
      const r = await startCheckout(view.id, lang === 'zh' ? 'zh' : 'ja');
      if (r.ok) { window.location.href = r.url; return; } // 遷移するので busy は解除しない
      setCheckoutBusy(null);
      // 決済ページを開けなかった回数を数える（2026-08-26）。
      // LPは未ログインなので ai_log_course_event は使えず、GA4側に残す
      track('checkout_open_failed', { plan: view.id, location: 'pricing' });
      setCheckoutNote(lang === 'zh'
        ? '暂时无法打开支付页面。请先通过报名表提交，我们会尽快联系你。'
        : 'いま決済ページを開けませんでした。先に申込フォームでお送りください。こちらからご案内します。');
      onApply(view.id);
      return;
    }
    onApply(view.id);
  };
  return (
    <section id="price" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal><SectionHeading title={p.heading[lang]} lead={p.lead[lang]} /></Reveal>

        <div className="grid lg:grid-cols-3 gap-7 lg:gap-5 items-stretch">
          {plans.map(({ cfg, view }, idx) => {
            const accepting = acceptsApplication(cfg);
            const hot = view.recommended;
            return (
              <Reveal key={view.id} delay={60 + idx * 40} className="h-full">
                <div className={`relative h-full flex flex-col rounded-3xl p-7 bg-lp-card ${
                  hot
                    ? 'border-2 border-lp-coral shadow-[0_14px_34px_rgba(55,43,38,0.14)]'
                    : 'border border-lp-line shadow-[0_8px_22px_rgba(55,43,38,0.07)]'
                }`}>
                  <span className={`absolute -top-3.5 left-7 font-extrabold text-[0.82rem] px-4 py-1 rounded-full ${
                    hot ? 'bg-lp-coral text-white' : 'bg-lp-ink text-white'
                  }`}>
                    {view.name}
                  </span>
                  {hot && (
                    <span className="absolute -top-3.5 right-7 bg-lp-gold text-lp-ink font-extrabold text-[0.78rem] px-3 py-1 rounded-full">
                      {RECOMMENDED_BADGE[lang]}
                    </span>
                  )}
                  {/* 準備中・停止中を隠さない（見えているのに申し込めない状態を作らない） */}
                  {view.status !== 'published' && (
                    <span className="absolute -top-3.5 right-7 bg-lp-ink text-white font-bold text-[0.78rem] px-3 py-1 rounded-full">
                      {view.status === 'draft'
                        ? (lang === 'zh' ? '准备中（仅内部可见）' : '準備中（社内確認用）')
                        : (lang === 'zh' ? '暂停接受报名' : '受付を停止中')}
                    </span>
                  )}

                  <p className="mt-3 text-[0.9rem] font-bold text-lp-pine">{view.audience}</p>
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-extrabold text-lp-ink text-[1.9rem] leading-none">{view.priceLabel}</span>
                    {/* 中国語表示のときだけ参考の元換算（請求は日本円。注記はセクション末尾） */}
                    {view.priceApproxCny && (
                      <span className="font-bold text-lp-ink-soft text-[1rem]">{view.priceApproxCny}</span>
                    )}
                  </div>
                  <p className="text-lp-ink font-bold text-[0.95rem] mt-1.5">{view.durationLabel}</p>
                  {view.monthlyEquivalent && (
                    <p className="text-lp-ink-soft text-[0.9rem] mt-0.5">{view.monthlyEquivalent}</p>
                  )}
                  <p className="text-lp-ink-soft text-[0.95rem] mt-2.5">{view.description}</p>

                  <ul className="flex flex-col gap-2.5 my-5">
                    {view.features.map((it, i) => (
                      <li key={i} className="flex gap-2.5 items-start text-[0.95rem] text-lp-ink">
                        <Check className="w-5 h-5 mt-0.5 shrink-0 text-lp-pine" />{it}
                      </li>
                    ))}
                  </ul>

                  {/* 含まれないもの（60分・1か月）。人間レッスン付きと誤解させない */}
                  {view.notIncluded.length > 0 && (
                    <div className="mb-5 rounded-2xl bg-lp-ivory-2 border border-lp-line px-4 py-3.5">
                      <p className="text-[0.82rem] font-extrabold text-lp-ink-soft mb-2">
                        {lang === 'zh' ? '不包含的内容' : '含まれないもの'}
                      </p>
                      <ul className="flex flex-col gap-1.5">
                        {view.notIncluded.map((it, i) => (
                          <li key={i} className="flex gap-2 items-start text-[0.88rem] text-lp-ink-soft">
                            <XIcon className="w-4 h-4 mt-0.5 shrink-0 text-lp-ink-soft/60" aria-hidden="true" />{it}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="mt-auto">
                    {accepting ? (
                      <CtaButton
                        variant={hot ? 'primary' : 'ghost'} fullWidth
                        disabled={checkoutBusy !== null}
                        onClick={() => void handleCta(view)}
                        event="click_ai_course_plan_cta"
                        eventParams={{
                          plan: view.id, price_label: view.priceLabel,
                          value: view.priceJpy ?? undefined, currency: 'JPY',
                          cta_mode: view.ctaMode, location: 'pricing',
                        }}
                      >
                        {checkoutBusy === view.id
                          ? (lang === 'zh' ? '正在打开支付页面…' : '決済ページへ移動中…')
                          : view.ctaLabel}
                        {checkoutBusy !== view.id && <ArrowRight />}
                      </CtaButton>
                    ) : (
                      <p className="rounded-xl bg-lp-ivory-2 border border-lp-line px-4 py-3 text-[0.9rem] text-lp-ink-soft text-center">
                        {lang === 'zh' ? '目前不接受报名。' : 'いまは申込を受け付けていません。'}
                      </p>
                    )}

                    {/* キャンセル・返金は商品ごとに違いうる。断定しない（法的確認が終わるまで暫定表示） */}
                    <p className="text-[0.8rem] text-lp-ink-soft mt-3.5">{view.termsNotice}</p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>

        {checkoutNote && (
          <p role="alert" className="mt-5 rounded-xl bg-lp-gold-soft border border-lp-gold px-4 py-3 text-[0.9rem] text-lp-ink">
            {checkoutNote}
          </p>
        )}
        {/* 何で払えるか・何が準備中かを、決済へ進む前に伝える（Stripe側の画面は触れない） */}
        <PaymentMethodsNote lang={lang} />
        <p className="text-[0.84rem] text-lp-ink-soft mt-6">{p.keyCopy[lang]}</p>
        <p className="text-[0.84rem] text-lp-ink-soft mt-1">{p.disclaimer[lang]}</p>
        {/* 2回目以降の購入で学習記録を引き継ぐ条件（ログイン中＝自動／ログアウト時＝同じメール） */}
        <p className="text-[0.84rem] text-lp-ink-soft mt-1">{p.accountNote[lang]}</p>
        {/* 決済通貨の注記。元は参考換算にすぎないことを料金表の中で言い切る */}
        {lang === 'zh' && (
          <p className="text-[0.84rem] text-lp-ink-soft mt-1">{LP.currencyNote[lang]}</p>
        )}
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   AIのみ ／ AI＋人間コーチ の比較表
   セルの値は planCatalog / planEntitlements から導出する（手書きの表を持たない）
   ──────────────────────────────────────────────────────────── */

type CompareRow = { label: string; cells: { text: string; on: boolean }[] };

const buildCompareRows = (views: PlanView[], lang: Lang): CompareRow[] => {
  const L = LP.planCompare.rowLabels[lang];
  const C = LP.planCompare.cell[lang];
  const ents = views.map((v) => entitlementsFor(v.id));
  const zh = lang === 'zh';
  return [
    { label: L.price, cells: views.map((v) => ({ text: v.priceLabel, on: true })) },
    {
      label: L.aiTalk,
      cells: ents.map((e) => ({
        text: e.realtimeWindowMinutes !== null
          ? (zh ? `开始后${e.realtimeWindowMinutes}分钟内` : `開始から${e.realtimeWindowMinutes}分間`)
          : e.aiMinutesTotal !== null
            ? (zh ? `累计${e.aiMinutesTotal}分钟` : `累計${e.aiMinutesTotal}分`)
            : C.yes,
        on: e.aiConversation,
      })),
    },
    { label: L.aiFeedback, cells: ents.map(() => ({ text: C.yes, on: true })) },
    { label: L.review, cells: ents.map((e) => ({ text: e.review ? C.yes : C.no, on: e.review })) },
    { label: L.records, cells: ents.map((e) => ({ text: e.learningRecords ? C.yes : C.no, on: e.learningRecords })) },
    {
      label: L.materials,
      cells: ents.map((e) => ({
        text: e.materialsRegionLimit !== null
          ? (zh ? `最初的${e.materialsRegionLimit}个区域` : `最初の${e.materialsRegionLimit}地域まで`)
          : C.yes,
        on: e.materials,
      })),
    },
    { label: L.duration, cells: views.map((v) => ({ text: v.durationLabel, on: true })) },
    { label: L.roadmap, cells: ents.map((e) => ({ text: e.personalRoadmap ? C.yes : C.no, on: e.personalRoadmap })) },
    {
      label: L.lessons,
      cells: ents.map((e) => ({
        text: e.humanLessonCount > 0 ? (zh ? `共${e.humanLessonCount}次` : `全${e.humanLessonCount}回`) : C.no,
        on: e.humanLessonCount > 0,
      })),
    },
    { label: L.humanFeedback, cells: ents.map((e) => ({ text: e.humanFeedback ? C.yes : C.no, on: e.humanFeedback })) },
    { label: L.wechat, cells: ents.map((e) => ({ text: e.wechatConsult ? C.yes : C.no, on: e.wechatConsult })) },
    { label: L.autoRenew, cells: ents.map((e) => ({ text: e.autoRenew ? C.yes : C.none, on: false })) },
  ];
};

export function PlanComparisonSection({ lang }: { lang: Lang }) {
  const c = LP.planCompare;
  const views = publishedPlans().map((p) => planView(p, lang));
  if (views.length === 0) return null;
  const rows = buildCompareRows(views, lang);
  const aiOnlyCount = views.filter((v) => v.lessonCount === 0).length;
  const humanCount = views.length - aiOnlyCount;
  return (
    <section id="compare" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal><SectionHeading title={c.heading[lang]} lead={c.lead[lang]} /></Reveal>
        <p className="sm:hidden text-center text-[0.8rem] text-lp-ink-soft mb-2">{lang === 'ja' ? '← 横にスクロールできます →' : '← 可左右滑动 →'}</p>
        <Reveal delay={60}>
          <div className="overflow-x-auto rounded-2xl border border-lp-line bg-lp-card">
            <table className="w-full min-w-[640px] text-center border-collapse">
              <thead>
                {/* AIのみ／AI＋人間コーチ のグループ行（一目で違いが分かるように） */}
                <tr className="text-[0.82rem]">
                  <th className="p-2" aria-hidden="true" />
                  {aiOnlyCount > 0 && (
                    <th colSpan={aiOnlyCount} className="p-2 font-extrabold text-lp-ink-soft bg-lp-ivory-2 border-b border-lp-line">
                      {c.groupAi[lang]}
                    </th>
                  )}
                  {humanCount > 0 && (
                    <th colSpan={humanCount} className="p-2 font-extrabold text-lp-coral-deep bg-lp-coral-soft/50 border-b border-lp-line">
                      {c.groupHuman[lang]}
                    </th>
                  )}
                </tr>
                <tr className="text-[0.9rem]">
                  <th className="text-left p-3.5 font-bold text-lp-ink-soft"> </th>
                  {views.map((v) => (
                    <th key={v.id} className={`p-3.5 font-extrabold ${v.recommended ? 'text-lp-coral-deep bg-lp-coral-soft/50' : 'text-lp-ink'}`}>
                      {v.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-lp-line">
                    <td className="text-left p-3.5 text-[0.9rem] text-lp-ink">{r.label}</td>
                    {r.cells.map((cell, j) => (
                      <td key={j} className={`p-3.5 text-[0.9rem] ${views[j].recommended ? 'bg-lp-coral-soft/30' : ''} ${
                        cell.on ? 'text-lp-ink font-bold' : 'text-lp-ink-soft'
                      }`}>
                        {cell.text}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
        <p className="text-center text-[0.82rem] text-lp-ink-soft mt-4">{c.note[lang]}</p>
      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────
   あなたに合うプラン（目的別の案内。「向いていない人」で否定して終わらせない）
   ──────────────────────────────────────────────────────────── */

export function PlanFitSection({ lang }: { lang: Lang }) {
  const f = LP.planFit;
  const views = publishedPlans().map((p) => planView(p, lang));
  const goPricing = (planId: string) => {
    track('click_ai_course_fit_to_pricing', { plan: planId, location: 'plan_fit' });
    scrollToSection('price');
  };
  return (
    <section id="fit" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal><SectionHeading title={f.heading[lang]} lead={f.lead[lang]} /></Reveal>
        <div className="grid md:grid-cols-3 gap-4">
          {views.map((v, i) => {
            const bullets = f.byPlan[lang][v.id] ?? [];
            return (
              <Reveal key={v.id} delay={i * 60} className="h-full">
                <div className={`h-full flex flex-col bg-lp-card rounded-2xl p-6 ${v.recommended ? 'border-2 border-lp-coral' : 'border border-lp-line'}`}>
                  <h3 className="font-extrabold text-lp-ink text-[1.05rem]">{v.name}</h3>
                  <p className="text-[0.88rem] text-lp-ink-soft mt-0.5">{v.priceLabel}・{v.durationLabel}</p>
                  <ul className="mt-4 flex flex-col gap-2.5 flex-1">
                    {bullets.map((b, j) => (
                      <li key={j} className="flex gap-2.5 items-start text-[0.95rem] text-lp-ink">
                        <Check className="w-5 h-5 mt-0.5 shrink-0 text-lp-pine" />{b}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => goPricing(v.id)}
                    className="mt-5 inline-flex items-center justify-center gap-1.5 min-h-11 rounded-full border-2 border-lp-pine px-4 py-2 text-[0.92rem] font-extrabold text-lp-pine hover:bg-lp-pine-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-pine"
                  >
                    {f.toPricing[lang]} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </Reveal>
            );
          })}
        </div>

        {/* 6か月コースが向いていない人 → 否定せずAIのみプランへ案内する */}
        <Reveal delay={100}>
          <div className="mt-6 rounded-2xl border border-dashed border-lp-line bg-lp-card p-6">
            <h3 className="font-extrabold text-lp-ink text-[1rem]">{f.notFitHeading[lang]}</h3>
            <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {f.notFitItems[lang].map((b, i) => (
                <li key={i} className="flex gap-2.5 items-start text-[0.92rem] text-lp-ink-soft">
                  <XIcon className="w-4 h-4 mt-1 shrink-0 text-lp-ink-soft/60" aria-hidden="true" />{b}
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[0.95rem] text-lp-ink">
              {f.aiOnlyNote[lang]}{' '}
              <button type="button" onClick={() => goPricing('ai-only')}
                className="inline-flex items-center min-h-11 underline underline-offset-4 font-bold text-lp-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-lp-pine">
                {f.toPricing[lang]}
              </button>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
