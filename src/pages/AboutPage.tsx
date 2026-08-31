import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Clock, Users, Globe2, DoorOpen } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import { OPERATOR_NAME } from '../lib/seo/aboutFacts';

/**
 * 主催者ページ（2026-08-31 新設）。
 *
 * 【なぜ作るか】
 * 22ページあって「誰がやっているか」のページが1枚も無かった。
 * サークルブックの掲載では主催者プロフィールを埋めたのに、自社サイトには無い状態だった。
 *
 * 効くのは2つ。
 * 1. 一人で申し込もうとしている人は「誰が主催か」を必ず見る（サークル探しの実際の行動）
 * 2. 検索側の E-E-A-T。「実在する誰かが、経験にもとづいて運営している」ことを示す面が無かった
 *
 * 【書いてよい事実の範囲】
 * **全部ブログの既存記事に書いてあることだけ**を使う。出典は各段落のコメントに残す。
 * ここで新しい物語を作らない。「参加者◯人」「満足度◯％」のような未計測の数字も書かない。
 *
 * 【氏名を出してよい理由】
 * `src/lib/legal/kawabadoLegalFacts.ts` の operatorName が 'kawabado 安田翔' で、
 * 特商法ページで既に公開している。ブログ id=6 でも本人が名乗っている。
 * なので**このページで新たに個人情報を晒すことにはならない**。
 * 住所・電話は特商法の方針（請求により開示）に合わせ、ここには書かない。
 *
 * 【会場のアクセスをここに書かない理由】
 * 徒歩分数や出口の表記は会場ガイド（VenueGuidePage）に集約する。
 * 同じ事実を2か所に置くと、片方だけ古くなる。ここからはリンクで送る。
 */

type L = 'ja' | 'zh';

