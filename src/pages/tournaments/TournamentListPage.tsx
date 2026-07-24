import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { CalendarDays, MapPin, Trophy, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { useTournaments } from '../../hooks/useTournaments';
import { useLanguage } from '../../contexts/LanguageContext';
import { useStaticPageMeta } from '../../hooks/useStaticPageMeta';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { TournamentCard } from '../../components/TournamentCard';
import { TournamentCardSkeleton } from '../../components/TournamentCardSkeleton';
import { ErrorState, EmptyState } from '../../components/ui/StateViews';

// 大会ディスカバリーページ（/:lang/tournaments）。
// 「川口 バドミントン 大会」「蕨 バドミントン 大会」「埼玉 ミックスダブルス 大会」等の
// 検索意図の受け皿。データは Supabase の既存 tournaments を利用し、手書きの重複を作らない。

const TEXT = {
  ja: {
    home: 'ホーム',
    crumb: '大会一覧',
    h1: '川口・蕨のバドミントン大会一覧',
    intro:
      '川口市・蕨市を中心に埼玉で開催しているバドミントン交流大会の一覧です。シングルス・ダブルス・ミックスダブルスなど、超初級からオープンまでレベル別に開催しています。1人参加・初参加も歓迎で、最低4試合以上を保証。募集中の大会はこのページから直接お申し込みいただけます。',
    upcoming: '募集中・開催予定の大会',
    noUpcoming: '現在募集中の大会はありません。次回の開催情報をお待ちください。',
    past: '過去に開催した大会',
    noPast: '過去大会の記録はまだありません。',
    detail: '大会詳細を見る',
    relatedTitle: '過去大会のレポート・結果',
    gallery: '大会レポート・写真ギャラリー',
    results: '大会結果・成績表（第1〜3回）',
    fee: '参加費',
    yen: '円',
    ended: '終了',
  },
  zh: {
    home: '首页',
    crumb: '赛事列表',
    h1: '川口・蕨的羽毛球比赛一览',
    intro:
      '这是以埼玉县川口市・蕨市为中心举办的羽毛球交流比赛列表。设有单打・双打・混合双打等项目，从超初级到公开级别按水平分组举办。欢迎单独参加・首次参加，保证至少4场比赛。正在报名中的比赛可直接在本页面报名。',
    upcoming: '报名中・即将举办的比赛',
    noUpcoming: '目前没有正在报名的比赛，敬请期待下次举办信息。',
    past: '往届比赛',
    noPast: '暂无往届比赛记录。',
    detail: '查看比赛详情',
    relatedTitle: '往届比赛的回顾・结果',
    gallery: '赛事回顾・照片画廊',
    results: '比赛结果・成绩表（第1〜3届）',
    fee: '参加费',
    yen: '日元',
    ended: '已结束',
  },
} as const;

export const TournamentListPage = () => {
  const { lang } = useLanguage();
  const homeLang = lang === 'zh' ? 'zh' : 'ja';
  const t = TEXT[homeLang];
  const { tournaments, loading, error } = useTournaments();

  // ページ meta は Worker + useStaticPageMeta が管理。JSON-LD のみ Helmet で出す。
  useStaticPageMeta();

  const todayStr = new Date().toISOString().slice(0, 10);
  const visible = tournaments.filter(x => (x.visibility ?? 'published') === 'published');
  const upcoming = visible
    .filter(x => x.event_date >= todayStr)
    .sort((a, b) => a.event_date.localeCompare(b.event_date));
  const past = visible
    .filter(x => x.event_date < todayStr)
    .sort((a, b) => b.event_date.localeCompare(a.event_date));

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(homeLang === 'zh' ? 'zh-CN' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    });

  // 募集中の大会を ItemList (SportsEvent) の構造化データとして出力
  const itemListJsonLd =
    upcoming.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: t.h1,
          itemListElement: upcoming.map((x, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'SportsEvent',
              name: x.title,
              startDate: x.event_date,
              sport: 'Badminton',
              eventStatus: 'https://schema.org/EventScheduled',
              location: {
                '@type': 'Place',
                name: x.location,
                address: x.venue_address || x.location,
              },
              url: `https://kawabado.com/${homeLang}/tournaments/${x.id}`,
              offers: {
                '@type': 'Offer',
                price: x.entry_fee,
                priceCurrency: 'JPY',
              },
            },
          })),
        }
      : null;

  return (
    <>
      {itemListJsonLd && (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(itemListJsonLd)}</script>
        </Helmet>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
        <Breadcrumbs
          items={[
            { label: t.home, path: `/${homeLang}/` },
            { label: t.crumb },
          ]}
        />

        <header className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Trophy className="w-7 h-7 text-blue-500 flex-shrink-0" /> {t.h1}
          </h1>
          <p className="text-gray-600 text-sm sm:text-base leading-relaxed">{t.intro}</p>
        </header>

        {/* 募集中・開催予定 */}
        <section className="mb-12">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-500" /> {t.upcoming}
          </h2>

          {loading && (
            <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
              {[...Array(2)].map((_, i) => <TournamentCardSkeleton key={i} />)}
            </div>
          )}

          {error && <ErrorState message={error} />}

          {!loading && !error && upcoming.length === 0 && (
            <EmptyState emoji="🗓️" title={t.noUpcoming} />
          )}

          {!loading && !error && upcoming.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
              {upcoming.map(tour => (
                <TournamentCard key={tour.id} tournament={tour} />
              ))}
            </div>
          )}
        </section>

        {/* 過去に開催した大会（クロール可能な内部リンク一覧） */}
        <section className="mb-12">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-gray-400" /> {t.past}
          </h2>

          {!loading && !error && past.length === 0 && (
            <p className="text-gray-500 text-sm">{t.noPast}</p>
          )}

          {past.length > 0 && (
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white overflow-hidden">
              {past.map(tour => (
                <li key={tour.id}>
                  <Link
                    to={`/${homeLang}/tournaments/${tour.id}`}
                    className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 px-4 py-3.5 hover:bg-gray-50 transition-colors group"
                  >
                    <span className="text-xs text-gray-400 sm:w-40 flex-shrink-0">{formatDate(tour.event_date)}</span>
                    <span className="flex-1 min-w-0">
                      <span className="font-medium text-gray-800 group-hover:text-blue-700">{tour.title}</span>
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          <Trophy className="w-3 h-3" /> {tour.level}・{tour.event_type}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> {tour.location}
                        </span>
                        <span>{t.fee} {tour.entry_fee.toLocaleString()}{t.yen}</span>
                      </span>
                    </span>
                    <span className="hidden sm:inline-flex items-center gap-1 text-xs text-blue-600 font-medium flex-shrink-0">
                      {t.detail} <ArrowRight className="w-3 h-3" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* 関連: レポート・結果 */}
        <section className="border-t border-gray-100 pt-8">
          <h2 className="text-base font-bold text-gray-900 mb-4">{t.relatedTitle}</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Link
              to={`/${homeLang}/tournaments/gallery`}
              className="flex items-center justify-between gap-2 bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 hover:border-blue-200 hover:text-blue-700 hover:shadow-sm transition-all"
            >
              <span className="inline-flex items-center gap-2"><ImageIcon className="w-4 h-4 text-blue-500" /> {t.gallery}</span>
              <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </Link>
            <Link
              to={`/${homeLang}/results/vol1`}
              className="flex items-center justify-between gap-2 bg-white rounded-xl border border-gray-100 px-4 py-3 text-sm font-medium text-gray-700 hover:border-blue-200 hover:text-blue-700 hover:shadow-sm transition-all"
            >
              <span className="inline-flex items-center gap-2"><Trophy className="w-4 h-4 text-blue-500" /> {t.results}</span>
              <ArrowRight className="w-4 h-4 flex-shrink-0" />
            </Link>
          </div>
        </section>
      </main>
    </>
  );
};

export default TournamentListPage;
