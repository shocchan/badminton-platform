import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CalendarDays, MapPin, ArrowRight, ChevronRight, Wallet, Users } from 'lucide-react';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { FAQSchema } from '../components/seo/FAQSchema';
import { useLanguage } from '../contexts/LanguageContext';
import { useTournaments } from '../hooks/useTournaments';
import { TOURNAMENT_TYPES } from '../lib/tournamentTypes';
import type { Tournament } from '../types';

/**
 * 大会一覧ページ（2026-08-31 新設）。
 *
 * 【なぜ作るか】
 * `/ja/tournaments`（末尾idなし）は**ルートが定義されていなかった**。
 * それでも 200 は返るので、index.html のフォールバックが出る＝
 * title「川口・蕨バドミントン交流会」・description「川口市・蕨市エリアのバドミントン交流会」
 * という既定値のページが1枚、検索エンジンから見えていた。
 *
 * 一方 Search Console 実測（〜2026-08-21）では「川口市バドミントン大会」が
 * **17表示・平均7.7位**あり、需要はある。受け皿が個別大会ページしか無く、
 * 個別ページは終わると内容が古くなるので、恒常の受け皿を1枚立てる。
 *
 * 【種目別ページとの役割分担】
 * - ここ（/tournaments）… 種目を問わず「次にいつ大会があるか」。地域＋大会の検索を受ける
 * - /tournaments/singles など … 種目ごとの説明。種目＋地域の検索を受ける（2026-08-24 新設）
 * 上下でリンクし合って、どちらから来ても行き止まりにならないようにする。
 *
 * 【トップページとの関係】
 * トップの大会一覧は今までどおり触らない。ここは「過去も含めた恒常ページ」で、
 * トップは「いま申し込めるもの」。同じ役割を2枚作らない。
 */

const MAX_PAST_SHOWN = 12;

/** JSTの「今日」（YYYY-MM-DD）。描画中ではなく useState の初期化で1回だけ呼ぶ */
const todayJstOnce = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

const fmtDate = (iso: string, l: 'ja' | 'zh') =>
  new Date(`${iso.slice(0, 10)}T00:00:00+09:00`).toLocaleDateString(
    l === 'zh' ? 'zh-CN' : 'ja-JP',
    { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'Asia/Tokyo' },
  );

