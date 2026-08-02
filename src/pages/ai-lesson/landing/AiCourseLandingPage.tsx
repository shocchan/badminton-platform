import { useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useLanguage } from '../../../contexts/LanguageContext';
import { LP, VARIANTS, type CharacterVariant } from './lpContent';
import { CtaButton } from './lpUi';
import { track } from './lpHelpers';
import { AiCourseHero } from './AiCourseHero';
import { PainPointsSection, WhyLessonsFailSection, AiHumanRolesSection, DailyLearningFlow } from './sectionsA';
import { PlatformFeatures, SixMonthRoadmap, FutureOutcomes } from './sectionsB';
import { HumanCoachSection, AiTeachersSection, TestimonialsSection } from './sectionsC';
import { ComparisonSection, CourseContentsSection, PricingSection } from './sectionsD';
import { FaqSection, FinalCtaSection, ConsultationModal } from './sectionsE';
import { ApplicationModal } from './ApplicationModal';
import { isPlanPreview, type PlanId } from '../../../lib/aiLesson/course/plans/planCatalog';
import { LegalFooterLinks } from '../legal/LegalPage';

const SITE = 'https://kawabado.com';

export function AiCourseLandingPage({ variant = 'shoko', noindex = false, onSeeApp }: {
  variant?: CharacterVariant; noindex?: boolean; onSeeApp: () => void;
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
  }, [v.key, lang]);

  const path = variant === 'shoko' && !noindex ? 'ai-course' : `ai-course/${variant}`;
  const canonical = `${SITE}/${lang}/ai-course`; // variantは主ページへ集約
  const other = lang === 'ja' ? 'zh' : 'ja';

  const courseSchema = {
    '@context': 'https://schema.org', '@type': 'Course',
    name: v.seo.title[lang], description: v.seo.description[lang],
    provider: { '@type': 'Organization', name: 'kawabado', url: SITE },
    inLanguage: lang === 'ja' ? 'ja' : 'zh-Hans',
  };
  const faqSchema = {
    '@context': 'https://schema.org', '@type': 'FAQPage',
    mainEntity: LP.faq.items[lang].map((f) => ({
      '@type': 'Question', name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  return (
    <div className="bg-lp-ivory text-lp-ink min-h-screen overflow-x-hidden [font-feature-settings:'palt']">
      <Helmet>
        <html lang={lang === 'ja' ? 'ja' : 'zh'} />
        <title>{v.seo.title[lang]}</title>
        <meta name="description" content={v.seo.description[lang]} />
        <link rel="canonical" href={canonical} />
        {noindex && <meta name="robots" content="noindex,follow" />}
        <link rel="alternate" hrefLang={lang} href={`${SITE}/${lang}/${path}`} />
        <link rel="alternate" hrefLang={other} href={`${SITE}/${other}/${path}`} />
        <link rel="alternate" hrefLang="x-default" href={`${SITE}/ja/ai-course`} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={v.seo.title[lang]} />
        <meta property="og:description" content={v.seo.description[lang]} />
        <meta property="og:image" content={`${SITE}${v.seo.ogImage}`} />
        <meta property="og:locale" content={lang === 'ja' ? 'ja_JP' : 'zh_CN'} />
        <meta name="twitter:card" content="summary_large_image" />
        <script type="application/ld+json">{JSON.stringify(courseSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      {/* nav（サイト共通ヘッダーはchromelessで非表示のため独自ナビ） */}
      <header className="sticky top-0 z-50 bg-lp-ivory/85 backdrop-blur border-b border-lp-line">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-extrabold text-[1.05rem]">
            <span className="inline-grid place-items-center w-8 h-8 rounded-full bg-lp-coral text-white text-sm" aria-hidden="true">和</span>
            <span>{lang === 'ja' ? `${v.name.ja}の日本語会話` : `${v.name.zh}的日语会话`}</span>
          </div>
          <div className="flex items-center gap-3">
            {/* 受講中learnerのログイン導線（UX-001 P1: これまでLPに0本で、招待URLを
                知らない限り2回目以降に学習画面へ戻れなかった）。
                主申込CTAより視覚優先度を下げたテキストリンク。認証済みなら app entry が学習Homeへ振り分ける */}
            <a href={`/${lang}/ai-course?app=1`} data-lp-login-cta
              aria-label={lang === 'ja' ? '受講中の方はこちら（学習画面にログイン）' : '已报名的学员（登录学习系统）'}
              className="flex text-[0.88rem] text-lp-ink-soft hover:text-lp-ink underline underline-offset-4 min-h-11 items-center">
              <span className="hidden sm:inline">{lang === 'ja' ? '受講中の方はこちら' : '已报名的学员'}</span>
              <span className="sm:hidden">{lang === 'ja' ? 'ログイン' : '登录'}</span>
            </a>
            {/* 言語切替（2026-07-31 P1修正: /zh LPは存在するのに/jaから到達不能だった。
                issue report「中国語にならない」の根本原因。aタグ=JSなしでも遷移・SEO可読） */}
            <a href={`/${other}/${path}`} data-lp-lang-switch
              aria-label={lang === 'ja' ? '切换到中文页面' : '日本語ページへ切り替え'}
              className="text-[0.92rem] font-bold text-lp-ink-soft hover:text-lp-ink underline underline-offset-4 min-h-11 flex items-center">
              {lang === 'ja' ? '中文' : '日本語'}
            </a>
            <CtaButton variant="primary" className="!px-4 !py-2 !text-[0.92rem]" onClick={openConsult} event="click_ai_course_consultation" eventParams={{ location: 'nav', variant: v.key }}>
              {LP.ctaPrimary[lang]}
            </CtaButton>
          </div>
        </div>
      </header>

      <main>
        <AiCourseHero v={v} lang={lang} onConsult={openConsult} onSeeApp={onSeeApp} />
        <PainPointsSection lang={lang} />
        <WhyLessonsFailSection lang={lang} />
        <AiHumanRolesSection v={v} lang={lang} />
        <DailyLearningFlow v={v} lang={lang} />
        <PlatformFeatures lang={lang} />
        <SixMonthRoadmap lang={lang} />
        <FutureOutcomes lang={lang} />
        <HumanCoachSection lang={lang} />
        <AiTeachersSection lang={lang} />
        <TestimonialsSection lang={lang} />
        <ComparisonSection lang={lang} />
        <CourseContentsSection lang={lang} />
        <PricingSection v={v} lang={lang} onConsult={openConsult}
          onApply={setApplyPlanId} preview={planPreview} />
        <FaqSection lang={lang} />
        <FinalCtaSection v={v} lang={lang} onConsult={openConsult} />
      </main>

      <footer className="border-t border-lp-line py-10">
        <div className="mx-auto max-w-6xl px-5 flex flex-wrap items-center justify-between gap-4 text-[0.9rem] text-lp-ink-soft">
          <div className="flex items-center gap-2 font-extrabold text-lp-ink">
            <span className="inline-grid place-items-center w-7 h-7 rounded-full bg-lp-coral text-white text-xs" aria-hidden="true">和</span>
            {lang === 'ja' ? `${v.name.ja}の日本語会話` : `${v.name.zh}的日语会话`}
          </div>
          <span>{LP.footerTagline[lang]}</span>
          <a href={`/${other}/${path}`} data-lp-lang-switch-footer
            className="underline underline-offset-4 hover:text-lp-ink">
            {lang === 'ja' ? '中文版' : '日本語版'}
          </a>
        </div>
        {/* mobile用ログイン導線: ヘッダーは幅不足のためfooter直上に配置（UX-001） */}
        <div className="sm:hidden mx-auto max-w-6xl px-5 pb-2">
          <a href={`/${lang}/ai-course?app=1`} data-lp-login-cta-mobile
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
      </footer>

      <ConsultationModal open={consultOpen} onClose={() => setConsultOpen(false)} lang={lang} variant={v.key} />
      {/* key で作り直す＝開くたびに入力が空に戻る（前の人の入力を持ち越さない） */}
      <ApplicationModal key={applyPlanId ?? 'closed'} planId={applyPlanId}
        onClose={() => setApplyPlanId(null)} lang={lang} />
    </div>
  );
}

export default AiCourseLandingPage;
