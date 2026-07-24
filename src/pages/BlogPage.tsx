import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, ArrowRight, Tag, Info } from 'lucide-react';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { CardSkeleton, ErrorState, EmptyState } from '../components/ui/StateViews';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';
import { useLanguage } from '../contexts/LanguageContext';

// SEO: ブログは blog_posts に言語カラムを持たず、全記事が日本語（Case C）。
// - 記事詳細への内部リンクは常に正規URL /ja/blog/:id にする（301・言語跨ぎ回避）。
// - 中国語URL (/zh/blog) は独自の中国語記事が無いため Worker が
//   X-Robots-Tag: noindex, follow を付与し、sitemap からも除外している。
//   ここでは中国語シェルを提供しつつ「記事は日本語」であることを明示する。

type SortMode = 'newest' | 'oldest' | 'popular';

type BlogText = {
  heading: string;
  subtitle: string;
  empty: string;
  emptyDesc: string;
  error: string;
  read: string;
  sort: Record<SortMode, string>;
  langNote: string | null;
  tag: string;
};

const TEXT: Record<'ja' | 'zh', BlogText> = {
  ja: {
    heading: 'ブログ',
    subtitle: '大会結果やお知らせをお届けします',
    empty: 'まだ記事がありません',
    emptyDesc: '大会結果やお知らせを順次掲載していきます',
    error: '記事の読み込みに失敗しました',
    read: '詳細を見る',
    sort: { newest: '最新順', oldest: '最旧順', popular: '人気順' },
    langNote: null,
    tag: 'ブログ',
  },
  zh: {
    heading: '博客',
    subtitle: '发布比赛结果和活动通知',
    empty: '暂无文章',
    emptyDesc: '比赛结果和通知将陆续发布',
    error: '文章加载失败',
    read: '查看详情',
    sort: { newest: '最新', oldest: '最早', popular: '热门' },
    langNote: '※ 博客文章目前均以日语撰写。',
    tag: '博客',
  },
};

const SORT_KEYS: SortMode[] = ['newest', 'oldest', 'popular'];

export const BlogPage = () => {
  const { lang } = useLanguage();
  const t = TEXT[lang === 'zh' ? 'zh' : 'ja'];
  const { blogPosts, loading, error } = useBlogPosts();
  const [sort, setSort] = useState<SortMode>('newest');

  useStaticPageMeta();

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

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
        <p className="text-gray-500 text-sm sm:text-base">{t.subtitle}</p>
      </div>

      {t.langNote && (
        <div className="max-w-xl mx-auto mb-6 flex items-center gap-2 justify-center text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-4 py-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0" /> {t.langNote}
        </div>
      )}

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

      {error && <ErrorState message={t.error} />}

      {!loading && !error && blogPosts.length === 0 && (
        <EmptyState emoji="📝" title={t.empty} description={t.emptyDesc} />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {sortedPosts.map(post => (
          <Link
            key={post.id}
            to={`/ja/blog/${post.id}`}
            className="group block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col cursor-pointer"
          >
            <article className="flex flex-col flex-1">
              <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200">
                {post.image_url ? (
                  <img
                    src={post.image_url}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    style={{ objectPosition: post.image_position || 'center center' }}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🏸</div>
                )}
                {/* テイスト混在をならす共通ラベル帯 */}
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-gray-900/70 text-white text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm">
                  <Tag className="w-2.5 h-2.5" />
                  {post.tags && post.tags.length > 0 ? post.tags[0] : t.tag}
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
    </main>
  );
};
