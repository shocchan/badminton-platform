import type { Lang } from '../../../contexts/LanguageContext';
import { LP } from './lpContent';
import { Reveal, SectionHeading, Check } from './lpUi';
import { imgUrl } from './lpHelpers';
import { UserRound } from 'lucide-react';

/** 人間の日本語コーチ = 安田翔（AIイラストとは別枠。実写を使う） */
export function HumanCoachSection({ lang }: { lang: Lang }) {
  const c = LP.humanCoach;
  return (
    <section id="coach" className="scroll-mt-20 py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <div className="grid md:grid-cols-[.8fr_1.2fr] gap-8 items-center">
          <Reveal>
            {/* 実写写真（人間コーチはAIイラストを使わない）。円形・背景はブランドの淡い緑 */}
            <div className="mx-auto w-[220px] max-w-[70vw] aspect-square rounded-full bg-lp-pine-soft overflow-hidden">
              <img
                src={imgUrl('coach-sho')} width={745} height={725}
                alt={lang === 'ja' ? '日本語コーチの安田翔' : '日语教练安田翔'}
                loading="lazy" decoding="async"
                className="h-full w-full object-cover object-top"
              />
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

/**
 * 受講生：現在は先行モニター。成果は誇張せず事実のみ。
 * カードは配列（LP.testimonials.entries）。将来、モニターの許可を得た
 * 感想・学習期間・変化・利用機能を持つカードをここへ追加していく
 */
export function TestimonialsSection({ lang }: { lang: Lang }) {
  const t = LP.testimonials;
  return (
    <section id="voices" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal><SectionHeading title={t.heading[lang]} lead={t.lead[lang]} /></Reveal>
        <div className="flex flex-col gap-4">
          {t.entries[lang].map((entry, i) => (
            <Reveal key={i} delay={60 + i * 40}>
              <div className="bg-lp-card border border-lp-line rounded-2xl p-6 flex items-start gap-4">
                <span className="inline-flex w-12 h-12 shrink-0 items-center justify-center rounded-full bg-lp-gold-soft">
                  <UserRound className="w-6 h-6 text-lp-coral-deep" aria-hidden="true" />
                </span>
                <div>
                  <span className="inline-block text-[0.78rem] font-extrabold bg-lp-gold-soft text-lp-coral-deep rounded-full px-3 py-0.5 mb-2">{entry.badge}</span>
                  <p className="text-[0.98rem] text-lp-ink leading-relaxed">{entry.text}</p>
                  {/* 将来の拡張枠: 学習期間・変化・利用機能（許可を得た事実のみ表示する） */}
                  {(entry.period || entry.change || entry.used) && (
                    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[0.86rem] text-lp-ink-soft">
                      {entry.period && <div><dt className="inline font-bold">{lang === 'ja' ? '学習期間: ' : '学习时长: '}</dt><dd className="inline">{entry.period}</dd></div>}
                      {entry.change && <div><dt className="inline font-bold">{lang === 'ja' ? '変化: ' : '变化: '}</dt><dd className="inline">{entry.change}</dd></div>}
                      {entry.used && <div><dt className="inline font-bold">{lang === 'ja' ? '利用機能: ' : '使用功能: '}</dt><dd className="inline">{entry.used}</dd></div>}
                    </dl>
                  )}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
