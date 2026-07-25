import type { Lang } from '../../../contexts/LanguageContext';
import { LP, type VariantConfig } from './lpContent';
import { Reveal, SectionHeading, Check, CtaButton, ArrowRight } from './lpUi';

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

export function PricingSection({ v, lang, onConsult }: { v: VariantConfig; lang: Lang; onConsult: () => void }) {
  const p = LP.pricing;
  return (
    <section id="price" className="bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal><SectionHeading title={p.heading[lang]} lead={p.lead[lang]} /></Reveal>
        <Reveal delay={60}>
          <div className="relative bg-lp-card border-2 border-lp-coral rounded-3xl p-7 sm:p-9 shadow-[0_14px_34px_rgba(55,43,38,0.10)]">
            <span className="absolute -top-3.5 left-8 bg-lp-coral text-white font-extrabold text-[0.82rem] px-4 py-1 rounded-full">{p.planName[lang]}</span>
            <div className="flex items-baseline gap-1.5 mt-2">
              <span className="font-extrabold text-lp-ink text-2xl">¥</span>
              <span className="font-extrabold text-lp-ink text-[3rem] leading-none tabular-nums">{p.price}</span>
              <span className="text-lp-ink-soft text-[0.95rem]">{p.priceUnit[lang]}</span>
            </div>
            <p className="text-lp-ink-soft text-[0.95rem] mt-1">{p.monthly[lang]}</p>

            <div className="my-6 rounded-2xl bg-lp-gold-soft border border-lp-gold px-4 py-3.5">
              <p className="font-bold text-lp-ink text-[0.98rem]">{p.keyCopy[lang]}</p>
            </div>

            <ul className="flex flex-col gap-3 mb-6">
              {p.includes[lang].map((it, i) => (
                <li key={i} className="flex gap-3 items-start text-[0.98rem] text-lp-ink"><Check className="w-5 h-5 mt-0.5 shrink-0 text-lp-pine" />{it}</li>
              ))}
            </ul>

            <CtaButton variant="primary" fullWidth onClick={onConsult} event="click_ai_course_consultation" eventParams={{ location: 'pricing', variant: v.key }}>
              {LP.ctaPrimary[lang]} <ArrowRight />
            </CtaButton>
            <p className="text-[0.82rem] text-lp-ink-soft mt-4">{p.disclaimer[lang]}</p>
            <p className="text-[0.82rem] text-lp-ink-soft mt-1">{p.note[lang]}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
