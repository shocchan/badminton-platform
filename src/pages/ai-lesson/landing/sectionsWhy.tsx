// 「AI会話アプリだけでは足りない理由」（2026-08-26 CEO指示 Phase S3）。
//
// 【なぜ足すか】
// 中国語圏には、AI日本語会話の練習アプリが安く大量にある（年額数百元・シーン数万規模）。
// この商品を初めて見た人は、まず**それと同じもの**として値段を比べる。
// そこで負ける勝負をしているのに、LPは「AIで話せます」から始まっていた。
//
// 【書き方の約束】
// - 競合の名前を出さない。攻撃しない。
// - 事実だけ書く。「他社は続かない」ではなく「会話の外に理由がある」と言う。
// - このセクションの最後は、人間コーチの紹介へ渡す（順番そのものが主張）。
//
// 文言は lpContent.ts が正準。ここには文章も金額も書かない。
import type { Lang } from '../../../contexts/LanguageContext';
import { LP } from './lpContent';
import { Reveal, SectionHeading } from './lpUi';

export function WhyNotAiOnlySection({ lang }: { lang: Lang }) {
  const w = LP.whyNotAiOnly;
  const items = w.items[lang];
  return (
    <section id="why-not-ai-only" className="scroll-mt-20 bg-lp-ivory-2 py-16 sm:py-24">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal><SectionHeading title={w.heading[lang]} lead={w.lead[lang]} /></Reveal>

        <ul className="flex flex-col gap-3">
          {items.map((it, i) => (
            <Reveal key={it.gap} delay={60 + i * 45}>
              <li className="rounded-3xl bg-lp-card border border-lp-line p-5 sm:p-6">
                <p className="flex items-start gap-3">
                  {/* 番号は順位ではなく「4つある」ことを示すだけ。装飾で数字を増やさない */}
                  <span aria-hidden="true"
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lp-coral-soft text-[0.78rem] font-extrabold text-lp-coral-deep">
                    {i + 1}
                  </span>
                  <span className="font-extrabold text-lp-ink leading-snug">{it.gap}</span>
                </p>
                <p className="mt-2 pl-9 text-[0.95rem] leading-relaxed text-lp-ink-soft">{it.body}</p>
              </li>
            </Reveal>
          ))}
        </ul>

        {/* 次のセクション（コーチ紹介）へ渡す一文。ここが順番の意味を言葉にしている */}
        <Reveal delay={110}>
          <p className="mt-6 rounded-2xl bg-lp-pine-soft/40 border border-lp-pine/25 px-5 py-4 text-center text-[0.98rem] font-bold leading-relaxed text-lp-ink">
            {w.close[lang]}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
