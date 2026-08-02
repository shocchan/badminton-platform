import type { Lang } from '../../../contexts/LanguageContext';
import { LP, type VariantConfig } from './lpContent';
import { Reveal, SectionHeading, Check, CtaButton, ArrowRight } from './lpUi';
import {
  publishedPlans, allPlans, planView, acceptsApplication, type PlanId,
} from '../../../lib/aiLesson/course/plans/planCatalog';

const sym = (s: string) =>
  s === '◯' ? <span className="text-lp-pine font-extrabold">◯</span>
  : s === '△' ? <span className="text-lp-gold font-bold">△</span>
  : <span className="text-lp-ink-soft/50">×</span>;

export function ComparisonSection({ lang }: { lang: Lang }) {
  const c = LP.comparison;
  const [colA, colB, colC] = c.cols[lang];
  return (
    <section id="compare" className="bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal><SectionHeading title={c.heading[lang]} /></Reveal>
        <p className="sm:hidden text-center text-[0.8rem] text-lp-ink-soft mb-2">{lang === 'ja' ? '← 横にスクロールできます →' : '← 可左右滑动 →'}</p>
        <Reveal delay={60}>
          <div className="overflow-x-auto rounded-2xl border border-lp-line bg-lp-card">
            <table className="w-full min-w-[520px] text-center border-collapse">
              <thead>
                <tr className="text-[0.9rem]">
                  <th className="text-left p-3.5 font-bold text-lp-ink-soft"> </th>
                  <th className="p-3.5 font-bold text-lp-ink-soft">{colA}</th>
                  <th className="p-3.5 font-bold text-lp-ink-soft">{colB}</th>
                  <th className="p-3.5 font-extrabold text-lp-coral-deep bg-lp-coral-soft/50 rounded-t-xl">{colC}</th>
                </tr>
              </thead>
              <tbody>
                {c.rows[lang].map((r, i) => (
                  <tr key={i} className="border-t border-lp-line">
                    <td className="text-left p-3.5 text-[0.92rem] text-lp-ink">{r.label}</td>
                    <td className="p-3.5">{sym(r.a)}</td>
                    <td className="p-3.5">{sym(r.b)}</td>
                    <td className="p-3.5 bg-lp-coral-soft/30">{sym(r.c)}</td>
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

export function CourseContentsSection({ lang }: { lang: Lang }) {
  const c = LP.contents;
  return (
    <section id="contents" className="py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal><SectionHeading title={c.heading[lang]} /></Reveal>
        <div className="grid sm:grid-cols-2 gap-3">
          {c.items[lang].map((it, i) => (
            <Reveal key={i} delay={(i % 2) * 50}>
              <div className="flex gap-3 items-start bg-lp-card border border-lp-line rounded-xl px-4 py-3.5">
                <Check className="w-5 h-5 mt-0.5 shrink-0 text-lp-pine" />
                <span className="text-[0.97rem] text-lp-ink">{it}</span>
              </div>
            </Reveal>
          ))}
        </div>
        <p className="text-[0.84rem] text-lp-ink-soft mt-5">{c.betaNote[lang]}</p>
      </div>
    </section>
  );
}

/**
 * 料金セクション。**価格・内容は planCatalog から読む**（ここに数値を書かない）。
 *
 * - 出すのは公開中（published）のプランだけ。draft は `?plans=preview` のときだけ見える
 * - ボタンの行き先は `ctaMode`（apply＝申込フォーム／consult＝個別相談）。
 *   `checkout` は production Stripe を有効化していないので相談へ倒す
 * - キャンセル・返金は商品ごとに違いうるので、断定せず暫定表示を出す
 */
export function PricingSection({ v, lang, onConsult, onApply, preview = false }: {
  v: VariantConfig; lang: Lang; onConsult: () => void;
  onApply: (planId: PlanId) => void;
  /** CEO確認用。draft のプランも並べる */
  preview?: boolean;
}) {
  const p = LP.pricing;
  const plans = (preview ? allPlans() : publishedPlans()).map((x) => ({ cfg: x, view: planView(x, lang) }));
  return (
    <section id="price" className="bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal><SectionHeading title={p.heading[lang]} lead={p.lead[lang]} /></Reveal>

        <div className="flex flex-col gap-7">
          {plans.map(({ cfg, view }, idx) => {
            const accepting = acceptsApplication(cfg);
            return (
              <Reveal key={view.id} delay={60 + idx * 40}>
                <div className="relative bg-lp-card border-2 border-lp-coral rounded-3xl p-7 sm:p-9 shadow-[0_14px_34px_rgba(55,43,38,0.10)]">
                  <span className="absolute -top-3.5 left-8 bg-lp-coral text-white font-extrabold text-[0.82rem] px-4 py-1 rounded-full">
                    {view.name}
                  </span>
                  {/* 準備中・停止中を隠さない（見えているのに申し込めない状態を作らない） */}
                  {view.status !== 'published' && (
                    <span className="absolute -top-3.5 right-8 bg-lp-ink text-white font-bold text-[0.78rem] px-3 py-1 rounded-full">
                      {view.status === 'draft'
                        ? (lang === 'zh' ? '准备中（仅内部可见）' : '準備中（社内確認用）')
                        : (lang === 'zh' ? '暂停接受报名' : '受付を停止中')}
                    </span>
                  )}

                  <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-extrabold text-lp-ink text-[2.1rem] leading-none">{view.priceLabel}</span>
                    <span className="text-lp-ink-soft text-[0.95rem]">{view.durationLabel}</span>
                  </div>
                  {view.monthlyEquivalent && (
                    <p className="text-lp-ink-soft text-[0.95rem] mt-1">{view.monthlyEquivalent}</p>
                  )}
                  <p className="text-lp-ink-soft text-[0.95rem] mt-2">{view.description}</p>

                  <ul className="flex flex-col gap-3 my-6">
                    {view.features.map((it, i) => (
                      <li key={i} className="flex gap-3 items-start text-[0.98rem] text-lp-ink">
                        <Check className="w-5 h-5 mt-0.5 shrink-0 text-lp-pine" />{it}
                      </li>
                    ))}
                  </ul>

                  {accepting ? (
                    <CtaButton
                      variant="primary" fullWidth
                      onClick={() => (view.ctaMode === 'apply' ? onApply(view.id) : onConsult())}
                      event="click_ai_course_consultation"
                      eventParams={{ location: 'pricing', variant: v.key }}
                    >
                      {view.ctaMode === 'apply'
                        ? (lang === 'zh' ? '报名这个方案' : 'このプランに申し込む')
                        : LP.ctaPrimary[lang]}
                      {' '}<ArrowRight />
                    </CtaButton>
                  ) : (
                    <p className="rounded-xl bg-lp-ivory-2 border border-lp-line px-4 py-3 text-[0.9rem] text-lp-ink-soft text-center">
                      {lang === 'zh' ? '目前不接受报名。' : 'いまは申込を受け付けていません。'}
                    </p>
                  )}

                  {/* キャンセル・返金は商品ごとに違いうる。断定しない（法的確認が終わるまで暫定表示） */}
                  <p className="text-[0.82rem] text-lp-ink-soft mt-4">{view.termsNotice}</p>
                </div>
              </Reveal>
            );
          })}
        </div>

        <p className="text-[0.82rem] text-lp-ink-soft mt-5">{p.keyCopy[lang]}</p>
        <p className="text-[0.82rem] text-lp-ink-soft mt-1">{p.disclaimer[lang]}</p>
      </div>
    </section>
  );
}