const COPY = {
  ja: {
    // title / description は src/lib/seo/staticSeo.json と**一字一句そろえる**。
    // ズレると staticSeo.test.ts が落ちる（画面と素のHTMLで違う名乗りをしないための番人）
    title: 'カワバドについて | 主催者と、平日夜・入会なしにしている理由',
    description: '川口・蕨バドミントン交流会（カワバド）の主催者と、この形にしている理由。上海で見た男女合同の対抗戦がきっかけです。平日夜19:00〜21:00、入会金・月会費なしで1回ごとの参加です。',
    breadcrumbHome: 'ホーム',
    breadcrumb: 'カワバドについて',
    h1: 'カワバドについて',
    lead: '川口・蕨バドミントン交流会（カワバド）は、埼玉県川口市・蕨市で平日の夜に活動しているバドミントンの交流会です。このページには、誰がどういう理由でやっているのかを書いています。',

    hostHeading: '主催者',
    hostName: `${OPERATOR_NAME}（しょっちゃん）`,
    // 出典: ブログ id=6「川口・蕨バド交流杯、はじめます。」
    hostBody: '川口・蕨バド交流杯の主催です。国籍を問わず一緒にコートに立つうちに、バドミントンは言葉がなくても仲良くなれるスポーツだと感じるようになりました。その輪を広げたくて、この会を始めました。',

    originHeading: 'きっかけは、上海で見た大会でした',
    // 出典: ブログ id=35「上海で見た、男女合同開催なのに女性ペアが優勝するバドミントン大会」
    originBody: [
      '仕事などで年に2〜3回、上海に行く機会があります。そのたびに現地のバドミントンの活動や対抗戦に参加させてもらってきました。',
      '最初に驚いたのは集まり方でした。男女が混ざって全員が集まり、そのまま総当たり戦をする。強い人だけの集まりでも、初心者だけの集まりでもなく、全部一緒です。',
      '成立しているのは、点数ハンデ制を入れているからです。組み合わせに応じて、あらかじめ点差をつけた状態から始める。これだけで、実力が違う相手同士の試合が消化試合になりません。実際、女性ペアが優勝することも稀ではありませんでした。',
      '強い人が勝つ大会はたくさんあります。それはそれで健全です。ただ上海で見たのは、「強さだけが基準じゃない場」も設計次第で作れるということでした。しかも誰も手加減していない。仕組みひとつで、その場にいる人の顔ぶれが変わる。これは持って帰りたいと思いました。',
    ],

    whyHeading: 'この形にしている理由',
    why: [
      { icon: Clock, title: '平日の夜19:00〜21:00にしている', body: '帰国してから同じような場を探しましたが、自分が探した範囲では、平日の夜に対抗戦をやっているところが多くありませんでした。土日の朝から夕方までかかる大会はたくさんあります。でも「仕事終わりに、ちゃんと試合をして帰る」という選択肢が思ったより見つからなかった。無いなら作ればいい、と思ったのが始まりです。' },
      { icon: Users, title: '小規模の総当たりにしている', body: '待ち時間を減らすためです。大会は1回の参加で最低4試合以上を保証しています。せっかく来たのに1〜2試合で終わる、という時間の使い方をなくしたいと思っています。' },
      { icon: Globe2, title: '日本語と中国語の両方で案内している', body: '言語を理由に来ない人を減らしたいからです。学生の頃から、日中友好の架け橋になりたいと思って活動してきました。国と国の話は自分にはどうにもできませんが、同じコートに立って、ナイスショットに手を挙げて、笑って帰る。それを積み重ねた先にあるものは信じています。バドミントンはそのための道具としてかなり優秀です。言葉が通じなくても成立するので。' },
      { icon: DoorOpen, title: '入会制にしていない', body: '入会金も月会費も会員登録もありません。参加したい回だけ申し込む形です。続けられるか分からないから踏み出せない、という人に、まず1回だけ試してほしいからです。合わなければ次に申し込まなければいい。それを気まずく感じなくていい設計にしています。' },
    ],

    doneHeading: 'これまでにやってきたこと',
    // 出典: ブログ各記事（第1回=2026-06-18 id=9 / 火瓶杯=2026-08-14 id=23 /
    //       シャトル供養=id=30 / ばりかた屋=id=11,16）
    done: [
      { label: '川口・蕨バド交流杯', body: '2026年6月に第1回を開催しました。シングルス、ダブルス、ミックスダブルス、ハンデ制の合同ダブルスなど、回ごとにやり方を変えながら続けています。' },
      { label: '外の大会への参加', body: '火瓶杯バドミントン団体戦に川口・蕨の代表として出場し、3位入賞しました。' },
      { label: 'シャトル供養カウンター', body: '打ち終わったシャトルを数えて記録しています。何球打ったかは、この場がどれだけ動いたかの記録でもあります。' },
      { label: '地域のお店との取り組み', body: '川口のラーメン店「ばりかた屋」とのコラボ特典をやりました。' },
    ],
    doneCta: 'ブログで活動の記録を見る',

    nowHeading: 'いまのところ',
    // 出典: ブログ id=35 の結び
    nowBody: 'まだ小さな会です。大きなことは言えません。ただ、川口・蕨のコートには、日本人も中国語を話す人も、上手い人も始めたばかりの人も、普通に混ざって立っています。上海で見た光景に、少しは近づけているんじゃないかと思っています。',

    joinHeading: '参加してみるには',
    joinBody: '平日夜の通常活動は1回600円（シャトル代込み）です。ラケットと室内シューズだけご持参ください。大会は超初級から4クラスに分かれていて、参加費は大会ごとに異なります。',
    ctaActivity: '通常活動の日程を見る',
    ctaTournaments: '大会の一覧を見る',
    ctaVenues: '会場ガイド（地図・アクセス）',
    ctaContact: 'お問い合わせ',
  },
  zh: {
    title: '关于kawabado | 主办人与这样做的理由',
    description: '川口・蕨羽毛球交流会（kawabado）的主办人，以及为什么采用平日晚上、无需入会的形式。起点是在上海看到的男女合同对抗赛。每次600日元起。',
    breadcrumbHome: '首页',
    breadcrumb: '关于kawabado',
    h1: '关于 kawabado',
    lead: '川口・蕨羽毛球交流会（kawabado）是在埼玉县川口市・蕨市，于平日晚上活动的羽毛球交流会。这一页写的是，谁在做这件事，以及为什么这样做。',

    hostHeading: '主办人',
    hostName: `${OPERATOR_NAME}（Shocchan）`,
    hostBody: '川口・蕨羽毛球交流杯的主办人。在不分国籍、一起站上球场的过程中，越来越觉得羽毛球是一项即使没有语言也能亲近起来的运动。想把这个圈子扩大，于是有了这个交流会。',

    originHeading: '起点，是在上海看到的一场比赛',
    originBody: [
      '因为工作等原因，每年会去上海两三次。每次都会参加当地的羽毛球活动和对抗赛。',
      '最先让我惊讶的是集合的方式。男女混在一起全员集合，然后直接打循环赛。不是只有强手的聚会，也不是只有初学者的聚会，全部在一起。',
      '之所以能成立，是因为引入了让分制。根据搭配，事先设定好分差再开始。仅此一项，实力不同的对手之间的比赛就不会变成走过场。实际上，女子组合夺冠也并不罕见。',
      '强者获胜的比赛有很多，那本身也很健全。但我在上海看到的是——「不只以强弱为标准的场合」，只要设计得当也是能做出来的。而且没有人在放水。一个机制的改变，就能改变站在那里的人的面孔。这件事我想带回去。',
    ],

    whyHeading: '为什么是这样的形式',
    why: [
      { icon: Clock, title: '定在平日晚上19:00〜21:00', body: '回国后我找过类似的场合，但在我找到的范围内，平日晚上办对抗赛的地方并不多。周末从早到晚的比赛有很多，但「下班后好好打几场再回家」这个选项，比想象中难找。没有的话就自己做——这就是开始。' },
      { icon: Users, title: '采用小规模循环赛', body: '为了减少等待时间。比赛保证每次参加至少四场。不希望出现好不容易来了却只打一两场就结束的情况。' },
      { icon: Globe2, title: '日语和中文都提供说明', body: '为了减少因为语言而不来的人。从学生时代起，我就想成为中日友好的桥梁。国与国之间的事我无能为力，但站在同一片球场上，为一记好球举手，笑着回家——我相信这些累积起来会通向某个地方。羽毛球作为工具相当出色，因为它不需要语言也能成立。' },
      { icon: DoorOpen, title: '不采用入会制', body: '没有入会费、月会费和会员登记，只报名想参加的那一次。因为想让「不确定能不能坚持所以迈不出脚」的人，先试一次看看。不合适的话，下次不报名就好，而且不必为此感到尴尬。' },
    ],

    doneHeading: '至今做过的事',
    done: [
      { label: '川口・蕨羽毛球交流杯', body: '2026年6月举办了第一届。单打、双打、混合双打、让分制的联合双打等，每一届都在调整做法并持续举办。' },
      { label: '参加外部比赛', body: '作为川口・蕨的代表参加火瓶杯羽毛球团体赛，获得第三名。' },
      { label: '羽毛球供养计数器', body: '把打完的羽毛球数下来做记录。打了多少球，也是这个场所动过多少的记录。' },
      { label: '与本地店铺的合作', body: '与川口的拉面店「ばりかた屋」做过合作优惠。' },
    ],
    doneCta: '在博客查看活动记录',

    nowHeading: '目前',
    nowBody: '还是个很小的会，说不上什么大话。只是在川口・蕨的球场上，日本人和说中文的人，打得好的人和刚开始的人，很自然地混在一起。我想，距离在上海看到的那个光景，多少是近了一些。',

    joinHeading: '想参加的话',
    joinBody: '平日晚上的常规活动每次600日元（含羽毛球费用）。只需自备球拍和室内运动鞋。比赛从超初级起分为四个级别，参赛费因比赛而异。',
    ctaActivity: '查看常规活动日程',
    ctaTournaments: '查看比赛一览',
    ctaVenues: '场地指南（地图・交通）',
    ctaContact: '联系我们',
  },
} as const;