const COPY = {
  ja: {
    breadcrumbHome: 'ホーム',
    breadcrumb: '大会一覧',
    h1: '川口・蕨のバドミントン大会',
    lead: 'カワバド（川口・蕨バドミントン交流会）が主催する「川口・蕨バド交流杯」の一覧です。平日の夜を中心に、川口市・蕨市の会場で開催しています。超初級から参加でき、お一人でのお申し込みが中心です。',
    upcoming: '開催予定の大会',
    loading: '読み込み中…',
    emptyTitle: 'いま開催予定の大会はありません',
    emptyBody: '次の大会が決まりしだい、このページとトップページに掲載します。平日夜の通常活動は毎週おこなっています。',
    emptyCta: '通常活動の日程を見る',
    typesHeading: '種目から探す',
    typesLead: '種目ごとに、進め方と過去の開催をまとめたページがあります。',
    factsHeading: '大会について',
    facts: [
      { icon: Users, label: 'クラス', value: '超初級・初級・中級・オープンの4クラスに分かれています。超初級・初級は初心者の方が対象で、試合に慣れていない方も参加できます。' },
      { icon: Wallet, label: '参加費', value: '大会ごとに異なります。各大会ページに記載しています。通常活動（1回600円〜）とは別の料金です。' },
      { icon: MapPin, label: '会場', value: '芝園公民館（川口市芝園町3-15）と蕨市民体育館（蕨市北町1-27-15）が中心です。どちらもJR蕨駅から徒歩圏内です。' },
      { icon: CalendarDays, label: '持ち物', value: 'ラケット・室内シューズに加えて、大会は**シャトル持参制**です（超初級ダブルス大会を除く）。平日夜の通常活動はシャトル代が会費に含まれるため持参不要で、ここが通常活動といちばん違う点です。' },
    ],
    faqHeading: 'よくある質問',
    faq: [
      { question: '一人でも申し込めますか？', answer: '申し込めます。参加者の多くがお一人での参加です。ペアが必要な種目でも、お一人でお申し込みいただけます。' },
      { question: '大会に出たことがなくても大丈夫ですか？', answer: '超初級・初級クラスは初心者の方を対象にしています。試合に慣れていない方も参加できます。' },
      { question: 'シャトルは持っていく必要がありますか？', answer: '大会はシャトル持参制です（超初級ダブルス大会を除く）。平日夜の通常活動は会費にシャトル代が含まれるため持参不要です。' },
      { question: '参加費はどうやって払いますか？', answer: '大会によって異なります。クレジットカード払いに対応している大会もあります。各大会ページのエントリーフォームでご確認ください。' },
    ],
    pastHeading: (n: number) => `これまでの開催（${n}回）`,
    pastMore: (n: number, max: number) => `ほかに${n}回の開催があります（ここには直近${max}回まで表示しています）。`,
    ctaActivity: '平日夜の通常活動を見る',
    ctaFaq: 'よくある質問',
  },
  zh: {
    breadcrumbHome: '首页',
    breadcrumb: '赛事一览',
    h1: '川口・蕨的羽毛球比赛',
    lead: 'kawabado（川口・蕨羽毛球交流会）主办的「川口・蕨羽毛球交流杯」一览。以平日晚上为主，在川口市・蕨市的场地举办。从超初级起即可参加，多数是一个人报名。',
    upcoming: '即将举办的比赛',
    loading: '加载中…',
    emptyTitle: '目前没有举办计划',
    emptyBody: '下一场比赛确定后，会在本页和首页公布。平日晚上的常规活动每周都在进行。',
    emptyCta: '查看常规活动日程',
    typesHeading: '按项目查找',
    typesLead: '每个项目都有单独的页面，说明进行方式与过往的举办记录。',
    factsHeading: '关于比赛',
    facts: [
      { icon: Users, label: '级别', value: '分为超初级・初级・中级・公开四个级别。超初级和初级面向初学者，没有比赛经验也可以参加。' },
      { icon: Wallet, label: '参赛费', value: '因比赛而异，记载于各比赛页面。与常规活动（每次600日元起）是不同的费用。' },
      { icon: MapPin, label: '场地', value: '以芝园公民馆（川口市芝园町3-15）和蕨市民体育馆（蕨市北町1-27-15）为主，两处都在JR蕨站步行范围内。' },
      { icon: CalendarDays, label: '携带物品', value: '除球拍和室内运动鞋外，比赛需**自带羽毛球**（超初级双打比赛除外）。平日晚上的常规活动球费已含在活动费中，无需自带——这是与常规活动最大的不同。' },
    ],
    faqHeading: '常见问题',
    faq: [
      { question: '一个人也能报名吗？', answer: '可以。多数参加者都是一个人来的。需要搭档的项目，一个人也可以报名。' },
      { question: '没有参加过比赛也可以吗？', answer: '超初级和初级面向初学者，没有比赛经验也可以参加。' },
      { question: '需要自带羽毛球吗？', answer: '比赛需自带（超初级双打比赛除外）。平日晚上的常规活动球费已含在活动费中，无需自带。' },
      { question: '参赛费怎么支付？', answer: '因比赛而异，部分比赛支持信用卡支付。请在各比赛页面的报名表单确认。' },
    ],
    pastHeading: (n: number) => `过去的举办记录（${n}次）`,
    pastMore: (n: number, max: number) => `另有 ${n} 次举办记录（此处只显示最近的 ${max} 次）。`,
    ctaActivity: '查看平日晚上的常规活动',
    ctaFaq: '常见问题',
  },
} as const;

