import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Users, Languages, MapPin, MessageCircle, CalendarDays, ArrowRight } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { FAQSchema } from '../components/seo/FAQSchema';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * 国際交流ページ（2026-08-24 新設）。
 *
 * 【なぜ作るか】
 * Search Console 実測（〜2026-08-21）で、表示された検索語は11個だけで、
 * その中に「国際交流」「外国人」「中国人」に関するものは**1つも無い**。
 * 一方この交流会の実態は、中国・ベトナム・インドネシア・フィリピンなど多国籍で、
 * 中国語での問い合わせ・当日サポートに対応している。
 * **一番の独自性が、検索の受け皿を1ページも持っていなかった。**
 *
 * 【書いてよいこと】
 * すでにサイト上（活動一覧FAQ・FAQページ）で公表している事実だけ。
 * 参加者数・国籍比率・体験談は**作らない**（実データが無いため）。
 * ここは同時に、バドミントンとAI日本語コースをつなぐ唯一の自然な接点でもある
 * （SEOのために2事業を無理に結ぶのではなく、実態としてここで交わっている）。
 */

type L = 'ja' | 'zh';

/**
 * ページに載せる活動写真（2026-08-24 受け皿だけ用意）。
 *
 * **空のあいだは写真セクションごと描画しない**ので、枠だけが出ることはない。
 * 写真が用意できたら public/images/international/ へ置き、ここに1行足すだけでよい。
 *
 * 決めごと:
 * - alt は日本語・中国語の両方を書く（中国語画面に日本語の代替テキストを出さない）
 * - width / height を必ず入れる（読み込み中にレイアウトが飛ぶのを防ぐ）
 * - **写っている人の許可が取れているものだけ**を載せる。顔が判別できる写真は特に。
 *   撮影時に許可を取っていない写真は、後ろ姿・引きの構図など個人が特定できないものにする
 */
interface ActivityPhoto {
  src: string;
  width: number;
  height: number;
  alt: { ja: string; zh: string };
}

const PHOTOS: ActivityPhoto[] = [
  {
    src: '/images/international/court-china-jersey.webp', width: 886, height: 652,
    alt: {
      ja: '中国のユニフォームを着た参加者がネット越しに相手と向き合っている、平日夜の体育館',
      zh: '穿着中国队服的参加者隔网面对对手，平日夜间的体育馆',
    },
  },
  {
    src: '/images/international/court-wide-busy.webp', width: 1200, height: 900,
    alt: {
      ja: '複数のコートでダブルスをする参加者たち。さまざまな国のメンバーが同じ体育館でプレーしている',
      zh: '多个球场上打双打的参加者们。来自各国的成员在同一个体育馆里打球',
    },
  },
  {
    src: '/images/international/court-doubles-rally.webp', width: 1060, height: 700,
    alt: {
      ja: 'ダブルスのラリー中。前衛と後衛が位置を取り合っている',
      zh: '双打对拉中。前场与后场的选手正在跑位',
    },
  },
  {
    src: '/images/international/court-evening.webp', width: 1200, height: 900,
    alt: {
      ja: '平日夜の体育館。複数のコートに分かれて練習している',
      zh: '平日夜间的体育馆。分成多个球场在练习',
    },
  },
];

