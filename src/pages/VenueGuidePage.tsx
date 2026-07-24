import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';

type Venue = {
  id: string;
  image: string;
  name: { ja: string; zh: string };
  address: { ja: string; zh: string };
  access: { ja: string; zh: string };
  parking: { ja: string; zh: string };
  usage: { ja: string; zh: string };
};

const VENUES: Venue[] = [
  {
    id: 'shibaen-kouminkan',
    image: '/venues/shibaen-kouminkan.jpg',
    name: { ja: '芝園公民館（川口市）', zh: '芝园公民馆（川口市）' },
    address: { ja: '埼玉県川口市芝園町3-15', zh: '埼玉县川口市芝园町3-15' },
    access: {
      ja: 'JR京浜東北線「蕨駅」東口から徒歩約10分（約770m）。芝園団地内にあります。',
      zh: 'JR京滨东北线「蕨站」东口步行约10分钟（约770米）。位于芝园团地内。',
    },
    parking: {
      ja: '館内駐車場は台数に限りがあります。満車時は隣接の川口芝園ショッピングモール駐車場（徒歩約1分）などのコインパーキングをご利用ください。',
      zh: '馆内停车位数量有限。停满时请利用附近的川口芝园购物中心停车场（步行约1分钟）等收费停车场。',
    },
    usage: {
      ja: '通常活動・大会（交流杯）ともに開催',
      zh: '日常活动・大会（交流杯）均在此举办',
    },
  },
  {
    id: 'warabi-taiikukan',
    image: '/venues/warabi-taiikukan.jpg',
    name: { ja: '蕨市民体育館（蕨市）', zh: '蕨市民体育馆（蕨市）' },
    address: { ja: '埼玉県蕨市北町1-27-15', zh: '埼玉县蕨市北町1-27-15' },
    access: {
      ja: 'JR京浜東北線「蕨駅」から徒歩約14分。',
      zh: 'JR京滨东北线「蕨站」步行约14分钟。',
    },
    parking: {
      ja: '館内に駐車場・駐輪場があります。満車時は近隣のタイムズ蕨北町第2（徒歩約5分）などのコインパーキングをご利用ください。',
      zh: '馆内设有停车场和自行车停放处。停满时请利用附近的Times蕨北町第2（步行约5分钟）等收费停车场。',
    },
    usage: {
      ja: '通常活動を中心に開催',
      zh: '主要举办日常活动',
    },
  },
];

export const VenueGuidePage = () => {
  const { lang } = useLanguage();
  const l = lang === 'zh' ? 'zh' : 'ja';

  // ページ meta は Worker + useStaticPageMeta で管理。Helmet は JSON-LD 専用。
  useStaticPageMeta();

  const venuesJsonLd = VENUES.map(v => ({
    '@context': 'https://schema.org',
    '@type': 'SportsActivityLocation',
    name: v.name.ja,
    image: `https://kawabado.com${v.image}`,
    address: {
      '@type': 'PostalAddress',
      streetAddress: v.address.ja,
      addressRegion: '埼玉県',
      addressCountry: 'JP',
    },
  }));

  return (
    <>
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(venuesJsonLd)}</script>
      </Helmet>
      <main className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
        <Breadcrumbs items={[
          { label: l === 'zh' ? '首页' : 'ホーム', path: `/${l}/` },
          { label: l === 'zh' ? '会场指南' : '会場ガイド' },
        ]} />

        <div className="text-center mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mb-3">
            {l === 'zh' ? '📍 会场指南' : '📍 会場ガイド'}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base max-w-xl mx-auto">
            {l === 'zh'
              ? '川口・蕨羽毛球交流会主要在以下两个会场举办活动。两个会场均从JR蕨站步行可达。'
              : '川口・蕨バドミントン交流会は、主に以下の2会場で活動しています。どちらもJR蕨駅から徒歩圏内です。'}
          </p>
        </div>

        <div className="space-y-8">
          {VENUES.map(v => (
            <div key={v.id} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="h-48 sm:h-64 overflow-hidden">
                <img src={v.image} alt={v.name[l]} className="w-full h-full object-cover" loading="lazy" />
              </div>
              <div className="p-5 sm:p-6">
                <h2 className="text-lg sm:text-xl font-extrabold text-gray-900 mb-1">{v.name[l]}</h2>
                <p className="text-xs text-emerald-700 bg-emerald-50 inline-block px-2.5 py-1 rounded-full font-semibold mb-4">
                  🏸 {v.usage[l]}
                </p>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <dt className="flex-shrink-0 text-lg" aria-label={l === 'zh' ? '地址' : '住所'}>🏠</dt>
                    <dd>
                      <span className="block text-xs text-gray-400 mb-0.5">{l === 'zh' ? '地址' : '住所'}</span>
                      <span className="font-semibold text-gray-800">{v.address[l]}</span>
                    </dd>
                  </div>
                  <div className="flex items-start gap-3">
                    <dt className="flex-shrink-0 text-lg" aria-label={l === 'zh' ? '交通' : 'アクセス'}>🚃</dt>
                    <dd>
                      <span className="block text-xs text-gray-400 mb-0.5">{l === 'zh' ? '交通' : 'アクセス'}</span>
                      <span className="text-gray-700 leading-relaxed">{v.access[l]}</span>
                    </dd>
                  </div>
                  <div className="flex items-start gap-3">
                    <dt className="flex-shrink-0 text-lg" aria-label={l === 'zh' ? '停车场' : '駐車場'}>🚗</dt>
                    <dd>
                      <span className="block text-xs text-gray-400 mb-0.5">{l === 'zh' ? '停车场' : '駐車場'}</span>
                      <span className="text-gray-700 leading-relaxed">{v.parking[l]}</span>
                    </dd>
                  </div>
                </dl>
                <a
                  href={`https://maps.google.com/maps?q=${encodeURIComponent(v.address.ja)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center gap-2 text-sm text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl px-4 py-3 transition-colors"
                >
                  <span className="text-lg">🗺️</span>
                  <span className="font-medium">{l === 'zh' ? '在Google地图中查看' : 'Googleマップで地図を見る'}</span>
                  <span className="ml-auto text-xs">→</span>
                </a>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-6">
          {l === 'zh'
            ? '※ 会场信息可能变更，请以各活动页面的信息为准。请穿室内运动鞋入场。'
            : '※ 会場は活動により異なる場合があります。各活動・大会ページの記載を優先してください。入場には体育館用シューズが必要です。'}
        </p>

        <div className="mt-10 bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-gray-900 mb-2">
            {l === 'zh' ? '查看活动日程' : '開催予定をチェック'}
          </h3>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
            <Link
              to={`/${l}/activity`}
              className="inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-6 py-3 rounded-xl transition-colors"
            >
              {l === 'zh' ? '日常活动列表 →' : '通常活動一覧を見る →'}
            </Link>
            <Link
              to={`/${l}/`}
              className="inline-flex items-center justify-center gap-2 bg-white hover:bg-gray-50 text-gray-700 font-bold px-6 py-3 rounded-xl border border-gray-200 transition-colors"
            >
              {l === 'zh' ? '赛事列表 →' : '大会一覧を見る →'}
            </Link>
          </div>
        </div>
      </main>
    </>
  );
};
