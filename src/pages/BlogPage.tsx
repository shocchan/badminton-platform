import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Newspaper, ArrowRight, Tag } from 'lucide-react';
import { useBlogPosts } from '../hooks/useBlogPosts';
import { CardSkeleton, ErrorState, EmptyState } from '../components/ui/StateViews';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import { BLOG_META, blogCanonical, pickBlogText, SITE } from './blogSeo';
import { blogLocale } from '../lib/blogI18n';
import { blogImageSrcSet, fallbackToOriginal, BLOG_CARD_SIZES } from '../lib/blogImages';

type SortMode = 'newest' | 'oldest' | 'popular';

// 並べ替えのラベルは BLOG_META から取る（2026-08-25）。
// ここだけ日本語のままだと、中国語で開いたときに「全部中国語になった」ように見えない
const SORT_KEYS: SortMode[] = ['newest', 'oldest', 'popular'];

export const BlogPage = () => {
  const { blogPosts, loading, error } = useBlogPosts();
  const [sort, setSort] = useState<SortMode>('newest');
  const { lang } = useLanguage();
  const l: 'ja' | 'zh' = lang === 'zh' ? 'zh' : 'ja';
  const m = BLOG_META[l];

  // 日付も読者の言語で出す（zhは zh-CN）。src/lib/blogI18n.ts の blogLocale が唯一の対応表
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(blogLocale(l), { year: 'numeric', month: 'long', day: 'numeric' });
  };

  // 作成日基準で並べ替え（人気順は閲覧数）
  const sortedPosts = [...blogPosts].sort((a, b) => {
    if (sort === 'popular') return (b.view_count ?? 0) - (a.view_count ?? 0);
    const da = new Date(a.created_at).getTime();
    const db = new Date(b.created_at).getTime();
    return sort === 'oldest' ? da - db : db - da;
  });

  return (
    <>
    <Helmet>
      <html lang={l} />
      <title>{m.title}</title>
      <meta name="description" content={m.description} />
      <meta property="og:title" content={m.title} />
      <meta property="og:description" content={m.description} />
      <meta property="og:url" content={`${SITE}/${l}/blog`} />
      <meta property="og:locale" content={l === 'zh' ? 'zh_CN' : 'ja_JP'} />
      {/* 記事本文は日本語のみ。中国語URLは日本語版へ寄せる（重複ページ化を防ぐ） */}
      <link rel="canonical" href={blogCanonical('blog')} />
    </Helmet>
    <main className="max-w-6xl mx-auto px-4 py-8 sm:py-10">
      <Breadcrumbs items={[
        { label: l === 'zh' ? '首页' : 'ホーム', path: `/${l}/` },
        { label: m.heading },
      ]} />
      <div className="text-center mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 flex items-center justify-center gap-2">
          <Newspaper className="w-6 h-6 text-blue-500" /> {m.heading}
        </h1>
        <p className="text-gray-500 text-sm sm:text-base">{m.lead}</p>
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
                {m.sort[key]}
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

      {error && <ErrorState message={m.error} />}

      {!loading && !error && blogPosts.length === 0 && (
        <EmptyState emoji="📝" title={m.empty.title} description={m.empty.description} />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {sortedPosts.map(post => {
          // 中国語版がある記事は中国語で、無い記事は日本語のまま並べる（2026-08-25）。
          // 訳済みだけを一覧に出すと、中国語で見たとき記事が数本しか無いサイトに見える
          //
          // 【なぜ pickBlogText（blogSeo.ts）で、blogI18n.ts の localizedPost ではないか】
          // 中国語版の有無の判定は、詳細ページの canonical / hreflang / JSON-LD と
          // 必ず同じでなければならない（表示は中国語なのに canonical は日本語版、が起きる）。
          // pickBlogText は「本文（content_zh）がある記事だけ中国語」で判定を1か所に寄せてあり、
          // src/pages/blogZh.test.tsx がその分岐をSEOごと固定している。読む列は両者とも同じ
          const t = pickBlogText(post, l);
          return (
          <Link
            key={post.id}
            to={`/${l}/blog/${post.id}`}
            className="group block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow flex flex-col cursor-pointer"
          >
            <article className="flex flex-col flex-1">
              <div className="relative w-full aspect-[16/9] overflow-hidden bg-gradient-to-br from-blue-100 to-blue-200">
                {post.image_url ? (
                  <img
                    src={post.image_url}
                    srcSet={blogImageSrcSet(post.image_url)}
                    sizes={BLOG_CARD_SIZES}
                    alt={t.title}
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
                  {post.tags && post.tags.length > 0 ? post.tags[0] : m.tag}
                </span>
                {/* 中国語UIで日本語のまま出している記事。開く前に分かるようにサムネ側に出す */}
                {t.showJaBadge && (
                  <span
                    data-testid="ja-badge"
                    className="absolute top-2 right-2 inline-flex items-center bg-amber-100 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-md"
                  >
                    {m.jaBadge}
                  </span>
                )}
              </div>
              <div className="p-4 sm:p-5 flex flex-col flex-1">
                <p className="text-xs text-gray-400 mb-2">{formatDate(post.created_at)}</p>
                <h2 lang={t.lang} className="font-bold text-gray-900 text-base sm:text-lg mb-2 line-clamp-2">{t.title}</h2>
                {t.excerpt && (
                  <p lang={t.lang} className="text-gray-500 text-sm mb-4 line-clamp-3">{t.excerpt}</p>
                )}
                <span className="mt-auto inline-flex items-center gap-1 text-blue-600 text-sm font-medium group-hover:underline">
                  {m.more} <ArrowRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </article>
          </Link>
          );
        })}
      </div>
    </main>
    </>
  );
};