const COPY = {
  ja: {
    title: '国際交流バドミントン（川口・蕨）| 外国人・日本人が一緒に打てる場所',
    description: '埼玉県川口市・蕨市で平日夜に開催。中国・ベトナム・インドネシア・フィリピンなど多国籍のメンバーが参加しています。中国語での問い合わせ・当日サポートに対応。初心者・お一人での参加歓迎、参加費600円〜。',
    breadcrumbHome: 'ホーム',
    breadcrumb: '国際交流',
    h1: '国籍が違っても、コートの上では同じです',
    lead: '川口・蕨バドミントン交流会には、中国・ベトナム・インドネシア・フィリピンなど、さまざまな国のメンバーが集まっています。日本語に自信がなくても、バドミントンができれば通じます。',
    pointsHeading: 'この場所の特徴',
    points: [
      { icon: Users, title: '多国籍のメンバーが参加しています', body: '中国・ベトナム・インドネシア・フィリピンなど、さまざまな国の方が参加しています。日本人参加者も多く、どちらか一方に偏った場ではありません。' },
      { icon: Languages, title: '中国語で問い合わせ・申し込みができます', body: '中国語でのお問い合わせ・お申し込みに対応しています。当日のサポートも中国語で行えます。WeChat・小红书でも情報を発信しています。' },
      { icon: MessageCircle, title: 'WeChatから連絡できます', body: 'WeChatでのご連絡に対応しています。小程序（WeChatミニプログラム）からお申し込み済みの方は、サイトでの重複申込は不要です。' },
      { icon: MapPin, title: '蕨駅から歩いて行けます', body: 'JR京浜東北線「蕨駅」から徒歩圏内の芝園公民館（川口市）・蕨市民体育館（蕨市）が主な会場です。仕事終わりに寄れる場所で開催しています。' },
      { icon: CalendarDays, title: '平日の夜に開催しています', body: '19:00〜21:00 を中心に平日夜の開催です。参加費は通常活動で600円〜（シャトル代込み）。1回ごとの申し込みなので、続けられるときだけ来られます。' },
    ],
    firstHeading: 'はじめての方へ',
    firstBody: 'レッスン形式ではなく自由練習型なので、自分のペースで参加できます。超初級から上級（オープン）までクラスが分かれており、参加者の多くはお一人での参加です。持ち物はラケットと体育館用シューズだけで大丈夫です。',
    faqHeading: 'よくある質問',
    faq: [
      { question: '日本語が話せなくても参加できますか？', answer: '参加できます。中国語でのお問い合わせ・お申し込み・当日サポートに対応しています。バドミントンは言葉が少なくても一緒にプレーできます。' },
      { question: '外国人だけの集まりですか？', answer: 'いいえ。日本人参加者も多く参加しています。日本人と外国人が一緒にプレーする場です。' },
      { question: '一人で行っても大丈夫ですか？', answer: '大丈夫です。参加者の多くがお一人での参加です。ダブルスのペアは当日組みます。' },
      { question: '初心者でも参加できますか？', answer: '参加できます。超初級クラスがあり、レッスン形式ではなく自由練習型なので自分のペースで楽しめます。' },
      { question: '参加費はいくらですか？', answer: '通常活動は1回600円〜（シャトル代込み）です。大会は1,000円〜1,500円で、大会ごとに異なります。' },
      { question: 'どこで開催していますか？', answer: 'JR蕨駅から徒歩圏内の芝園公民館（川口市芝園町3-15）・蕨市民体育館（蕨市北町1-27-15）が中心です。' },
    ],
    photosHeading: '活動の様子',
    ctaActivity: '通常活動の日程を見る',
    ctaTournament: '大会の日程を見る',
    ctaContact: '中国語で問い合わせる',
    bridgeHeading: '日本語を「話せる」ようにしたい方へ',
    bridgeBody: '同じ運営（kawabado）で、中国語話者向けのAI日本語会話コースも提供しています。「読めるのに話せない」を終わらせるための、AI講師との毎日の会話練習です。バドミントンの参加とは別のサービスで、どちらか一方だけの利用でも構いません。',
    bridgeCta: 'AI日本語会話コースを見る',
  },
  zh: {
    title: '国际交流羽毛球（川口・蕨）| 外国人与日本人一起打球的地方',
    description: '在埼玉县川口市・蕨市的平日夜间举办。有来自中国、越南、印度尼西亚、菲律宾等多个国家的成员参加。支持中文咨询与当天现场支援。欢迎初学者与单人参加，参加费600日元起。',
    breadcrumbHome: '首页',
    breadcrumb: '国际交流',
    h1: '国籍不同，在球场上都一样',
    lead: '川口・蕨羽毛球交流会聚集了来自中国、越南、印度尼西亚、菲律宾等各国的成员。就算对日语没有信心，只要会打羽毛球就能沟通。',
    pointsHeading: '这里的特点',
    points: [
      { icon: Users, title: '有来自多个国家的成员', body: '有来自中国、越南、印度尼西亚、菲律宾等国家的朋友参加。日本人参加者也很多，不会偏向任何一方。' },
      { icon: Languages, title: '可以用中文咨询和报名', body: '支持中文咨询与报名，当天的现场支援也可以用中文进行。我们也在微信・小红书上发布信息。' },
      { icon: MessageCircle, title: '可以通过微信联系', body: '支持微信联系。已经通过小程序报名的朋友，不需要在网站上重复报名。' },
      { icon: MapPin, title: '从蕨站步行可达', body: '主要会场是JR京滨东北线「蕨站」步行可达的芝园公民馆（川口市）与蕨市民体育馆（蕨市）。下班后可以顺路过来。' },
      { icon: CalendarDays, title: '在平日晚上举办', body: '以19:00〜21:00的平日夜间为主。日常活动参加费600日元起（含羽毛球费用）。按次报名，有空的时候来就好。' },
    ],
    firstHeading: '第一次参加的朋友',
    firstBody: '不是上课形式，而是自由练习型，可以按自己的节奏参加。从超初级到公开组分了级别，多数参加者都是一个人来的。只需带球拍和室内运动鞋。',
    faqHeading: '常见问题',
    faq: [
      { question: '不会说日语也能参加吗？', answer: '可以。我们支持中文咨询、报名和当天现场支援。羽毛球即使语言不多也能一起打。' },
      { question: '是只有外国人的聚会吗？', answer: '不是。日本人参加者也很多，这是日本人和外国人一起打球的地方。' },
      { question: '一个人来可以吗？', answer: '可以。多数参加者都是一个人来的。双打的搭档当天再组。' },
      { question: '初学者也能参加吗？', answer: '可以。有超初级组，而且是自由练习型而非上课形式，可以按自己的节奏享受。' },
      { question: '参加费是多少？', answer: '日常活动每次600日元起（含羽毛球费用）。大会为1,000〜1,500日元，各场次不同。' },
      { question: '在哪里举办？', answer: '主要在JR蕨站步行可达的芝园公民馆（川口市芝园町3-15）与蕨市民体育馆（蕨市北町1-27-15）。' },
    ],
    photosHeading: '活动的样子',
    ctaActivity: '查看日常活动的日程',
    ctaTournament: '查看大会的日程',
    ctaContact: '用中文咨询',
    bridgeHeading: '想让日语真正「说得出口」的朋友',
    bridgeBody: '同一个运营方（kawabado）也提供面向中文母语者的AI日语会话课程。这是为了告别「看得懂却说不出」，与AI老师每天进行的会话练习。它与羽毛球活动是不同的服务，只用其中一项也完全没问题。',
    bridgeCta: '查看AI日语会话课程',
  },
} as const;

