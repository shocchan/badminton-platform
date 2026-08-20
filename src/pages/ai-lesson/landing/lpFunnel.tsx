// 料金への導線（2026-08-20 CEO指示「仕組みで売れるように＝転換率を上げる」）。
//
// 改修前の実測（本番 kawabado.com・375px）:
//   ページ全長 16,776px＝約21画面／`#price` は **8.8画面目**／
//   そこへ到達するCTAが**ページ内に1つも無かった**（主CTAは無料相談だけ）。
//   つまり「いくらなのか」を知るには9画面スクロールするしかない状態だった。
//
// ここでは2つだけ足す:
//   ① FV直下の価格プレビュー帯（金額を早く出す＝離脱前に判断材料を渡す）
//   ② スマホの下部固定バー（読んでいる途中のどこからでも料金へ行ける）
// 金額の文字は**カタログからしか取らない**（LPコピーに金額を書かない原則）。
import { useEffect, useState } from 'react';
import type { Lang } from '../../../contexts/LanguageContext';
import { LP } from './lpContent';
import { ArrowRight } from './lpUi';
import { track, scrollToSection } from './lpHelpers';
import { publishedPlans, planView, trialEntryPlan } from '../../../lib/aiLesson/course/plans/planCatalog';

/** 料金セクションへ送る共通処理（イベント名を1か所に固定する） */
const goPricing = (location: string, params: Record<string, unknown> = {}) => {
  track('click_ai_course_to_pricing', { location, ...params });
  scrollToSection('price');
};

/**
 * FV直下の価格プレビュー帯。
 * 3プランの**名前・価格・向いている人**だけを1行ずつ出し、詳細は料金セクションへ送る。
 * ここで買わせない（内容と規約を読まずに決済させない）。あくまで「高いのか安いのか」を先に答える帯。
 */
export function PriceTeaserStrip({ lang, variant }: { lang: Lang; variant: string }) {
  const plans = publishedPlans().map((p) => planView(p, lang));
  if (plans.length === 0) return null;

  return (
    <section aria-labelledby="price-teaser-heading" className="pt-2 pb-6">
      <div className="mx-auto max-w-6xl px-5">
        <div className="rounded-3xl border border-lp-line bg-lp-card px-4 py-5 sm:px-6 sm:py-6">
          <h2 id="price-teaser-heading"
            className="inline-flex items-center gap-2 text-[0.8rem] font-extrabold tracking-[0.14em] text-lp-coral-deep">
            <span className="inline-block w-5 h-[3px] rounded bg-lp-coral" aria-hidden="true" />
            {LP.priceTeaser.eyebrow[lang]}
          </h2>

          <ul className="mt-4 grid gap-2 sm:grid-cols-3">
            {plans.map((p) => (
              <li key={p.id}>
                {/*
                  行ぜんぶを押せるようにする（スマホで価格の数字だけを狙わせない）。
                  遷移先は料金セクション＝そこで内容・規約を読んでから決済へ進む
                */}
                <button type="button"
                  onClick={() => goPricing('price_teaser', { plan: p.id, variant })}
                  className="w-full text-left rounded-2xl border border-lp-line bg-lp-ivory px-4 py-3 min-h-11 transition-colors hover:border-lp-coral hover:bg-lp-coral-soft/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-pine">
                  {/*
                    価格を先頭・最大に置く（この帯の仕事は「高いのか安いのか」に先に答えること）。
                    名前と価格を横並びにすると長い商品名（6か月コース）が「コ／ース」で折れるため、
                    幅に関係なく縦積みで固定する
                  */}
                  <span className="block font-extrabold text-[1.1rem] leading-none text-lp-coral-deep">{p.priceLabel}</span>
                  <span className="mt-1.5 block font-extrabold text-[0.9rem] text-lp-ink">{p.name}</span>
                  <span className="mt-0.5 block text-[0.78rem] text-lp-ink-soft leading-snug">{p.audience}</span>
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p className="text-[0.8rem] text-lp-ink-soft">{LP.priceTeaser.note[lang]}</p>
            <button type="button"
              onClick={() => goPricing('price_teaser_more', { variant })}
              className="inline-flex items-center gap-1.5 min-h-11 text-[0.9rem] font-bold text-lp-pine underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-lp-pine">
              {LP.priceTeaser.cta[lang]} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * スマホ下部の固定CTAバー。
 * - FVを読み終えたあたり（600px超）で出す。最初から出すとFVのCTAと二重になる
 * - **料金セクションを読んでいる間は引っ込める**（案内先を自分で隠さない）
 * - 非表示のときも DOM には残す（transitionのため）が、`aria-hidden` と `tabIndex=-1` で
 *   支援技術・キーボードからは触れない状態にする
 */
export function LpStickyCta({ lang, variant, onConsult }: {
  lang: Lang; variant: string; onConsult: () => void;
}) {
  const trial = trialEntryPlan(lang);
  const [show, setShow] = useState(false);

  useEffect(() => {
    let scrolled = false;
    let atPricing = false;
    const apply = () => setShow(scrolled && !atPricing);

    const onScroll = () => {
      const next = window.scrollY > 600;
      if (next === scrolled) return;
      scrolled = next;
      apply();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    // 料金セクションが視界にある間は隠す
    const el = document.getElementById('price');
    let io: IntersectionObserver | null = null;
    if (el && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((es) => {
        atPricing = es[0].isIntersecting;
        apply();
      }, { rootMargin: '0px 0px -25% 0px' });
      io.observe(el);
    }
    return () => { window.removeEventListener('scroll', onScroll); io?.disconnect(); };
  }, []);

  if (!trial) return null;
  // 隠れているあいだはフォーカスを奪わせない
  const off = show ? {} : { tabIndex: -1 };

  return (
    <div
      data-lp-sticky-cta
      aria-hidden={!show}
      className={`sm:hidden fixed inset-x-0 bottom-0 z-40 border-t border-lp-line bg-lp-ivory/95 backdrop-blur transition-all duration-200 ${
        show ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="px-4 pt-2 pb-2.5">
        <p className="text-[0.72rem] font-bold text-lp-ink-soft">{LP.stickyBar.note[lang]}</p>
        <div className="mt-1.5 flex items-center gap-2">
          <button type="button" {...off}
            onClick={() => goPricing('sticky', { plan: trial.id, variant })}
            className="flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 min-h-11 rounded-full bg-lp-coral px-4 text-white font-extrabold text-[0.95rem] shadow-[0_4px_0_var(--color-lp-coral-deep)] active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-pine">
            <span className="truncate">{LP.ctaTrial[lang].replace('{price}', trial.priceLabel)}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>
          <button type="button" {...off}
            onClick={() => { track('click_ai_course_consultation', { location: 'sticky', variant }); onConsult(); }}
            className="shrink-0 inline-flex items-center justify-center min-h-11 rounded-full border-2 border-lp-pine px-4 font-extrabold text-[0.9rem] text-lp-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-pine">
            {LP.stickyBar.consult[lang]}
          </button>
        </div>
      </div>
    </div>
  );
}
