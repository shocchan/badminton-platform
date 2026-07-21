import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { ArrowRight, Tag, Trophy } from 'lucide-react';
import { useBlogPosts } from '../../hooks/useBlogPosts';
import { CardSkeleton, ErrorState, EmptyState } from '../../components/ui/StateViews';
import { useLanguage } from '../../contexts/LanguageContext';

// 「大会レポート」= blog_posts のうち tags に "tournament" を含む公開記事
const REPORT_TAG = 'tournament';

const TEXT = {
  ja: {
    title: '大会レポート',
    subtitle: '過去に開催された川口・蕨バドミントン交流会の様子をご紹介します',
    empty: '大会レポートはまだありません',
    emptyDesc: '過去の大会の様子を順次掲載していきます',
    error: 'レポートの読み込みに失敗しました',
    read: 'レポートを読む',
    metaTitle: '大会レポート | 川口・蕨バドミントン交流会',
    metaDesc: '川口・蕨バドミントン交流会の過去の大会レポート。参加者の声・試合結果・当日の様子をご紹介します。',
  },
  zh: {
    title: '往届赛事回顾',
    subtitle: '介绍过去举办的川口・蕨羽毛球交流会的现场情况',
    empty: '暂无赛事回顾',
    emptyDesc: '往届赛事的精彩瞬间将陆续更新',
    error: '回顾内容加载失败',
    read: '阅读回顾',
    metaTitle: '往届赛事回顾 | 川口・蕨羽毛球交流会',
    metaDesc: '川口・蕨羽毛球交流会的往届赛事回顾。参加者的感想、比赛结果、当天的现场情况。',
  },
} as const;

export const TournamentGalleryPage = () => {
  const { lang } = useLanguage();
  const t = TEXT[lang === 'zh' ? 'zh' : 'ja'];
  const { blogPosts, loading, error } = useBlogPosts();

  const reports = blogPosts.filter(p => p.tags?.includes(REPORT_TAG));

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

  const canonical = `https://kawabado.com/${lang}/tournaments/gallery`;

  return (
    <>
      <Helmet>
        <title>{t.metaTitle}</title>
        <meta name="description" content={t.metaDesc} />
        <meta property="og:title" content={t.metaTitle} />
        <meta property="og:description" content={t.metaDesc} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://kawabado.com/ogp.jpg" />
        <meta property="og:url" content={canonical} />
        <link rel="canonical" href={canonical} />
        <link rel="alternate" hrefLang="ja" href="https://kawabado.com/ja/tournaments/gallery" />
        <link rel="alternate" hrefLang="zh" href="https://kawabado.com/zh/tournaments/gallery" />
        <link rel="alternate" hrefLang="x-default" href="https://kawabado.com/ja/tournaments/gallery" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'CollectionPage',
            name: t.metaTitle,
            url: canonical,
            image: 'https://kawabado.com/ogp.jpg',
            description: t.metaDesc,
          })}
        </script>
      </Helmet>

      <main className="max-w-5xl mx-auto px-4 py-8 sm:py-10">
        <div className="text-center mb-8 sm:mb-10">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
            <Trophy className="w-6 h-6 text-blue-500" /> {t.title}
          </h1>
          <p className="text-gray-500 text-sm sm:text-base">{t.subtitle}</p>
        </div>

        {loading && (
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            {[...Array(4)].map((_, i) => <CardSkeleton key={i} lines={2} />)}
          </div>
        )}

        {error && <ErrorState message={t.error} />}

        {!loading && !error && reports.length === 0 && (
          <EmptyState emoji="🏸" title={t.empty} description={t.emptyDesc} />
        )}

        {!loading && !error && reports.length > 0 && (
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            {reports.map(post => (
              <Link
                key={post.id}
                to={`/${lang}/blog/${post.id}`}
                className="group block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              >
                <article className="flex flex-col h-full">
                  <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200">
                    {post.image_url ? (
                      <img
                        src={post.image_url}
                        alt={post.title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                        style={{ objectPosition: post.image_position || 'center center' }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">🏸</div>
                    )}
                    <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-gray-900/70 text-white text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm">
                      <Tag className="w-2.5 h-2.5" />
                      {t.title}
                    </span>
                  </div>
                  <div className="p-4 sm:p-5 flex flex-col flex-1">
                    <p className="text-xs text-gray-400 mb-2">{formatDate(post.created_at)}</p>
                    <h2 className="font-bold text-gray-900 text-base sm:text-lg mb-2 line-clamp-2">{post.title}</h2>
                    {post.excerpt && (
                      <p className="text-gray-500 text-sm mb-4 line-clamp-3">{post.excerpt}</p>
                    )}
                    <span className="mt-auto inline-flex items-center gap-1 text-blue-600 text-sm font-medium group-hover:underline">
                      {t.read} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </article>
              </Link>
            ))}
          </div>
        )}
      </main>
    </>
  );
};

export default TournamentGalleryPage;