export const InternationalPage = () => {
  const { lang } = useLanguage();
  const l: L = lang === 'zh' ? 'zh' : 'ja';
  const t = COPY[l];
  const url = `https://kawabado.com/${l}/international`;

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
        {/* シェアカードは実際の活動写真にする（サイト既定のOGPだと中身が伝わらない） */}
        <meta property="og:image" content="https://kawabado.com/images/international/court-wide-busy.webp" />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={url} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/international" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/international" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/international" />
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

        {/* 写真は用意できたぶんだけ出す。0枚のときはセクションごと描かない
            （「準備中」の空枠を見せない） */}
        {PHOTOS.length > 0 && (
          <section aria-labelledby="photos" className="mb-12">
            <h2 id="photos" className="text-lg font-bold text-gray-900 mb-4">{t.photosHeading}</h2>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {PHOTOS.map((ph) => (
                <li key={ph.src} className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <img
                    src={ph.src}
                    alt={ph.alt[l]}
                    width={ph.width}
                    height={ph.height}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto object-cover"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

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

        {/* 2事業をつなぐ唯一の自然な接点。押しつけず、別サービスであることを明示する */}
        <section aria-labelledby="bridge" className="rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">kawabado</p>
          <h2 id="bridge" className="text-lg font-bold text-gray-900 mb-2">{t.bridgeHeading}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{t.bridgeBody}</p>
          <Link to={`/${l}/ai-course`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
            {t.bridgeCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      </main>
    </>
  );
};

export default InternationalPage;