export const AboutPage = () => {
  const { lang } = useLanguage();
  const l: L = lang === 'zh' ? 'zh' : 'ja';
  const t = COPY[l];
  const url = `https://kawabado.com/${l}/about`;

  /**
   * 主催者を Person として名乗り、団体の founder に紐づける。
   * 団体（#organization）はトップと Worker 側で定義済みなので、ここでは @id で参照するだけ。
   * 同じ実体を2回定義すると、検索側から見て別団体が2つあるように見える。
   */
  const personJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    '@id': 'https://kawabado.com/#founder',
    name: OPERATOR_NAME,
    alternateName: 'しょっちゃん',
    jobTitle: l === 'zh' ? '主办人' : '主催者',
    worksFor: { '@id': 'https://kawabado.com/#organization' },
    url: url,
  };

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
        <link rel="canonical" href={url} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/about" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/about" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/about" />
        <script type="application/ld+json">{JSON.stringify(personJsonLd)}</script>
      </Helmet>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <Breadcrumbs items={[
          { label: t.breadcrumbHome, path: `/${l}/` },
          { label: t.breadcrumb },
        ]} />

        <header className="mb-10">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-3">{t.h1}</h1>
          <p className="text-gray-600 leading-relaxed">{t.lead}</p>
        </header>

        <section aria-labelledby="host" className="mb-10">
          <h2 id="host" className="text-lg font-bold text-gray-900 mb-3">{t.hostHeading}</h2>
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="font-bold text-gray-900 mb-2">{t.hostName}</p>
            <p className="text-sm text-gray-700 leading-relaxed">{t.hostBody}</p>
          </div>
        </section>

        <section aria-labelledby="origin" className="mb-10">
          <h2 id="origin" className="text-lg font-bold text-gray-900 mb-3">{t.originHeading}</h2>
          <div className="space-y-3">
            {t.originBody.map((p, i) => (
              <p key={i} className="text-sm text-gray-700 leading-relaxed">{p}</p>
            ))}
          </div>
        </section>

        <section aria-labelledby="why" className="mb-10">
          <h2 id="why" className="text-lg font-bold text-gray-900 mb-3">{t.whyHeading}</h2>
          <ul className="space-y-2.5">
            {t.why.map((w) => (
              <li key={w.title} className="rounded-2xl border border-gray-200 bg-white p-4">
                <p className="flex items-center gap-2 font-bold text-gray-900 text-[0.95rem] mb-1.5">
                  <w.icon className="h-4 w-4 shrink-0 text-kb-blue" aria-hidden="true" />{w.title}
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">{w.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="done" className="mb-10">
          <h2 id="done" className="text-lg font-bold text-gray-900 mb-3">{t.doneHeading}</h2>
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {t.done.map((d) => (
              <div key={d.label} className="flex flex-col sm:flex-row gap-1 sm:gap-4 p-4">
                <dt className="text-xs font-bold text-gray-500 sm:w-36 sm:shrink-0 sm:pt-0.5">{d.label}</dt>
                <dd className="text-sm text-gray-800 leading-relaxed">{d.body}</dd>
              </div>
            ))}
          </dl>
          <Link to={`/${l}/blog`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
            {t.doneCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>

        <section aria-labelledby="now" className="mb-10">
          <h2 id="now" className="text-lg font-bold text-gray-900 mb-3">{t.nowHeading}</h2>
          <p className="text-sm text-gray-700 leading-relaxed">{t.nowBody}</p>
        </section>

        <section aria-labelledby="join" className="mb-4">
          <h2 id="join" className="text-lg font-bold text-gray-900 mb-3">{t.joinHeading}</h2>
          <p className="text-sm text-gray-700 leading-relaxed mb-4">{t.joinBody}</p>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <Link to={`/${l}/activity`}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl bg-kb-blue px-5 text-sm font-bold text-white hover:bg-kb-blue-deep transition-colors">
              {t.ctaActivity} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link to={`/${l}/tournaments`}
              className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
              {t.ctaTournaments}
            </Link>
          </div>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
            <Link to={`/${l}/venues`} className="font-bold text-kb-blue hover:underline">{t.ctaVenues}</Link>
            <Link to={`/${l}/contact`} className="font-bold text-kb-blue hover:underline">{t.ctaContact}</Link>
          </div>
        </section>
      </main>
    </>
  );
};

export default AboutPage;
