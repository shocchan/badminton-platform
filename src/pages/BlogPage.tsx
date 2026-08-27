import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, ArrowRight, Tag } from 'lucide-react';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { CardSkeleton, ErrorState, EmptyState } from '../components/ui/StateViews';
import { blogImageSrcSet, fallbackToOriginal, BLOG_CARD_SIZES } from '../lib/blogImages';
import { useLanguage } from '../contexts/LanguageContext';
import { localizedPost, BLOG_UI, blogLocale } from '../lib/blogI18n';

type SortMode = 'newest' | 'oldest' | 'popular';

const SORT_KEYS: SortMode[] = ['newest', 'oldest', 'popular'];

export const BlogPage = () => {
  const { lang } = useLanguage();
  const t = BLOG_UI[lang];
  const { blogPosts, loading, error } = useBlogPosts();
  const [sort, setSort] = useState<SortMode>('newest');

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(blogLocale(lang), { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // 作成日基準で並べ替え（人気順は閲覧数）
  const sortedPosts = [...blogPosts].sort((a, b) => {
    if (sort === 'popular') return (b.view_count ?? 0) - (a.view_count ?? 0);
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return sort === 'oldest' ? da - db : db - da;
  });

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
          <Newspaper className="w-6 h-6 text-blue-500" /> {t.heading}
        </h1>
        <p className="text-gray-500 text-sm sm:text-base">{t.lead}</p>
      </div>

      {/* 並べ替え */}
      {!loading && !error && blogPosts.length > 0 && (
        <div className="flex justify-center sm:justify-end mb-6">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {SORT_KEYS.map(key => (
              <button
                key={key}
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  sort === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {t.sort[key]}
              </button>
            ))}
          </div>
        </div>
      )}

      {loading && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[...Array(6)].map((_, i) => <CardSkeleton key={i} lines={2} />)}
        </div>
      )}

      {error && <ErrorState message={t.loadError} />}

      {!loading && !error && blogPosts.length === 0 && (
        <EmptyState emoji="📝" title={t.emptyTitle} description={t.emptyDesc} />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {sortedPosts.map(post => {
          const text = localizedPost(post, lang);
          return (
          <Link
            key={post.id}
            to={`/${lang}/blog/${post.id}`}
            className="group block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col cursor-pointer"
          >
            <article className="flex flex-col flex-1">
              <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200">
                {post.image_url ? (
                  <img
                    src={post.image_url}
                    srcSet={blogImageSrcSet(post.image_url)}
                    sizes={BLOG_CARD_SIZES}
                    alt={text.title}
                    width={1600}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    onError={e => fallbackToOriginal(e.currentTarget)}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    style={{ objectPosition: post.image_position || 'center center' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🏸</div>
                )}
                {/* テイスト混在をならす共通ラベル帯 */}
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-gray-900/70 text-white text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm">
                  <Tag className="w-2.5 h-2.5" />
                  {post.tags && post.tags.length > 0 ? post.tags[0] : t.tagFallback}
                </span>
              </div>
              <div className="p-4 sm:p-5 flex flex-col flex-1">
                <p className="text-xs text-gray-400 mb-2">{formatDate(post.created_at)}</p>
                <h2 className="font-bold text-gray-900 text-base sm:text-lg mb-2 line-clamp-2">{text.title}</h2>
                {text.excerpt && (
                  <p className="text-gray-500 text-sm mb-4 line-clamp-3">{text.excerpt}</p>
                )}
                <span className="mt-auto inline-flex items-center gap-1 text-blue-600 text-sm font-medium group-hover:underline">
                  {t.readMore} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </article>
          </Link>
          );
        })}
      </div>
    </main>
  );
};