export const TournamentListPage = () => {
  const { lang } = useLanguage();
  const l: 'ja' | 'zh' = lang === 'zh' ? 'zh' : 'ja';
  const t = COPY[l];
  const { tournaments, loading } = useTournaments();

  // 「今日」はマウント時の1回で固定する。描画のたびに時計を読むと純粋でなくなり
  // （react-hooks/purity）、再描画のタイミング次第で開催予定と過去の境界が動く。
  // useState の遅延初期化なら初回だけ評価される
  const [todayJst] = useState(todayJstOnce);
  const shown = (tournaments ?? []).filter(
    (x: Tournament) => (x.visibility ?? 'published') === 'published'
      && x.status !== 'cancelled'
      && !!x.event_date,
  );
  const upcoming = shown
    .filter((x) => x.event_date.slice(0, 10) >= todayJst)
    .sort((a, b) => (a.event_date < b.event_date ? -1 : 1));
  const past = shown
    .filter((x) => x.event_date.slice(0, 10) < todayJst)
    .sort((a, b) => (a.event_date > b.event_date ? -1 : 1));

  const url = `https://kawabado.com/${l}/tournaments`;
  const faqItems = t.faq.map((f) => ({ question: f.question, answer: f.answer }));

  return (
    <>
      <Helmet>
        <html lang={l} />
        <title>{l === 'zh'
          ? '川口・蕨的羽毛球比赛 | 交流杯的举办预定与过往记录'
          : '川口・蕨のバドミントン大会 | 交流杯の開催予定と過去の記録'}</title>
        <meta name="description" content={l === 'zh'
          ? '川口市・蕨市举办的羽毛球比赛「川口・蕨羽毛球交流杯」一览。以平日晚上为主，分超初级到公开四个级别。一个人也可以报名。'
          : '川口市・蕨市で開催しているバドミントン大会「川口・蕨バド交流杯」の一覧です。平日夜が中心で、超初級からオープンまで4クラス。お一人でも申し込めます。'} />
        <meta property="og:title" content={l === 'zh' ? '川口・蕨的羽毛球比赛' : '川口・蕨のバドミントン大会'} />
        <meta property="og:url" content={url} />
        <meta property="og:locale" content={l === 'zh' ? 'zh_CN' : 'ja_JP'} />
        <link rel="canonical" href={url} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/tournaments" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/tournaments" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/tournaments" />
      </Helmet>

      <main className="max-w-3xl mx-auto px-4 py-8 sm:py-12">
        <Breadcrumbs items={[
          { label: t.breadcrumbHome, path: `/${l}/` },
          { label: t.breadcrumb },
        ]} />

        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 leading-snug mb-3">{t.h1}</h1>
          <p className="text-gray-600 leading-relaxed">{t.lead}</p>
        </header>

        {/* 開催予定が最初。無いときも隠さず「いま無い」と言って、通常活動へ逃がす */}
        <section aria-labelledby="upcoming" className="mb-10">
          <h2 id="upcoming" className="text-lg font-bold text-gray-900 mb-3">{t.upcoming}</h2>
          {loading ? (
            <p className="text-sm text-gray-500">{t.loading}</p>
          ) : upcoming.length > 0 ? (
            <ul className="space-y-2.5">
              {upcoming.map((x) => (
                <li key={x.id}>
                  <Link to={`/${l}/tournaments/${x.id}`}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4 hover:border-kb-blue transition-colors">
                    <div className="min-w-0">
                      <p className="font-bold text-gray-900 text-[0.98rem] truncate">{x.title}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />{fmtDate(x.event_date, l)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />{x.location}
                        </span>
                        {x.level && <span className="inline-flex items-center gap-1">
                          <Users className="h-3.5 w-3.5" aria-hidden="true" />{x.level}
                        </span>}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-kb-blue" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="font-bold text-gray-800 text-[0.95rem] mb-1">{t.emptyTitle}</p>
              <p className="text-sm text-gray-600 leading-relaxed">{t.emptyBody}</p>
              <Link to={`/${l}/activity`}
                className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-kb-blue hover:underline">
                {t.emptyCta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          )}
        </section>

        {/* 種目別ページへ。ここが無いと種目ページが検索からしか辿れない */}
        <section aria-labelledby="types" className="mb-10">
          <h2 id="types" className="text-lg font-bold text-gray-900 mb-1">{t.typesHeading}</h2>
          <p className="text-sm text-gray-600 mb-3">{t.typesLead}</p>
          <ul className="grid gap-2.5 sm:grid-cols-3">
            {TOURNAMENT_TYPES.map((def) => (
              <li key={def.slug}>
                <Link to={`/${l}/tournaments/${def.slug}`}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white p-4 text-sm font-bold text-gray-800 hover:border-kb-blue transition-colors">
                  {def.name[l]}
                  <ChevronRight className="h-4 w-4 shrink-0 text-kb-blue" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="facts" className="mb-10">
          <h2 id="facts" className="text-lg font-bold text-gray-900 mb-3">{t.factsHeading}</h2>
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {t.facts.map((f) => (
              <div key={f.label} className="flex flex-col sm:flex-row gap-1 sm:gap-4 p-4">
                <dt className="flex items-center gap-1.5 text-xs font-bold text-gray-500 sm:w-24 sm:shrink-0 sm:pt-0.5">
                  <f.icon className="h-3.5 w-3.5" aria-hidden="true" />{f.label}
                </dt>
                <dd className="text-sm text-gray-800 leading-relaxed">
                  {/* 「**シャトル持参制**」のような強調はマーカーを剥がして太字にする */}
                  {f.value.split('**').map((part, i) =>
                    i % 2 === 1 ? <strong key={i} className="font-bold">{part}</strong> : part)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="faq" className="mb-10">
          <h2 id="faq" className="text-lg font-bold text-gray-900 mb-3">{t.faqHeading}</h2>
          <FAQSchema items={faqItems} />
          <dl className="divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white">
            {t.faq.map((f) => (
              <div key={f.question} className="p-4">
                <dt className="font-bold text-gray-900 text-[0.95rem] mb-1.5">{f.question}</dt>
                <dd className="text-sm text-gray-600 leading-relaxed">{f.answer}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 過去の開催は畳んで最後に。開催予定を埋もれさせない（種目別ページと同じ方針） */}
        {past.length > 0 && (
          <details className="rounded-2xl border border-gray-200 bg-white">
            <summary className="cursor-pointer list-none p-4 text-sm font-bold text-gray-700 flex items-center justify-between gap-2">
              <span>{t.pastHeading(past.length)}</span>
              <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </summary>
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {past.slice(0, MAX_PAST_SHOWN).map((x) => (
                <li key={x.id}>
                  <Link to={`/${l}/tournaments/${x.id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-gray-50 transition-colors">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{x.title}</p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {fmtDate(x.event_date, l)}・{x.location}{x.level ? `・${x.level}` : ''}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
            {past.length > MAX_PAST_SHOWN && (
              <p className="border-t border-gray-100 p-4 text-xs text-gray-500">
                {t.pastMore(past.length - MAX_PAST_SHOWN, MAX_PAST_SHOWN)}
              </p>
            )}
          </details>
        )}

        <div className="mt-8 flex flex-col sm:flex-row gap-2.5">
          <Link to={`/${l}/activity`}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl bg-kb-blue px-5 text-sm font-bold text-white hover:bg-kb-blue-deep transition-colors">
            {t.ctaActivity} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          <Link to={`/${l}/faq`}
            className="inline-flex items-center justify-center gap-1.5 min-h-11 rounded-xl border border-gray-300 bg-white px-5 text-sm font-bold text-gray-700 hover:bg-gray-50 transition-colors">
            {t.ctaFaq}
          </Link>
        </div>
      </main>
    </>
  );
};

export default TournamentListPage;
