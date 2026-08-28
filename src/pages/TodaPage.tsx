import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Train, MapPin, Bike, CalendarDays, Wallet, ArrowRight } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { FAQSchema } from '../components/seo/FAQSchema';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * 戸田市向けページ（2026-08-28 新設）。
 *
 * 【なぜ作るか】
 * Search Console 実測（〜2026-08-21）で表示された検索語は11個だけで、そこに戸田は1語も無い。
 * 一方、会場（蕨市北町・川口市芝園町）は戸田市に隣接する場所にあり、
 * 地図上は「隣の市」でしかないのに、戸田側の言葉で書いたページが1枚も無かった。
 *
 * 【所要時間について（ここは慎重に）】
 * 徒歩の分数・距離は VenueGuidePage.tsx に載っている実測値だけを使う。
 * 電車の乗車時間・本数は**サイト上に根拠が無いので書かない**。
 * 乗り換え駅（赤羽）だけは路線図から確定する事実なので書いてよい。
 * 「近い」「すぐ」のような主観も置かない。読んだ人が自分で判断できる材料だけを出す。
 */

type L = 'ja' | 'zh';

const COPY = {
  ja: {
    title: '戸田のバドミントン | 戸田駅・戸田公園駅から通える会場案内',
    description: '戸田市でバドミントンができる場所を探している方へ。会場は隣接する川口市・蕨市で、平日夜19:00〜21:00に活動。蕨駅から芝園公民館まで徒歩約10分、蕨市民体育館まで徒歩約14分。参加費600円〜。',
    breadcrumbHome: 'ホーム',
    breadcrumb: '戸田からのアクセス',
    h1: '戸田駅・戸田公園駅から通えるバドミントン',
    lead: 'カワバド（川口・蕨バドミントン交流会）が使っている2会場は、戸田市に隣接する蕨市・川口市にあります。戸田市内での開催ではありませんが、戸田駅・戸田公園駅から通っていただける距離です。',

    accessHeading: '戸田駅・戸田公園駅からのアクセス',
    accessLead: '会場の最寄り駅はJR京浜東北線「蕨駅」です。戸田駅・戸田公園駅はJR埼京線なので、電車の場合は赤羽駅で京浜東北線に乗り換えます。',
    accessFacts: [
      { label: '電車', value: 'JR埼京線「戸田駅」「戸田公園駅」→ 赤羽駅でJR京浜東北線に乗り換え →「蕨駅」。乗車時間・本数はご利用の時間帯によって変わるため、乗換案内でご確認ください。' },
      { label: '蕨駅から会場まで（1）', value: '芝園公民館（埼玉県川口市芝園町3-15）まで、蕨駅東口から徒歩約10分（約770m）。芝園団地内にあります。' },
      { label: '蕨駅から会場まで（2）', value: '蕨市民体育館（埼玉県蕨市北町1-27-15）まで、蕨駅から徒歩約14分。' },
      { label: '自転車・自動車', value: '戸田市は蕨市・川口市に隣接しています。蕨市民体育館には館内に駐車場・駐輪場があります（満車時は近隣のタイムズ蕨北町第2 徒歩約5分などのコインパーキング）。芝園公民館の館内駐車場は台数に限りがあります。' },
    ],
    accessCta: '会場ガイドで地図とアクセスを見る',

    pointsHeading: '通うときに知っておきたいこと',
    points: [
      { icon: CalendarDays, title: '平日の夜に開催しています', body: '19:00〜21:00 を中心に平日夜の開催です。1回ごとのお申し込みなので、行ける日だけ参加できます。' },
      { icon: Wallet, title: '参加費は1回600円から', body: '通常活動は1回600円〜（シャトル代込み）です。大会は1,000円〜1,500円で、大会ごとに異なります。' },
      { icon: MapPin, title: '2つの会場のどちらかで活動します', body: '芝園公民館（川口市）と蕨市民体育館（蕨市）が主な会場です。どちらの会場かは各回のページに書いてあります。' },
      { icon: Bike, title: '自転車・自動車でも来られます', body: '蕨市民体育館には館内に駐車場・駐輪場があります。芝園公民館の館内駐車場は台数に限りがあるため、満車時は近隣のコインパーキングをご利用ください。' },
      { icon: Train, title: '帰りの時間も考えて選べます', body: '終了は21:00ごろです。蕨駅から戸田方面への帰りの時間は、乗換案内で事前にご確認ください。' },
    ],

    firstHeading: 'はじめて参加する方へ',
    firstBody: '通常活動はレッスン形式ではなく自由練習型なので、自分のペースで参加できます。超初級・初級クラスは初心者の方を対象にしています。持ち物はラケットと体育館用シューズです。参加は中学生以上が対象です。',
    ctaActivity: '通常活動の日程を見る',
    ctaTournament: '大会の日程を見る',
    ctaContact: 'お問い合わせ',

    faqHeading: '戸田から参加する方からよくある質問',
    faq: [
      { question: '戸田市内で開催していますか？', answer: '現在、戸田市内での開催はありません。会場は隣接する川口市の芝園公民館（川口市芝園町3-15）と、蕨市の蕨市民体育館（蕨市北町1-27-15）です。' },
      { question: '戸田駅・戸田公園駅からどうやって行きますか？', answer: '電車の場合は、JR埼京線「戸田駅」「戸田公園駅」から赤羽駅でJR京浜東北線に乗り換え、「蕨駅」で降ります。蕨駅から芝園公民館まで徒歩約10分（約770m）、蕨市民体育館まで徒歩約14分です。' },
      { question: '自転車や車で行っても大丈夫ですか？', answer: '大丈夫です。蕨市民体育館には館内に駐車場・駐輪場があります。芝園公民館の館内駐車場は台数に限りがあるため、満車時は隣接の川口芝園ショッピングモール駐車場（徒歩約1分）などのコインパーキングをご利用ください。' },
      { question: '戸田市民でなくても参加できますか？', answer: '参加できます。お住まいの市区町村による制限はありません。' },
      { question: '何時に終わりますか？', answer: '19:00〜21:00 を中心に開催しています。終了時刻は各回のページでご確認ください。' },
      { question: '参加費はいくらですか？', answer: '通常活動は1回600円〜（シャトル代込み）です。大会は1,000円〜1,500円で、大会ごとに異なります。' },
    ],

    nearbyHeading: '会場のある市の案内',
    nearbyBody: '会場のある川口市側の案内もあります。',
    nearbyKawaguchi: '川口市のバドミントンサークル（芝園公民館）',
    nearbyVenues: '会場ガイド（芝園公民館・蕨市民体育館）',
  },
  zh: {
    title: '户田的羽毛球 | 从户田站・户田公园站可以过来的会场介绍',
    description: '在户田市寻找可以打羽毛球的地方的朋友。会场在相邻的川口市・蕨市，平日夜间19:00〜21:00活动。从蕨站到芝园公民馆步行约10分钟，到蕨市民体育馆步行约14分钟。参加费600日元起。',
    breadcrumbHome: '首页',
    breadcrumb: '从户田出发的交通',
    h1: '从户田站・户田公园站可以过来的羽毛球活动',
    lead: 'kawabado（川口・蕨羽毛球交流会）使用的2个会场位于与户田市相邻的蕨市・川口市。虽然不在户田市内举办，但从户田站・户田公园站可以过来。',

    accessHeading: '从户田站・户田公园站的交通方式',
    accessLead: '会场最近的车站是JR京滨东北线「蕨站」。户田站・户田公园站在JR埼京线上，坐电车时需要在赤羽站换乘京滨东北线。',
    accessFacts: [
      { label: '电车', value: 'JR埼京线「户田站」「户田公园站」→ 在赤羽站换乘JR京滨东北线 →「蕨站」。乘车时间和班次因时段而异，请用换乘查询确认。' },
      { label: '从蕨站到会场（1）', value: '到芝园公民馆（埼玉县川口市芝园町3-15），从蕨站东口步行约10分钟（约770米）。位于芝园团地内。' },
      { label: '从蕨站到会场（2）', value: '到蕨市民体育馆（埼玉县蕨市北町1-27-15），从蕨站步行约14分钟。' },
      { label: '自行车・汽车', value: '户田市与蕨市・川口市相邻。蕨市民体育馆馆内设有停车场和自行车停放处（停满时可利用附近的Times蕨北町第2 步行约5分钟等收费停车场）。芝园公民馆的馆内停车位数量有限。' },
    ],
    accessCta: '在会场指南查看地图与交通',

    pointsHeading: '过来之前想知道的事',
    points: [
      { icon: CalendarDays, title: '在平日晚上举办', body: '以19:00〜21:00的平日夜间为主。按次报名，能来的日子来就好。' },
      { icon: Wallet, title: '参加费每次600日元起', body: '日常活动每次600日元起（含羽毛球费用）。大会为1,000〜1,500日元，各场次不同。' },
      { icon: MapPin, title: '在2个会场之一活动', body: '主要会场是芝园公民馆（川口市）与蕨市民体育馆（蕨市）。具体是哪个会场，会写在各场次的页面上。' },
      { icon: Bike, title: '骑车或开车也可以过来', body: '蕨市民体育馆馆内设有停车场和自行车停放处。芝园公民馆的馆内停车位数量有限，停满时请利用附近的收费停车场。' },
      { icon: Train, title: '也可以先想好回程时间', body: '大约21:00结束。从蕨站回户田方向的班次，请事先用换乘查询确认。' },
    ],

    firstHeading: '第一次参加的朋友',
    firstBody: '日常活动不是上课形式，而是自由练习型，可以按自己的节奏参加。超初级・初级组专为初学者设计。需要带球拍和室内运动鞋。参加对象为初中生以上。',
    ctaActivity: '查看日常活动的日程',
    ctaTournament: '查看大会的日程',
    ctaContact: '联系我们',

    faqHeading: '从户田过来的朋友常问的问题',
    faq: [
      { question: '在户田市内举办吗？', answer: '目前没有在户田市内举办。会场是相邻的川口市芝园公民馆（川口市芝园町3-15）与蕨市的蕨市民体育馆（蕨市北町1-27-15）。' },
      { question: '从户田站・户田公园站怎么去？', answer: '坐电车的话，从JR埼京线「户田站」「户田公园站」在赤羽站换乘JR京滨东北线，在「蕨站」下车。从蕨站到芝园公民馆步行约10分钟（约770米），到蕨市民体育馆步行约14分钟。' },
      { question: '骑自行车或开车去可以吗？', answer: '可以。蕨市民体育馆馆内设有停车场和自行车停放处。芝园公民馆的馆内停车位数量有限，停满时请利用附近的川口芝园购物中心停车场（步行约1分钟）等收费停车场。' },
      { question: '不是户田市民也能参加吗？', answer: '可以。不会因为居住的市区町村而受到限制。' },
      { question: '几点结束？', answer: '以19:00〜21:00为主举办。结束时间请在各场次的页面确认。' },
      { question: '参加费是多少？', answer: '日常活动每次600日元起（含羽毛球费用）。大会为1,000〜1,500日元，各场次不同。' },
    ],

    nearbyHeading: '会场所在城市的介绍',
    nearbyBody: '我们也准备了会场所在的川口市一侧的介绍。',
    nearbyKawaguchi: '川口市的羽毛球社团（芝园公民馆）',
    nearbyVenues: '会场指南（芝园公民馆・蕨市民体育馆）',
  },
} as const;

