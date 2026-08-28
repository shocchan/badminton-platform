import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { MapPin, CalendarDays, Users, Wallet, Trophy, Languages, ArrowRight } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { FAQSchema } from '../components/seo/FAQSchema';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * 川口市向けランディングページ（2026-08-28 新設）。
 *
 * 【なぜ作るか】
 * Search Console 実測（〜2026-08-21・3か月）:
 *   芝園公民館        73表示 / 8.1位  ← このサイト最大の表示元。**川口市の会場名**
 *   川口市バドミントン大会 17表示 / 7.7位
 *   川口 バドミントン    7表示 / 9.1位
 *   川口市 バドミントン   2表示 / 18.0位
 *   バドミントン 川口    1表示 / 17.0位
 * 会場名（芝園公民館）では見つかっているのに、**地域名＋競技名では9〜18位**で受け皿が無い。
 * 「川口市 バドミントンサークル」を正面から受けるページが1枚も無く、トップページが
 * 「川口・蕨」の両方を名乗って薄まっていた。ここはその1枚。
 *
 * 【なぜ「サークル」という語を使うか】
 * サイト全体は「交流会」と名乗っているが、探している側は「サークル」で検索する。
 * 名乗りは変えず、**探し方の言葉**をこのページで受ける（言い換えであって別物の主張ではない）。
 *
 * 【書いてよいこと】
 * すでにサイト上（会場ガイド・FAQ・通常活動一覧）で公表している事実だけ。
 * 参加人数・会員数・実績は**作らない**。所要時間や住所は VenueGuidePage.tsx の値をそのまま使う。
 */

type L = 'ja' | 'zh';

