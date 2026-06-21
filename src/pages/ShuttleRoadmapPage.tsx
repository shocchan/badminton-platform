import ShuttleCounter from '../components/ShuttleCounter';
import { SHUTTLE_ROADMAP_TEXT } from '../lib/shuttleRoadmapI18n';
import { useLanguage } from '../contexts/LanguageContext';

export function ShuttleRoadmapPage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const t = SHUTTLE_ROADMAP_TEXT[locale];

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <a
        href={`/${locale}/`}
        className="text-sm text-amber-700 underline-offset-2 hover:underline"
      >
        {t.backLink}
      </a>

      {/* ヒーロー */}
      <div className="mt-6 text-center">
        <p className="text-xs font-medium tracking-wide text-amber-600">{t.heroEyebrow}</p>
        <h1 className="mt-2 text-3xl font-bold text-amber-950 sm:text-4xl">{t.heroTitle}</h1>
        <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-amber-900/80">
          {t.heroBody}
        </p>
      </div>

      <div className="mt-8">
        <ShuttleCounter locale={locale} linkable={false} />
      </div>

      {/* ロードマップ */}
      <h2 className="mt-14 text-center text-lg font-bold text-amber-950">{t.roadmapTitle}</h2>

      <div className="relative mt-8 pl-8">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-amber-300" />

        {t.tiers.map((tier) => (
          <div key={tier.count} className="relative mb-10 last:mb-0">
            <div className="absolute -left-8 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-amber-500 bg-amber-50 text-[10px] font-bold text-amber-700">
              {tier.count >= 1000 ? '1K' : tier.count}
            </div>
            <p className="text-sm font-bold text-amber-900">
              {tier.count.toLocaleString()}{locale === 'zh' ? '个' : '個'}
            </p>
            <p className="mt-1 text-base font-semibold text-amber-950">{tier.items}</p>
            <p className="mt-1 text-sm text-amber-800/70">{tier.caption}</p>
          </div>
        ))}
      </div>

      {/* 景品・会員登録セクション */}
      <div className="mt-14 rounded-2xl border border-amber-900/10 bg-amber-50 px-6 py-8 text-center">
        <p className="text-lg font-bold text-amber-950">{t.prizeTitle}</p>
        <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-amber-900/80">
          {t.prizeBody}
        </p>
        <a
          href={`/${locale}/join`}
          className="mt-6 inline-block rounded-full bg-amber-700 px-8 py-3 text-sm font-bold text-white transition hover:bg-amber-800"
        >
          {t.ctaButton}
        </a>
      </div>
    </div>
  );
}
