// 日本生活の利用シーンと、600円体験の中身（2026-08-26 新設）。
//
// 【なぜ足すか】
// LPが「AI会話ができます」「N2文法178項目」という**機能の説明**に寄っていて、
// 「日本で実際に使えた」という手ざわりが1つも書かれていなかった。
// 読む人（在日の中国語話者）が自分の生活を思い浮かべられるようにする。
//
// 文言は lpContent.ts が正準。ここには文章も金額も書かない。
import type { Lang } from '../../../contexts/LanguageContext';
import { LP } from './lpContent';
import { Reveal, SectionHeading, Check } from './lpUi';

/** 日本生活の利用シーン。場面 → そこで言う日本語 → 何を練習するか の順で読ませる */
export function LifeScenesSection({ lang }: { lang: Lang }) {
  const s = LP.scenes;
  const items = s.items[lang];
  return (
    <section id="scenes" className="scroll-mt-20 bg-lp-ivory py-16 sm:py-24">
      <div className="mx-auto max-w-5xl px-5">
        <Reveal><SectionHeading title={s.heading[lang]} lead={s.lead[lang]} /></Reveal>

        <div className="grid sm:grid-cols-2 gap-5">
          {items.map((it, i) => (
            <Reveal key={it.place} delay={60 + i * 50} className="h-full">
              <div className="h-full flex flex-col rounded-3xl bg-lp-card border border-lp-line p-6 shadow-[0_8px_22px_rgba(55,43,38,0.06)]">
                <p className="flex items-center gap-2 text-[0.92rem] font-extrabold text-lp-pine">
                  <span aria-hidden="true" className="text-xl">{it.icon}</span>
                  {it.place}
                </p>
                {/* そこで実際に言う日本語。ここがいちばん「自分ごと」になる */}
                <p className="mt-3 rounded-2xl bg-lp-ivory-2 border border-lp-line px-4 py-3 text-lp-ink font-bold leading-relaxed">
                  {it.line}
                </p>
                <p className="mt-3 text-[0.95rem] text-lp-ink-soft leading-relaxed">{it.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * 600円の体験で起きること。
 * 「60分」という数字だけでは何が手に入るか分からないので、学習の一周を順に見せる。
 */
export function TrialContentsSection({ lang }: { lang: Lang }) {
  const t = LP.trialContents;
  return (
    <section id="trial-contents" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-5">
        <Reveal><SectionHeading title={t.heading[lang]} lead={t.lead[lang]} /></Reveal>

        <Reveal delay={60}>
          <ol className="rounded-3xl bg-lp-card border border-lp-line divide-y divide-lp-line overflow-hidden">
            {t.steps[lang].map((step, i) => (
              <li key={step} className="flex items-start gap-3.5 px-5 py-4">
                <span aria-hidden="true"
                  className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-lp-pine-soft text-[0.85rem] font-extrabold text-lp-pine">
                  {i + 1}
                </span>
                <span className="text-[0.98rem] leading-relaxed text-lp-ink">{step}</span>
              </li>
            ))}
          </ol>
        </Reveal>

        {/* 「設定してるうちに時間が減るのでは」という不安を先に消す。
            実装もそうなっている（時計は「体験を始める」から） */}
        <Reveal delay={110}>
          <p className="mt-5 flex items-start gap-2 rounded-2xl bg-lp-pine-soft/40 border border-lp-pine/25 px-4 py-3.5 text-[0.92rem] leading-relaxed text-lp-ink">
            <Check className="mt-0.5 h-5 w-5 shrink-0 text-lp-pine" />
            {t.note[lang]}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