const COPY = {
  ja: {
    title: '川口市のバドミントンサークル | 芝園公民館で平日夜に活動',
    description: '埼玉県川口市でバドミントンサークルを探している方へ。芝園公民館（川口市芝園町3-15）を中心に平日夜19:00〜21:00で活動。超初級〜オープンの4クラス、参加費600円〜、1回ごとの申し込みです。',
    breadcrumbHome: 'ホーム',
    breadcrumb: '川口市のバドミントンサークル',
    h1: '川口市でバドミントンサークルを探している方へ',
    lead: 'カワバド（川口・蕨バドミントン交流会）は、川口市の芝園公民館を中心に平日夜に活動しているバドミントンの交流会です。1回ごとの申し込みなので、来られるときだけ参加できます。',

    venueHeading: '川口市の会場：芝園公民館',
    venueLead: '川口市内での活動は、芝園団地内にある芝園公民館が中心です。通常活動と大会（交流杯）のどちらもここで開催しています。',
    venueFacts: [
      { label: '住所', value: '埼玉県川口市芝園町3-15' },
      { label: 'アクセス', value: 'JR京浜東北線「蕨駅」東口から徒歩約10分（約770m）。芝園団地内にあります。' },
      { label: '駐車場', value: '館内駐車場は台数に限りがあります。満車時は隣接の川口芝園ショッピングモール駐車場（徒歩約1分）などのコインパーキングをご利用ください。' },
      { label: '使い方', value: '通常活動・大会（交流杯）ともに開催' },
    ],
    venueCta: '会場ガイドで地図とアクセスを見る',

    pointsHeading: '川口市で活動しているサークルとしての特徴',
    points: [
      { icon: CalendarDays, title: '平日の夜に活動しています', body: '19:00〜21:00 を中心に平日夜の開催です。1回ごとのお申し込みなので、続けて通う約束をしなくても大丈夫です。仕事終わりに寄れる時間に開催しています。' },
      { icon: Users, title: '超初級からオープンまで4クラス', body: '超初級・初級・中級・オープンにクラスが分かれています。超初級・初級クラスは初心者の方を対象にしており、試合に慣れていない方も参加できます。' },
      { icon: Wallet, title: '参加費は1回600円から', body: '通常活動は1回600円〜（シャトル代込み）です。大会は1,000円〜1,500円で、大会ごとに異なります。参加したい回だけ申し込む形なので、継続の縛りはありません。' },
      { icon: Trophy, title: '大会は1人4試合以上', body: 'クラスや参加人数によって異なりますが、大会では最低4試合以上を保証しています。詳細は各大会の案内をご確認ください。' },
      { icon: Languages, title: '中国語での問い合わせにも対応', body: '中国語でのお問い合わせ・当日サポートに対応しています。中国語話者の参加者も多数います。' },
    ],

    firstHeading: 'はじめて参加する方へ',
    firstBody: '通常活動はレッスン形式ではなく自由練習型なので、自分のペースで参加できます。持ち物はラケットと体育館用シューズです。大会に出る場合はシャトルの持参が必要です（超初級ダブルス大会を除く）。参加は中学生以上が対象です。',
    ctaActivity: '通常活動の日程を見る',
    ctaTournament: '大会の日程を見る',
    ctaContact: 'お問い合わせ',

    faqHeading: '川口市での活動についてよくある質問',
    faq: [
      { question: '川口市のどこで活動していますか？', answer: '芝園公民館（埼玉県川口市芝園町3-15）が中心です。JR京浜東北線「蕨駅」東口から徒歩約10分（約770m）、芝園団地内にあります。隣の蕨市にある蕨市民体育館（蕨市北町1-27-15）でも活動しています。' },
      { question: '川口市在住でなくても参加できますか？', answer: '参加できます。市内在住・在勤の方に限定していません。' },
      { question: 'サークルの入会手続きは必要ですか？', answer: '必要ありません。参加したい回のページからその都度お申し込みください。1回ごとの申し込みなので、来られるときだけ参加できます。' },
      { question: '初めてでも参加できますか？', answer: '超初級・初級クラスは初心者の方を対象にしており、試合に慣れていない方も安心してご参加いただけます。' },
      { question: '一人で参加してもいいですか？', answer: '通常活動はお一人での参加が中心です。大会はシングルスなら一人で申し込めます。ダブルス・混合ダブルス大会は、ペアが決まってからお申し込みください。' },
      { question: '参加費はいくらですか？', answer: '通常活動は1回600円〜（シャトル代込み）です。大会は1,000円〜1,500円で、大会ごとに異なります。' },
      { question: '芝園公民館に駐車場はありますか？', answer: '館内駐車場は台数に限りがあります。満車時は隣接の川口芝園ショッピングモール駐車場（徒歩約1分）などのコインパーキングをご利用ください。' },
    ],

    nearbyHeading: '近隣エリアから来られる方へ',
    nearbyBody: '会場の最寄りはJR蕨駅です。蕨市・戸田市など近隣から来られる方向けの案内もあります。',
    nearbyToda: '戸田駅・戸田公園駅からのアクセス',
    nearbyVenues: '会場ガイド（芝園公民館・蕨市民体育館）',
  },
  zh: {
    title: '川口市的羽毛球社团 | 在芝园公民馆平日夜间活动',
    description: '在埼玉县川口市寻找羽毛球社团的朋友。以芝园公民馆（川口市芝园町3-15）为中心，平日夜间19:00〜21:00活动。超初级〜公开组4个级别，参加费600日元起，按次报名。',
    breadcrumbHome: '首页',
    breadcrumb: '川口市的羽毛球社团',
    h1: '在川口市寻找羽毛球社团的朋友',
    lead: 'kawabado（川口・蕨羽毛球交流会）以川口市的芝园公民馆为中心，在平日夜间活动。按次报名，有空的时候来就好。',

    venueHeading: '川口市的会场：芝园公民馆',
    venueLead: '在川口市内的活动以芝园团地内的芝园公民馆为中心。日常活动和大会（交流杯）都在这里举办。',
    venueFacts: [
      { label: '地址', value: '埼玉县川口市芝园町3-15' },
      { label: '交通', value: 'JR京滨东北线「蕨站」东口步行约10分钟（约770米）。位于芝园团地内。' },
      { label: '停车场', value: '馆内停车位数量有限。停满时请利用附近的川口芝园购物中心停车场（步行约1分钟）等收费停车场。' },
      { label: '用途', value: '日常活动・大会（交流杯）均在此举办' },
    ],
    venueCta: '在会场指南查看地图与交通',

    pointsHeading: '作为在川口市活动的社团的特点',
    points: [
      { icon: CalendarDays, title: '在平日晚上活动', body: '以19:00〜21:00的平日夜间为主。按次报名，不需要承诺长期参加。下班后可以顺路过来。' },
      { icon: Users, title: '从超初级到公开组共4个级别', body: '分为超初级・初级・中级・公开组。超初级・初级组专为初学者设计，不熟悉比赛也可以参加。' },
      { icon: Wallet, title: '参加费每次600日元起', body: '日常活动每次600日元起（含羽毛球费用）。大会为1,000〜1,500日元，各场次不同。只报名想参加的场次，没有长期约束。' },
      { icon: Trophy, title: '大会保证每人4场以上', body: '因级别和参加人数而异，但大会保证至少4场比赛。详情请查看各赛事页面。' },
      { icon: Languages, title: '支持中文咨询', body: '支持中文咨询与当天现场支援。也有很多中文参加者。' },
    ],

    firstHeading: '第一次参加的朋友',
    firstBody: '日常活动不是上课形式，而是自由练习型，可以按自己的节奏参加。需要带球拍和室内运动鞋。参加大会时需要自带羽毛球（超初级双打除外）。参加对象为初中生以上。',
    ctaActivity: '查看日常活动的日程',
    ctaTournament: '查看大会的日程',
    ctaContact: '联系我们',

    faqHeading: '关于在川口市活动的常见问题',
    faq: [
      { question: '在川口市的什么地方活动？', answer: '以芝园公民馆（埼玉县川口市芝园町3-15）为中心。JR京滨东北线「蕨站」东口步行约10分钟（约770米），位于芝园团地内。在隔壁蕨市的蕨市民体育馆（蕨市北町1-27-15）也有活动。' },
      { question: '不住在川口市也能参加吗？', answer: '可以。并不限定住在市内或在市内工作的人。' },
      { question: '需要办理入会手续吗？', answer: '不需要。请在想参加的场次页面上单独报名。按次报名，有空的时候来就好。' },
      { question: '初次参加可以吗？', answer: '超初级・初级组专为初学者设计，即使不熟悉比赛也能放心参加。' },
      { question: '一个人可以参加吗？', answer: '日常活动以单人参加为主。大会的单打项目可以一人报名。双打・混双项目请在确定搭档后报名。' },
      { question: '参加费是多少？', answer: '日常活动每次600日元起（含羽毛球费用）。大会为1,000〜1,500日元，各场次不同。' },
      { question: '芝园公民馆有停车场吗？', answer: '馆内停车位数量有限。停满时请利用附近的川口芝园购物中心停车场（步行约1分钟）等收费停车场。' },
    ],

    nearbyHeading: '从周边地区过来的朋友',
    nearbyBody: '会场最近的车站是JR蕨站。我们也为蕨市・户田市等周边地区的朋友准备了说明。',
    nearbyToda: '从户田站・户田公园站的交通方式',
    nearbyVenues: '会场指南（芝园公民馆・蕨市民体育馆）',
  },
} as const;

