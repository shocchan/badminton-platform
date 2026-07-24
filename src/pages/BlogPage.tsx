import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Newspaper, ArrowRight, Tag } from 'lucide-react';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { CardSkeleton, ErrorState, EmptyState } from '../components/ui/StateViews';
import { useStaticPageMeta } from '../hooks/useStaticPageMeta';

// SEO: ブログは現状 blog_posts テーブルに言語カラムを持たず、
// 全記事が日本語で書かれている（Case C: 中国語URLでも日本語本文をそのまま表示）。
// このため中国語版の hreflang は出さず、日本語ページを正規インデックス対象にする。
// ページ meta は Worker が /ja/blog に注入し、SPA遷移時は useStaticPageMeta が in-place 更新する。

type SortMode = 'newest' | 'oldest' | 'popular';

const SORT_OPTIONS: { key: SortMode; label: string }[] = [
  { key: 'newest', label: '最新順' },
  { key: 'oldest', label: '最旧順' },
  { key: 'popular', label: '人気順' },
];

export const BlogPage = () => {
  const { blogPosts, loading, error } = useBlogPosts();
  const [sort, setSort] = useState<SortMode>('newest');

  useStaticPageMeta();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
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
          <Newspaper className="w-6 h-6 text-blue-500" /> ブログ
        </h1>
        <p className="text-gray-500 text-sm sm:text-base">大会結果やお知らせをお届けします</p>
      </div>

      {/* 並べ替え */}
      {!loading && !error && blogPosts.length > 0 && (
        <div className="flex justify-center sm:justify-end mb-6">
          <div className="inline-flex rounded-xl bg-gray-100 p-1">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSort(opt.key)}
                aria-pressed={sort === opt.key}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  sort === opt.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {opt.label}
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

      {error && <ErrorState message="記事の読み込みに失敗しました" />}

      {!loading && !error && blogPosts.length === 0 && (
        <EmptyState emoji="📝" title="まだ記事がありません" description="大会結果やお知らせを順次掲載していきます" />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {sortedPosts.map(post => (
          <Link
            key={post.id}
            to={`/blog/${post.id}`}
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
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-4xl">🏸</div>
                )}
                {/* テイスト混在をならす共通ラベル帯 */}
                <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 bg-gray-900/70 text-white text-[10px] font-bold px-2 py-1 rounded-md backdrop-blur-sm">
                  <Tag className="w-2.5 h-2.5" />
                  {post.tags && post.tags.length > 0 ? post.tags[0] : 'ブログ'}
                </span>
              </div>
              <div className="p-4 sm:p-5 flex flex-col flex-1">
                <p className="text-xs text-gray-400 mb-2">{formatDate(post.created_at)}</p>
                <h2 className="font-bold text-gray-900 text-base sm:text-lg mb-2 line-clamp-2">{post.title}</h2>
                {post.excerpt && (
                  <p className="text-gray-500 text-sm mb-4 line-clamp-3">{post.excerpt}</p>
                )}
                <span className="mt-auto inline-flex items-center gap-1 text-blue-600 text-sm font-medium group-hover:underline">
                  詳細を見る <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </article>
          </Link>
        ))}
      </div>
    </main>
  );
};
