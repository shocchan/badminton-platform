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
import { LP, type VariantConfig } from './lpContent';
import { Reveal, SectionHeading } from './lpUi';
import { AiHumanRoles } from './sectionsA';

/**
 * 2026-09-11 LP圧縮: 「AIだけでは足りない理由（2つ）」と「人が方向を決め、AIが毎日支える（役割）」を
 * 1つの節にした。以前は同じ主張を別々の節で2回（比較表を入れると3回）言っていた。
 */
const GAPS_SHOW = 2;

export function WhyNotAiOnlySection({ v, lang }: { v: VariantConfig; lang: Lang }) {
  const w = LP.whyNotAiOnly;
  const items = w.items[lang].slice(0, GAPS_SHOW);
  return (
    <section id="why-not-ai-only" className="scroll-mt-20 bg-lp-ivory-2 py-12 sm:py-20">
      <div className="mx-auto max-w-4xl px-5">
        <Reveal><SectionHeading title={w.heading[lang]} lead={w.lead[lang]} /></Reveal>

        <ul className="divide-y divide-lp-line border-y border-lp-line">
          {items.map((it, i) => (
            <li key={it.gap} className="py-4">
              <p className="flex items-start gap-3">
                <span aria-hidden="true"
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-lp-coral-soft text-[0.78rem] font-extrabold text-lp-coral-deep">
                  {i + 1}
                </span>
                <span className="font-extrabold text-[1.05rem] text-lp-ink leading-snug">{it.gap}</span>
              </p>
              <p className="mt-1.5 pl-9 text-[1rem] leading-relaxed text-lp-ink-soft">{it.body}</p>
            </li>
          ))}
        </ul>

        {/* 答え: 人が方向・AIが毎日（旧・役割の節をここへ統合） */}
        <Reveal delay={60}><AiHumanRoles v={v} lang={lang} /></Reveal>

        {/* 次のセクション（コーチ紹介）へ渡す一文。ここが順番の意味を言葉にしている */}
        <Reveal delay={110}>
          <p className="mt-6 rounded-2xl bg-lp-pine-soft/40 border border-lp-pine/25 px-5 py-4 text-center text-[1rem] font-bold leading-relaxed text-lp-ink">
            {w.close[lang]}
          </p>
        </Reveal>
      </div>
    </section>
  );
}
