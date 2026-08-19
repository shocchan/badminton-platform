import type { Lang } from '../../../contexts/LanguageContext';
import { LP, VARIANTS, type VariantConfig } from './lpContent';
import { CtaButton, ArrowRight } from './lpUi';
import { imgUrl, scrollToSection } from './lpHelpers';

export function AiCourseHero({ v, lang, onConsult, duo = false }: {
  v: VariantConfig; lang: Lang; onConsult: () => void;
  /**
   * 既定LP（/shoko /yuto の広告variantでない入口）では**二人のAI先生を並べる**。
   * 1人だけ出すと「最初にどちらを選ぶのか」が分からないうえ、
   * 女性の先生だけが前面に出ると男性の先生を選べることが伝わらない（CEO指示 2026-08-07）
   */
  duo?: boolean;
}) {
  const [l1, l2, l3] = LP.heroTitleLines[lang];
  const hl = LP.heroHighlight[lang];
  // heroSub は variant名を含まない文になったので、duo/variantで差し替えるものが無い
  const sub = LP.heroSub[lang];
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
            {/* 人×AIの役割宣言（2026-08-19 CEO依頼: FVで安田翔とともに最も強調するメッセージ） */}
            <p className="mt-5 inline-block rounded-xl bg-lp-pine text-white font-extrabold text-[1.02rem] px-4 py-2">
              {LP.heroKeyMessage[lang]}
            </p>
            <p className="mt-4 text-[1.08rem] text-lp-ink-soft leading-relaxed max-w-[30em] mx-auto md:mx-0">{sub}</p>
            <div className="mt-7 flex flex-wrap gap-3.5 justify-center md:justify-start">
              <CtaButton variant="primary" onClick={onConsult} event="click_ai_course_consultation" eventParams={{ location: 'hero', variant: v.key }}>
                {LP.ctaPrimary[lang]} <ArrowRight />
              </CtaButton>
              {/* 学習システムのセクションへスクロール（URL・履歴は変えない。
                  以前はログイン用の ?app=1 へ遷移してしまい「見るだけ」ができなかった） */}
              <CtaButton
                variant="ghost"
                onClick={() => scrollToSection('features')}
                event="click_ai_course_see_system"
                eventParams={{ location: 'hero', variant: v.key }}
              >
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
          {duo ? (
            /*
              既定LPは3人（人間のコーチ＋AIチューター2人）。
              **中央のコーチだけ実写**なのは意図的なデザイン（CEO決定 2026-08-08）:
              人間＝写真・AI＝イラストの描き分けが「人×AIの両輪」という商品構造を
              1枚で説明する。コーチをイラスト化すると人間まで架空に見えて信頼を損なう。
              ラベルで役割を言い切ることで「なぜ画風が違うのか」への答えを絵の中に置く
            */
            // pt で吹き出しの場所を先に確保する（人物の顔に吹き出しを被せない）
            <div className="relative pt-16 sm:pt-14">
              <div className="absolute inset-0 m-auto w-[108%] max-w-[560px] aspect-square rounded-full bg-lp-coral-soft/70 blur-[2px]" aria-hidden="true" />
              <div className="relative z-10 flex items-end justify-center">
                <figure className="m-0 shrink-0 text-center">
                  <img
                    src={imgUrl(VARIANTS.shoko.images.wave)}
                    width={VARIANTS.shoko.imageSize.wave[0]} height={VARIANTS.shoko.imageSize.wave[1]}
                    alt={lang === 'ja' ? '翔子先生が笑顔で手をふって歓迎している' : '翔子老师微笑着挥手欢迎'}
                    decoding="async"
                    className="w-[min(185px,30vw)] h-auto drop-shadow-[0_24px_30px_rgba(55,43,38,0.12)]"
                  />
                  <figcaption className="mt-1 inline-block rounded-full bg-lp-card border border-lp-line px-2.5 py-0.5 text-[0.76rem] font-bold text-lp-ink whitespace-nowrap">
                    {VARIANTS.shoko.name[lang]}
                    <span className="ml-1 font-normal text-lp-ink-soft">{lang === 'zh' ? 'AI辅导老师' : 'AIチューター'}</span>
                  </figcaption>
                </figure>
                {/* 中央: 人間のコーチ（実写・少し大きく手前） */}
                <figure className="m-0 -mx-10 shrink-0 relative z-10 text-center">
                  {/*
                    写真は胸から上のトリミング（745x725）でイラスト2人（縦長）より背が低く
                    見えるため、頭の位置が2人よりわずかに上に来る幅にする
                    （250px時代は頭が2人より下がり、コーチが一番小柄に見えていた）
                  */}
                  <img
                    src={imgUrl('coach-sho')} width={745} height={725}
                    alt={lang === 'ja' ? 'コーチの安田翔' : '教练安田翔'}
                    fetchPriority="high" decoding="async"
                    className="w-[min(292px,50vw)] h-auto drop-shadow-[0_24px_30px_rgba(55,43,38,0.16)]"
                  />
                  <figcaption className="mt-1 inline-block rounded-full bg-lp-ink px-3 py-1 text-[0.82rem] font-bold text-white whitespace-nowrap">
                    {lang === 'zh' ? '安田翔' : '安田 翔'}
                    <span className="ml-1 font-normal text-white/80">{lang === 'zh' ? '真人教练' : '人間のコーチ'}</span>
                  </figcaption>
                </figure>
                <figure className="m-0 shrink-0 text-center">
                  <img
                    src={imgUrl(VARIANTS.yuto.images.wave)}
                    width={VARIANTS.yuto.imageSize.wave[0]} height={VARIANTS.yuto.imageSize.wave[1]}
                    alt={lang === 'ja' ? '悠斗先生が笑顔で手をふって歓迎している' : '悠斗老师微笑着挥手欢迎'}
                    decoding="async"
                    className="w-[min(185px,30vw)] h-auto drop-shadow-[0_24px_30px_rgba(55,43,38,0.12)]"
                  />
                  <figcaption className="mt-1 inline-block rounded-full bg-lp-card border border-lp-line px-2.5 py-0.5 text-[0.76rem] font-bold text-lp-ink whitespace-nowrap">
                    {VARIANTS.yuto.name[lang]}
                    <span className="ml-1 font-normal text-lp-ink-soft">{lang === 'zh' ? 'AI辅导老师' : 'AIチューター'}</span>
                  </figcaption>
                </figure>
              </div>
              <div className="absolute z-20 top-0 left-[-2%] sm:left-[-4%] bg-lp-card border-2 border-lp-ink text-lp-ink font-bold text-[0.9rem] leading-snug px-3.5 py-2.5 rounded-[18px_18px_18px_4px] shadow-[4px_5px_0_var(--color-lp-ink)] max-w-[14em] whitespace-pre-line">
                {lang === 'zh' ? '我和两位AI老师，\n陪你走半年！' : '私とAIの先生2人で、\n半年伴走します！'}
              </div>
            </div>
          ) : (
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
          )}
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
