import { useParams } from 'react-router-dom'
import { EventSchema } from '../../components/seo/EventSchema'
import { Breadcrumbs } from '../../components/Breadcrumbs'
import { useStaticPageMeta } from '../../hooks/useStaticPageMeta'

const t = {
  ja: {
    title: '第2回大会 結果 | 川口・蕨バド交流杯',
    desc: '第2回川口・蕨バド交流杯ミックスダブルス夜の部（2026年6月25日）の試合結果・総当たり表。',
    date: '2026年6月25日（木）川口市芝園公民館',
    heading: '第2回 川口・蕨バド交流杯',
    sub: 'ミックスダブルス 夜の部 — 結果',
    section: '■ 総当たりスコア表',
    alt: '第2回大会 総当たりスコア表',
    back: '← 大会レポートブログに戻る',
  },
  zh: {
    title: '第2届比赛结果 | 川口・蕨羽毛球交流杯',
    desc: '第2届川口・蕨羽毛球交流杯混双夜场（2026年6月25日）比赛结果・循环赛成绩表。',
    date: '2026年6月25日（周四）川口市芝园公民馆',
    heading: '第2届 川口・蕨羽毛球交流杯',
    sub: '混双 夜场 — 结果',
    section: '■ 循环赛成绩表',
    alt: '第2届比赛 循环赛成绩表',
    back: '← 返回比赛报道博客',
  },
}

export default function Vol2Results() {
  const { lang } = useParams<{ lang?: string }>()
  const i = lang === 'zh' ? t.zh : t.ja
  const homeLang = lang === 'zh' ? 'zh' : 'ja'

  // ページ meta は Worker + useStaticPageMeta で管理。EventSchema (JSON-LD) は残す。
  useStaticPageMeta()

  return (
    <>
      <EventSchema
        name="第2回 川口・蕨バド交流杯（ミックスダブルス）"
        startDate="2026-06-25"
        endDate="2026-06-25"
        eventStatus="EventScheduled"
        location={{
          name: '芝園公民館',
          streetAddress: '埼玉県川口市芝園町3-15',
          addressLocality: '川口市',
        }}
        offers={{
          price: 2000,
          availability: 'SoldOut',
          url: `https://kawabado.com/${homeLang}/results/vol2`,
        }}
        image="https://kawabado.com/images/vol2/results-table.png"
        description={i.desc}
      />

      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="mb-8">
          <Breadcrumbs items={[
            { label: homeLang === 'zh' ? '首页' : 'ホーム', path: `/${homeLang}/` },
            { label: homeLang === 'zh' ? '博客' : 'ブログ', path: `/${homeLang}/blog` },
            { label: i.heading + ' ' + i.sub },
          ]} />
          <p className="text-sm text-gray-500 mb-1">{i.date}</p>
          <h1 className="text-2xl font-bold text-gray-900">
            {i.heading}<br />
            <span className="text-lg font-medium text-gray-600">{i.sub}</span>
          </h1>
        </div>

        <h2 className="text-base font-semibold text-gray-700 mb-3">{i.section}</h2>
        <div className="overflow-x-auto mb-6">
          <img
            src="/images/vol2/results-table.png"
            alt={i.alt}
            className="w-full rounded shadow"
          />
        </div>

        <div className="mt-8 pt-6 border-t border-gray-100 text-center">
          <a href={`/${homeLang}/blog`} className="text-sm text-blue-600 hover:underline">{i.back}</a>
        </div>
      </div>
    </>
  )
}