/**
 * 川口市の活動拠点としての構造化データ。
 * 会場そのものの SportsActivityLocation は会場ガイド（VenueGuidePage.tsx）が持っているので、
 * ここでは **@id を分けて** 川口市エリアのページであることだけを述べる（同じ実体を二重定義しない）。
 */
const placeJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SportsActivityLocation',
  '@id': 'https://kawabado.com/ja/kawaguchi#shibaen-kouminkan',
  name: '芝園公民館',
  image: 'https://kawabado.com/venues/shibaen-kouminkan.jpg',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '芝園町3-15',
    addressLocality: '川口市',
    addressRegion: '埼玉県',
    addressCountry: 'JP',
  },
  containedInPlace: { '@type': 'AdministrativeArea', name: '川口市' },
  // ここで活動している実体（トップページの Organization/SportsClub）と結ぶ
  subjectOf: { '@id': 'https://kawabado.com/#organization' },
};

export const KawaguchiPage = () => {
  const { lang } = useLanguage();
  const l: L = lang === 'zh' ? 'zh' : 'ja';
  const t = COPY[l];
  const url = `https://kawabado.com/${l}/kawaguchi`;

  return (
    <>
      <Helmet>
        <html lang={l} />
        <title>{t.title}</title>
        <meta name="description" content={t.description} />
        <meta property="og:title" content={t.title} />
        <meta property="og:description" content={t.description} />
        <meta property="og:url" content={url} />
        <meta property="og:locale" content={l === 'zh' ? 'zh_CN' : 'ja_JP'} />
        <meta property="og:image" content="https://kawabado.com/venues/shibaen-kouminkan.jpg" />
        <link rel="canonical" href={url} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/kawaguchi" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/kawaguchi" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/kawaguchi" />
        <script type="application/ld+json">{JSON.stringify(placeJsonLd)}</script>
      </Helmet>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <Breadcrumbs items={[
          { label: t.breadcrumbHome, path: `/${l}/` },
          { label: t.breadcrumb },
        ]} />

        <header className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-4">{t.h1}</h1>
          <p className="text-gray-600 leading-relaxed">{t.lead}</p>
        </header>

        <section aria-labelledby="venue" className="mb-12">
          <h2 id="venue" className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-kb-blue" strokeWidth={1.75} aria-hidden="true" />
            {t.venueHeading}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{t.venueLead}</p>
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {t.venueFacts.map((f) => (
              <div key={f.label} className="p-4 sm:p-5">
                <dt className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">{f.label}</dt>
                <dd className="text-sm text-gray-700 leading-relaxed">{f.value}</dd>
              </div>
            ))}
          </dl>
          <Link to={`/${l}/venues`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
            {t.venueCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        <section aria-labelledby="points" className="mb-12">
          <h2 id="points" className="text-lg font-bold text-gray-900 mb-4">{t.pointsHeading}</h2>
          <ul className="space-y-3">
            {t.points.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
                <Icon className="h-5 w-5 mt-0.5 flex-shrink-0 text-kb-blue" strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <h3 className="font-bold text-gray-900 text-[0.98rem] mb-1">{title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="first" className="mb-12 rounded-2xl bg-gray-50 border border-gray-200 p-5 sm:p-6">
          <h2 id="first" className="text-lg font-bold text-gray-900 mb-2">{t.firstHeading}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{t.firstBody}</p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2.5">
            <Link to={`/${l}/activity`}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl bg-kb-blue px-5 text-sm font-bold text-white hover:bg-kb-blue-deep transition-colors">
              {t.ctaActivity} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to={`/${l}/`}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
              {t.ctaTournament}
            </Link>
            <Link to={`/${l}/contact`}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
              {t.ctaContact}
            </Link>
          </div>
        </section>

        <section aria-labelledby="faq" className="mb-12">
          <h2 id="faq" className="text-lg font-bold text-gray-900 mb-4">{t.faqHeading}</h2>
          <FAQSchema items={t.faq.map((f) => ({ question: f.question, answer: f.answer }))} />
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {t.faq.map((f) => (
              <div key={f.question} className="p-4 sm:p-5">
                <dt className="font-bold text-gray-900 text-[0.95rem] mb-1.5">{f.question}</dt>
                <dd className="text-sm text-gray-600 leading-relaxed">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 地域ページ同士を結ぶ。孤立した1枚だとクローラーからも人からも辿り着けない */}
        <section aria-labelledby="nearby" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 id="nearby" className="text-lg font-bold text-gray-900 mb-2">{t.nearbyHeading}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{t.nearbyBody}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Link to={`/${l}/toda`} className="inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
              {t.nearbyToda} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to={`/${l}/venues`} className="inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
              {t.nearbyVenues} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
};

export default KawaguchiPage;
