import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import ShuttleCounter from '../components/ShuttleCounter';
import { SHUTTLE_ROADMAP_TEXT } from '../lib/shuttleRoadmapI18n';
import { SHUTTLE_MILESTONES } from '../lib/shuttleMilestones';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../services/supabaseClient';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';

const GOAL = SHUTTLE_MILESTONES[SHUTTLE_MILESTONES.length - 1].count; // 1000

export function ShuttleRoadmapPage() {
  const { lang } = useLanguage();
  const locale = lang === 'zh' ? 'zh' : 'ja';
  const t = SHUTTLE_ROADMAP_TEXT[locale];
  const [total, setTotal] = useState<number | null>(null);

  // ページ meta は Worker + useStaticPageMeta で管理。
  useStaticPageMeta();

  useEffect(() => {
    supabase
      .from('shuttle_counter')
      .select('total_count')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) setTotal(data.total_count);
      });
  }, []);

  const overallPct = total != null ? Math.min(100, (total / GOAL) * 100) : 0;

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
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

      {/* 全体進捗バー（1000個ゴール・節目の目盛り付き） */}
      {total != null && (
        <div className="mt-6 rounded-2xl border border-amber-900/10 bg-white px-5 py-4">
          <div className="flex items-baseline justify-between">
            <p className="text-xs font-bold text-amber-900">
              {locale === 'zh' ? '距离1,000个的进度' : '1,000個までの道のり'}
            </p>
            <p className="text-xs font-bold tabular-nums text-amber-700">
              {total.toLocaleString()} / {GOAL.toLocaleString()}
              <span className="ml-1 font-normal text-amber-600/70">({Math.floor(overallPct)}%)</span>
            </p>
          </div>
          <div className="relative mt-3 h-2.5 rounded-full bg-amber-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all duration-700"
              style={{ width: `${overallPct}%` }}
            />
            {/* 節目の目盛り */}
            {SHUTTLE_MILESTONES.map((m) => (
              <div
                key={m.count}
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{ left: `${(m.count / GOAL) * 100}%` }}
              >
                <div
                  className={`h-4 w-4 rounded-full border-2 ${
                    total >= m.count
                      ? 'border-amber-600 bg-amber-500'
                      : 'border-amber-300 bg-white'
                  }`}
                />
              </div>
            ))}
          </div>
          <div className="relative mt-1.5 h-4 text-[10px] font-bold text-amber-600/70">
            {SHUTTLE_MILESTONES.map((m) => (
              <span
                key={m.count}
                className="absolute -translate-x-1/2 tabular-nums"
                style={{ left: `${(m.count / GOAL) * 100}%` }}
              >
                {m.count >= 1000 ? '1K' : m.count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ロードマップ（スタンプカード風: 達成済み✓・進行中はバー・未来は淡く） */}
      <h2 className="mt-14 text-center text-lg font-bold text-amber-950">{t.roadmapTitle}</h2>

      <div className="relative mt-8 pl-8">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-amber-300" />

        {t.tiers.map((tier, tierIdx) => {
          const achieved = total != null && total >= tier.count;
          const prevCount = tierIdx === 0 ? 0 : t.tiers[tierIdx - 1].count;
          const isCurrent =
            total != null && !achieved && total >= prevCount;
          const tierPct = isCurrent
            ? Math.min(100, Math.max(0, ((total - prevCount) / (tier.count - prevCount)) * 100))
            : 0;
          return (
            <div
              key={tier.count}
              className={`relative mb-10 last:mb-0 transition-opacity ${
                total != null && !achieved && !isCurrent ? 'opacity-55' : ''
              }`}
            >
              <div
                className={`absolute -left-8 top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold ${
                  achieved
                    ? 'border-amber-600 bg-amber-500 text-white'
                    : isCurrent
                      ? 'border-amber-500 bg-white text-amber-700 ring-2 ring-amber-200'
                      : 'border-amber-500 bg-amber-50 text-amber-700'
                }`}
              >
                {achieved ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : tier.count >= 1000 ? '1K' : tier.count}
              </div>
              <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                {tier.count.toLocaleString()}
                {locale === 'zh' ? '个' : '個'}
                {achieved && (
                  <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black text-white">
                    {locale === 'zh' ? '达成！' : '達成！'}
                  </span>
                )}
                {isCurrent && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {locale === 'zh' ? '进行中' : 'いまここ'}
                  </span>
                )}
              </p>
              {isCurrent && total != null && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 w-40 max-w-full rounded-full bg-amber-100">
                    <div
                      className="h-full rounded-full bg-amber-500 transition-all duration-700"
                      style={{ width: `${tierPct}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-bold tabular-nums text-amber-600">
                    {locale === 'zh'
                      ? `还差${(tier.count - total).toLocaleString()}个`
                      : `あと${(tier.count - total).toLocaleString()}個`}
                  </span>
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-2">
                {tier.items.map((item, i) => (
                  <span key={item.label} className="inline-flex items-center">
                    {i > 0 && <span className="mx-1.5 text-amber-300">/</span>}
                    <span className="inline-flex items-center gap-1.5 text-base font-semibold text-amber-950">
                      {item.icon && (
                        <img
                          src={`/icons/${item.icon}`}
                          alt={item.label}
                          className="h-7 w-7 shrink-0 object-contain"
                          loading="lazy"
                        />
                      )}
                      {item.label}
                    </span>
                  </span>
                ))}
              </div>
              <p className="mt-1 text-sm text-amber-800/70">{tier.caption}</p>
            </div>
          );
        })}
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
    </main>
  );
}
