import type { Lang } from '../../../contexts/LanguageContext';
import { LP, VARIANTS } from './lpContent';
import { Reveal, SectionHeading, Check } from './lpUi';
import { imgUrl } from './lpHelpers';
import { UserRound } from 'lucide-react';

/** 人間の日本語コーチ = 安田翔（AIイラストとは別枠。実写があれば将来差替え） */
export function HumanCoachSection({ lang }: { lang: Lang }) {
  const c = LP.humanCoach;
  return (
    <section id="coach" className="py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <div className="grid md:grid-cols-[.8fr_1.2fr] gap-8 items-center">
          <Reveal>
            <div className="mx-auto w-[220px] max-w-[70vw] aspect-square rounded-3xl bg-lp-pine-soft grid place-items-center text-lp-pine">
              {/* 実写写真が用意でき次第ここに配置（人間コーチはAIイラストを使わない） */}
              <div className="flex flex-col items-center gap-2">
                <UserRound className="w-16 h-16" aria-hidden="true" />
                <span className="text-sm font-bold">{lang === 'ja' ? '安田 翔' : '安田 翔'}</span>
              </div>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div>
              <span className="inline-flex items-center gap-2 text-[0.8rem] font-extrabold tracking-[0.14em] text-lp-coral-deep">
                <span className="inline-block w-5 h-[3px] rounded bg-lp-coral" aria-hidden="true" />{c.eyebrow[lang]}
              </span>
              <h2 className="mt-2 text-[clamp(1.5rem,4vw,2.1rem)] font-extrabold text-lp-ink">{c.heading[lang]}</h2>
              <p className="mt-3 text-[1.02rem] text-lp-ink-soft leading-relaxed">{c.lead[lang]}</p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {c.facts[lang].map((f, i) => (
                  <li key={i} className="flex gap-2.5 text-[0.97rem] text-lp-ink"><Check className="w-5 h-5 shrink-0 text-lp-pine" />{f}</li>
                ))}
              </ul>
              <p className="mt-4 text-[0.84rem] text-lp-ink-soft">{c.note[lang]}</p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/** AI先生（翔子・悠斗）を両方表示。担当は申込みの方に合わせて決まる */
export function AiTeachersSection({ lang }: { lang: Lang }) {
  const t = LP.aiTeachers;
  const cards = [
    { v: VARIANTS.shoko, ring: 'bg-lp-coral-soft' },
    { v: VARIANTS.yuto, ring: 'bg-lp-pine-soft' },
  ];
  return (
    <section id="teachers" className="bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal><SectionHeading eyebrow={t.eyebrow[lang]} title={t.heading[lang]} lead={t.lead[lang]} /></Reveal>
        <div className="grid sm:grid-cols-2 gap-4">
          {cards.map(({ v, ring }, i) => (
            <Reveal key={v.key} delay={i * 80}>
              <div className="h-full bg-lp-card border border-lp-line rounded-2xl p-6 flex flex-col items-center text-center gap-2">
                <div className={`w-[156px] h-[156px] rounded-full overflow-hidden grid place-items-center ${ring}`}>
                  <img src={imgUrl(v.images.base)} alt={v.name[lang]} loading="lazy" decoding="async" className="w-[118%] h-[118%] object-cover object-top" />
                </div>
                <h3 className="mt-1.5 font-extrabold text-lp-ink text-lg">{v.name[lang]}</h3>
                <p className="text-[0.95rem] text-lp-ink-soft">{v.gender[lang]}（{v.nameSub[lang]}）</p>
                <p className="text-[0.9rem] text-lp-ink-soft">{v.personality[lang]}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/** 受講生：現在は先行モニター（Andy）。成果は誇張せず事実のみ */
export function TestimonialsSection({ lang }: { lang: Lang }) {
  const t = LP.testimonials;
  return (
    <section id="voices" className="py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal><SectionHeading title={t.heading[lang]} lead={t.lead[lang]} /></Reveal>
        <Reveal delay={60}>
          <div className="bg-lp-card border border-lp-line rounded-2xl p-6 flex items-start gap-4">
            <span className="inline-flex w-12 h-12 shrink-0 items-center justify-center rounded-full bg-lp-gold-soft">
              <UserRound className="w-6 h-6 text-lp-coral-deep" aria-hidden="true" />
            </span>
            <div>
              <span className="inline-block text-[0.78rem] font-extrabold bg-lp-gold-soft text-lp-coral-deep rounded-full px-3 py-0.5 mb-2">{t.monitorLabel[lang]}</span>
              <p className="text-[0.98rem] text-lp-ink leading-relaxed">
                {lang === 'ja'
                  ? '現在、先行モニターの学習者が利用を開始しています。学習環境の提供を始めた段階のため、成果の掲載は今後、事実にもとづいて追加します。'
                  : '目前已有先行体验的学员开始使用。由于刚进入提供学习环境的阶段，成果将在今后依据事实陆续补充。'}
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
