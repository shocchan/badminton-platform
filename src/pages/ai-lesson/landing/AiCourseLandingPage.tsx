import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LP, VARIANTS, type CharacterVariant } from './lpContent';
import { CtaButton } from './lpUi';
import { track, loginPath, scrollToSection } from './lpHelpers';
import { AiCourseHero } from './AiCourseHero';
import { PriceTeaserStrip, LpStickyCta } from './lpFunnel';
import { PainPointsSection, AiHumanRolesSection, DailyLearningFlow } from './sectionsA';
import { PlatformFeatures, SixMonthRoadmap } from './sectionsB';
import { HumanCoachSection, TestimonialsSection } from './sectionsC';
import { PricingSection, PlanComparisonSection, PlanFitSection } from './sectionsD';
import { FaqSection, FinalCtaSection, ConsultationModal } from './sectionsE';
import { ApplicationModal } from './ApplicationModal';
import { isPlanPreview, publishedPlans, type PlanId } from '../../../lib/aiLesson/course/plans/planCatalog';
import { LegalFooterLinks } from '../legal/LegalPage';

const SITE = 'https://kawabado.com';

export function AiCourseLandingPage({ variant = 'shoko', noindex = false, duo = false }: {
  variant?: CharacterVariant; noindex?: boolean;
  /** 既定LPでは二人のAI先生を並べる（/shoko /yuto の広告variantは従来どおり1人） */
  duo?: boolean;
}) {
  const { lang } = useLanguage();
  const v = VARIANTS[variant];
  const [consultOpen, setConsultOpen] = useState(false);
  const openConsult = () => setConsultOpen(true);
  // 申込フォーム。プランの ctaMode が 'apply' のときだけ開く
  const [applyPlanId, setApplyPlanId] = useState<PlanId | null>(null);
  // CEO確認用。draft のプランも料金セクションに並べる（学習者には見せない）
  const planPreview = typeof window !== 'undefined' && isPlanPreview(window.location.search);

  // view は1マウント1回だけ（StrictModeの二重呼び出しでも重複させない）
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    track('view_ai_course_lp', { variant: v.key, lang });
    // Stripe Checkout から「戻る」で帰ってきた（購入中断）。cancel_url が付ける印
    if (new URLSearchParams(window.location.search).get('checkout') === 'cancelled') {
      track('cancel_ai_course_checkout', { variant: v.key });
    }
  }, [v.key, lang]);

  /**
   * `#price` などのアンカー付きで来たら、その節までスクロールする（2026-08-20）。
   *
   * ブラウザ標準のアンカー移動は効かない: ①SPAなので描画前にハッシュ解決が終わる
   * ②共通の ScrollToTop がルート変更時に必ず先頭へ戻す。
   * そのため「料金プランを見る」で来た人が毎回LPの先頭に落ちていた。
   */
  useEffect(() => {
    const id = window.location.hash.replace('#', '');
    if (!id) return;
    // レイアウトが決まってから（画像・Reveal込み）。2回試すのは初回描画で高さが変わるため
    const t1 = window.setTimeout(() => scrollToSection(id), 120);
    const t2 = window.setTimeout(() => scrollToSection(id), 600);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  // 料金セクション到達（1マウント1回）。どれだけの人が価格まで読み進めたかを見る
  useEffect(() => {
    const el = document.getElementById('price');
    if (!el || !('IntersectionObserver' in window)) return;
    let sent = false;
    const io = new IntersectionObserver((es) => {
      if (sent || !es[0].isIntersecting) return;
      sent = true;
      track('view_ai_course_pricing', {
        variant: v.key, plans: publishedPlans().map((p) => p.id).join(','),
      });
      io.disconnect();
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, [v.key]);

  const path = variant === 'shoko' && !noindex ? 'ai-course' : `ai-course/${variant}`;
  const canonical = `${SITE}/${lang}/ai-course`; // variantは主ページへ集約
  const other = lang === 'ja' ? 'zh' : 'ja';

  // 既定LP（duo）は特定の先生の名前をタイトルにしない（二人から選べることが売りのため）
  const seoTitle = duo
    ? (lang === 'zh'
      ? '你的日语搭档｜用半年，告别「看得懂却说不出」'
      : '日本語の相棒｜読めるのに話せないを、半年で終わらせる')
    : v.seo.title[lang];

  const courseSchema = {
    '@context': 'https://schema.org', '@type': 'Course',
    name: seoTitle, description: v.seo.description[lang],
    provider: { '@type': 'Organization', name: 'kawabado', url: SITE },
    inLanguage: lang === 'ja' ? 'ja' : 'zh-Hans',
    // Google の Course リッチリザルトは hasCourseInstance が無いと対象にならない。
    // 実態（オンライン・随時開始・半年伴走）とズレない範囲だけ書く。
    // 価格はプランが複数あり未確定のものも混ざるため、offers はあえて出さない
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: 'PT20M',
      inLanguage: lang === 'ja' ? 'ja' : 'zh-Hans',
    },
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: lang === 'zh' ? '首页' : 'ホーム', item: `${SITE}/${lang}/` },
      { '@type': 'ListItem', position: 2, name: seoTitle, item: canonical },
    ],
  };
  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: LP.faq.items[lang].map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  const login = loginPath(lang);

  return (
    // ⚠️ ここに overflow-x-hidden を付けない: 祖先が scroll container になると
    // ヘッダーの position: sticky が無効化される（2026-08-19 staging実測で発覚した既存バグ。
    // 「学習システムを見る」の着地でヘッダー分のオフセットが必要なのに固定されていなかった）。
    // 横はみ出しの抑止は main/footer を包む内側のラッパーが担う
    <div className="bg-lp-ivory text-lp-ink min-h-screen [font-feature-settings:'palt']">
      <Helmet>
        <html lang={lang === 'ja' ? 'ja' : 'zh'} />
        <title>{seoTitle}</title>
        <meta name="description" content={v.seo.description[lang]} />
        <link rel="canonical" href={canonical} />
        {noindex && <meta name="robots" content="noindex,follow" />}
        {/* hreflangは既定LPだけに出す。広告用variant（/shoko /yuto）は canonical を
            /ai-course へ寄せているので、そこで自分自身をhreflangに挙げると
            「canonicalは別ページなのに、この言語版はこのURL」と矛盾した指示になる */}
        {!noindex && <link rel="alternate" hrefLang={lang} href={`${SITE}/${lang}/${path}`} />}
        {!noindex && <link rel="alternate" hrefLang={other} href={`${SITE}/${other}/${path}`} />}
        {!noindex && <link rel="alternate" hrefLang="x-default" href={`${SITE}/ja/ai-course`} />}
        <meta property="og:type" content="website" />
        <meta property="og:title" content={v.seo.title[lang]} />
        <meta property="og:description" content={v.seo.description[lang]} />
        <meta property="og:image" content={`${SITE}${v.seo.ogImage}`} />
        <meta property="og:locale" content={lang === 'ja' ? 'ja_JP' : 'zh_CN'} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(courseSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      </Helmet>

      {/* nav（サイト共通ヘッダーはchromelessで非表示のため独自ナビ） */}
      <header className="sticky top-0 z-50 bg-lp-ivory/85 backdrop-blur border-b border-lp-line">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          {/* 375px ではロゴ・リンク・CTAが横に収まらず、文字が縦積みに折り返していた
              （2026-08-20 staging実測）。スマホではロゴを一回り小さくし、折り返しを禁止する */}
          <div className="flex items-center gap-2 font-extrabold text-[0.95rem] sm:text-[1.05rem] whitespace-nowrap">
            <span className="inline-grid place-items-center w-8 h-8 shrink-0 rounded-full bg-lp-coral text-white text-sm" aria-hidden="true">和</span>
            <span>{lang === 'ja' ? '日本語の相棒' : '你的日语搭档'}</span>
          </div>
          <div className="flex items-center gap-2.5 sm:gap-3 whitespace-nowrap">
            {/* 料金への直行リンク（2026-08-20）。料金セクションはFVから9画面下にあり、
                ヘッダーからしか一足飛びに行けなかった */}
            <button type="button"
              onClick={() => { track('click_ai_course_to_pricing', { location: 'nav', variant: v.key }); scrollToSection('price'); }}
              className="hidden sm:flex items-center min-h-11 text-[0.92rem] font-bold text-lp-ink-soft hover:text-lp-ink underline underline-offset-4">
              {lang === 'ja' ? '料金' : '价格'}
            </button>
            {/* 受講中learnerのログイン導線。LPと分離した専用URL（/ai-course/login）へ。
                相談モーダルとは独立で、URLパラメーターを共有しない */}
            <a href={login} data-lp-login-cta
              onClick={() => track('click_ai_course_login', { location: 'nav' })}
              aria-label={lang === 'ja' ? '受講中の方はこちら（学習画面にログイン）' : '已报名的学员（登录学习系统）'}
              className="flex text-[0.88rem] text-lp-ink-soft hover:text-lp-ink underline underline-offset-4 min-h-11 items-center">
              <span className="hidden sm:inline">{lang === 'ja' ? '受講中の方はこちら' : '已报名的学员'}</span>
              <span className="sm:hidden">{lang === 'ja' ? 'ログイン' : '登录'}</span>
            </a>
            {/* 言語切替（2026-07-31 P1修正: /zh LPは存在するのに/jaから到達不能だった。
                issue report「中国語にならない」の根本原因。aタグ=JSなしでも遷移・SEO可読） */}
            <a href={`/${other}/${path}`} data-lp-lang-switch
              onClick={() => track('click_ai_course_lang_switch', { location: 'nav', to: other })}
              aria-label={lang === 'ja' ? '切换到中文页面' : '日本語ページへ切り替え'}
              className="text-[0.92rem] font-bold text-lp-ink-soft hover:text-lp-ink underline underline-offset-4 min-h-11 flex items-center">
              {lang === 'ja' ? '中文' : '日本語'}
            </a>
            {/* PCは相談CTA。スマホは同じ文言だと2行に折り返してヘッダーからはみ出すので、
                **料金へ飛ぶ短いCTA**に差し替える（相談導線はFV・下部固定バー・最終CTAが持つ） */}
            {/* CtaButton の基底クラスに inline-flex があるため、className に hidden を足しても
                display は勝てない。表示・非表示は**外側のdiv**で切り替える */}
            <div className="hidden sm:block">
              <CtaButton variant="primary" className="!px-4 !py-2 !text-[0.92rem] min-h-11" onClick={openConsult} event="click_ai_course_consultation" eventParams={{ location: 'nav', variant: v.key }}>
                {LP.ctaPrimary[lang]}
              </CtaButton>
            </div>
            <button type="button"
              onClick={() => { track('click_ai_course_to_pricing', { location: 'nav', variant: v.key }); scrollToSection('price'); }}
              className="sm:hidden inline-flex items-center justify-center min-h-11 px-3.5 rounded-full bg-lp-coral text-white font-extrabold text-[0.88rem] shadow-[0_3px_0_var(--color-lp-coral-deep)] active:translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lp-pine">
              {lang === 'ja' ? '料金' : '价格'}
            </button>
          </div>
        </div>
      </header>

      {/* 横スクロール抑止はここ（sticky ヘッダーを巻き込まない位置）で行う。
          overflow-x は **clip を優先**（hidden はこのdivをスクロールコンテナにするため、
          ページ内スクロールの挙動に副作用が出うる。clip はスクロールコンテナを作らない）。
          clip 未対応の古いブラウザは inline style が無効になり className の hidden に落ちる */}
      <div className="overflow-x-hidden" style={{ overflowX: 'clip' }}>
      <main>
        {/* 2026-08-19 再構成: FV → 悩み → 人×AIの仕組み → 学習システム実物 →
            毎日のステップ → 6か月ロードマップ → 料金3プラン＋比較 → あなたに合うプラン →
            人間コーチ → 受講生 → FAQ → 最終CTA（12セクション） */}
        <AiCourseHero v={v} lang={lang} onConsult={openConsult} duo={duo} />
        <PriceTeaserStrip lang={lang} variant={v.key} />
        <PainPointsSection lang={lang} />
        <AiHumanRolesSection v={v} lang={lang} />
        <PlatformFeatures lang={lang} />
        <DailyLearningFlow v={v} lang={lang} />
        <SixMonthRoadmap lang={lang} />
        <PricingSection lang={lang} onConsult={openConsult}
          onApply={setApplyPlanId} preview={planPreview} />
        <PlanComparisonSection lang={lang} />
        <PlanFitSection lang={lang} />
        <HumanCoachSection lang={lang} />
        <TestimonialsSection lang={lang} />
        <FaqSection lang={lang} />
        <FinalCtaSection v={v} lang={lang} onConsult={openConsult} />
      </main>

      <footer className="border-t border-lp-line py-10">
        <div className="mx-auto max-w-6xl px-5 flex flex-wrap items-center justify-between gap-4 text-[0.9rem] text-lp-ink-soft">
          <div className="flex items-center gap-2 font-extrabold text-lp-ink">
            <span className="inline-grid place-items-center w-7 h-7 rounded-full bg-lp-coral text-white text-xs" aria-hidden="true">和</span>
            {lang === 'ja' ? '日本語の相棒' : '你的日语搭档'}
          </div>
          <span>{LP.footerTagline[lang]}</span>
          <a href={`/${other}/${path}`} data-lp-lang-switch-footer
            onClick={() => track('click_ai_course_lang_switch', { location: 'footer', to: other })}
            className="inline-flex items-center min-h-11 underline underline-offset-4 hover:text-lp-ink">
            {lang === 'ja' ? '中文版' : '日本語版'}
          </a>
        </div>
        {/* mobile用ログイン導線: ヘッダーは幅不足のためfooter直上に配置（UX-001） */}
        <div className="sm:hidden mx-auto max-w-6xl px-5 pb-2">
          <a href={login} data-lp-login-cta-mobile
            onClick={() => track('click_ai_course_login', { location: 'footer' })}
            aria-label={lang === 'ja' ? '受講中の方はこちら（学習画面にログイン）' : '已报名的学员（登录学习系统）'}
            className="inline-flex items-center min-h-11 text-[0.9rem] text-lp-ink-soft underline underline-offset-4">
            {lang === 'ja' ? '受講中の方はこちら → 学習画面にログイン' : '已报名的学员 → 登录学习系统'}
          </a>
        </div>
        {/* 法務リンク。事実が確定するまで LegalPage 側が入口へ戻すので、
            リンク自体は常に置いておき、公開時に一箇所の切替だけで有効になる */}
        <div className="mx-auto max-w-6xl px-5 mt-6 text-lp-ink-soft" data-lp-legal-links>
          <LegalFooterLinks lang={lang} />
        </div>
        {/* 下部固定CTAバーの高さぶん。これが無いと法務リンクがバーに隠れる */}
        <div className="h-24 sm:hidden" aria-hidden="true" />
      </footer>
      </div>

      {/* 相談モーダル・申込モーダルはどちらもURL・履歴を変更しない
          （ログイン用パラメーターを流用しない。更新・戻る/進むでログイン画面へ飛ばさない） */}
      {/* スマホ下部の固定CTA（z-40＝モーダル z-[100] より下。モーダル表示中は覆われる） */}
      <LpStickyCta lang={lang} variant={v.key} onConsult={openConsult} />

      <ConsultationModal open={consultOpen} onClose={() => setConsultOpen(false)} lang={lang} variant={v.key} />
      {/* key で作り直す＝開くたびに入力が空に戻る（前の人の入力を持ち越さない） */}
      <ApplicationModal key={applyPlanId ?? 'closed'} planId={applyPlanId}
        onClose={() => setApplyPlanId(null)} lang={lang} />
    </div>
  );
}

export default AiCourseLandingPage;
