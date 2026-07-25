import type { Lang } from '../../../contexts/LanguageContext';
import { LP, type VariantConfig } from './lpContent';
import { CtaButton, ArrowRight } from './lpUi';
import { imgUrl } from './lpHelpers';

export function AiCourseHero({ v, lang, onConsult, onSeeApp }: {
  v: VariantConfig; lang: Lang; onConsult: () => void; onSeeApp: () => void;
}) {
  const [l1, l2, l3] = LP.heroTitleLines[lang];
  const hl = LP.heroHighlight[lang];
  const sub = LP.heroSub[lang].replace('翔子先生', v.name[lang]).replace('AIチューター', v.name[lang]);
  const [bw, bh] = v.imageSize.wave;

  // 強調語をハイライト付きで差し込む
  const renderLine = (line: string) =>
    line.includes(hl)
      ? <>{line.split(hl)[0]}<span className="relative whitespace-nowrap text-lp-coral-deep">
          <span className="relative z-10">{hl}</span>
          <span className="absolute left-[-2%] right-[-2%] bottom-[0.05em] h-[0.34em] rounded bg-lp-gold/85 -rotate-1 z-0" aria-hidden="true" />
        </span>{line.split(hl)[1]}</>
      : line;

  return (
    <section className="pt-8 sm:pt-12 pb-4">
      <div className="mx-auto max-w-6xl px-5">
        <div className="grid md:grid-cols-[1.05fr_.95fr] gap-10 items-center">
          {/* copy */}
          <div className="text-center md:text-left">
            <span className="inline-flex items-center gap-2 text-[0.8rem] font-extrabold tracking-[0.14em] text-lp-coral-deep">
              <span className="inline-block w-5 h-[3px] rounded bg-lp-coral" aria-hidden="true" />
              {LP.eyebrow[lang]}
            </span>
            <h1 className="mt-4 font-extrabold text-lp-ink text-[clamp(2rem,6vw,3.4rem)] leading-[1.24] text-balance">
              <span className="block">{renderLine(l1)}</span>
              <span className="block">{renderLine(l2)}</span>
              <span className="block">{renderLine(l3)}</span>
            </h1>
            <p className="mt-5 text-[1.1rem] text-lp-ink-soft leading-relaxed max-w-[30em] mx-auto md:mx-0">{sub}</p>
            <div className="mt-7 flex flex-wrap gap-3.5 justify-center md:justify-start">
              <CtaButton variant="primary" onClick={onConsult} event="click_ai_course_consultation" eventParams={{ location: 'hero', variant: v.key }}>
                {LP.ctaPrimary[lang]} <ArrowRight />
              </CtaButton>
              <CtaButton variant="ghost" onClick={onSeeApp} event="click_ai_course_demo" eventParams={{ location: 'hero', variant: v.key }}>
                {LP.ctaSecondary[lang]}
              </CtaButton>
            </div>
            <ul className="mt-6 flex flex-wrap gap-2.5 justify-center md:justify-start">
              {LP.heroChips[lang].map((c) => (
                <li key={c} className="inline-flex items-center gap-1.5 text-[0.86rem] font-bold text-lp-pine bg-lp-pine-soft rounded-full px-3.5 py-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-lp-pine" aria-hidden="true" />{c}
                </li>
              ))}
            </ul>
          </div>

          {/* art */}
          <div className="relative flex justify-center">
            <div className="absolute inset-0 m-auto w-[108%] max-w-[520px] aspect-square rounded-full bg-lp-coral-soft/70 blur-[2px]" aria-hidden="true" />
            <img
              src={imgUrl(v.images.wave)} width={bw} height={bh}
              alt={lang === 'ja' ? `${v.name.ja}が笑顔で手をふって歓迎している` : `${v.name.zh}微笑着挥手欢迎`}
              fetchPriority="high" decoding="async"
              className="relative z-10 w-[min(420px,82vw)] h-auto drop-shadow-[0_24px_30px_rgba(55,43,38,0.12)]"
            />
            <div className="absolute z-20 top-[4%] left-[-2%] sm:left-[-4%] bg-lp-card border-2 border-lp-ink text-lp-ink font-bold text-[0.9rem] leading-snug px-3.5 py-2.5 rounded-[18px_18px_18px_4px] shadow-[4px_5px_0_var(--color-lp-ink)] max-w-[14em] whitespace-pre-line">
              {v.hero.bubble[lang]}
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2.5 rounded-2xl border border-dashed border-lp-gold bg-lp-gold-soft px-4 py-3 text-[0.86rem] text-lp-ink">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0">
            <path d="M12 9v4m0 4h.01M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="var(--color-lp-coral-deep)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>{LP.mockNote[lang]}</span>
        </div>
      </div>
    </section>
  );
}