export const TodaPage = () => {
  const { lang } = useLanguage();
  const l: L = lang === 'zh' ? 'zh' : 'ja';
  const t = COPY[l];
  const url = `https://kawabado.com/${l}/toda`;

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
        <meta property="og:image" content="https://kawabado.com/venues/warabi-taiikukan.jpg" />
        <link rel="canonical" href={url} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/toda" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/toda" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/toda" />
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

        <section aria-labelledby="access" className="mb-12">
          <h2 id="access" className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Train className="h-5 w-5 text-kb-blue" strokeWidth={1.75} aria-hidden="true" />
            {t.accessHeading}
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">{t.accessLead}</p>
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {t.accessFacts.map((f) => (
              <div key={f.label} className="p-4 sm:p-5">
                <dt className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">{f.label}</dt>
                <dd className="text-sm text-gray-700 leading-relaxed">{f.value}</dd>
              </div>
            ))}
          </dl>
          <Link to={`/${l}/venues`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
            {t.accessCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
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

        <section aria-labelledby="nearby" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <h2 id="nearby" className="text-lg font-bold text-gray-900 mb-2">{t.nearbyHeading}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{t.nearbyBody}</p>
          <div className="mt-4 flex flex-col gap-2">
            <Link to={`/${l}/kawaguchi`} className="inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
              {t.nearbyKawaguchi} <ArrowRight className="h-4 w-4" aria-hidden="true" />
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

export default TodaPage;
