import { useParams, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { useBlogPost } from '../hooks/useBlogPosts';
import { supabase } from '../services/supabaseClient';
import { usePageMeta } from '../hooks/usePageMeta';
import type { PageMeta } from '../lib/pageMeta';

const SITE_NAME = '川口・蕨バドミントン交流会（kawabado）';
const DEFAULT_OGP = 'https://kawabado.com/ogp.jpg';

// SEO: 記事本文（Markdown/HTML）から description 用のプレーンテキストを作る
const buildExcerpt = (raw: string | undefined, max = 140): string => {
  if (!raw) return '';
  const plain = raw
    .replace(/```[\s\S]*?```/g, ' ')       // code fences
    .replace(/<[^>]+>/g, ' ')              // HTML tags
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // markdown images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links → keep text
    .replace(/[#*_`>~-]+/g, ' ')           // markdown syntax
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? plain.slice(0, max - 1) + '…' : plain;
};

export const BlogDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { post, loading, error } = useBlogPost(Number(id));

  // 下書きプレビュー（管理者のみRLSで取得可能）では閲覧数を増やさない
  useEffect(() => {
    if (!post || post.status === 'draft') return;
    supabase.rpc('increment_blog_view', { blog_id: post.id })
      .then(({ error }) => { if (error) console.error('increment_blog_view error:', error); });
  }, [post?.id, post?.status]);

  // SEO: ブログは日本語のみ実装（Case C）。canonical は常に /ja/blog/:id。
  // 中国語URLで表示された場合も、canonical で日本語版へ正規化する。hreflang は出さない。
  // usePageMeta を早期returnより前に呼ぶ（hooks順序を安定させるため）。
  const pageMeta: PageMeta | null = post && post.status !== 'draft' ? {
    title: `${post.title} | ${SITE_NAME}`,
    description: post.excerpt?.trim() || buildExcerpt(post.content) || `${SITE_NAME}のブログ記事`,
    canonical: `https://kawabado.com/ja/blog/${post.id}`,
    hreflang: [], // Case C: 中国語版が存在しないため hreflang は出さない
    ogType: 'article',
    ogUrl: `https://kawabado.com/ja/blog/${post.id}`,
    ogImage: post.image_url && /^https?:\/\//.test(post.image_url) ? post.image_url : DEFAULT_OGP,
    ogLocale: 'ja_JP',
    twitterCard: 'summary_large_image',
    htmlLang: 'ja',
  } : null;
  usePageMeta(pageMeta);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getYoutubeId = (url: string) => {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?\s]+)/);
    return m ? m[1] : null;
  };

  // Markdownのリンクを別タブで開く
  const markdownComponents: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    ),
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-10">
        <div className="skeleton aspect-[16/9] w-full rounded-2xl mb-6" />
        <div className="skeleton h-7 w-3/4 rounded-lg mb-3" />
        <div className="skeleton h-4 w-32 rounded mb-6" />
        <div className="space-y-2.5">
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-full rounded" />
          <div className="skeleton h-4 w-2/3 rounded" />
        </div>
      </div>
    );
  }

  // 下書きはRLSにより管理者以外は取得できず error になる（＝ここに来た下書きは管理者のプレビュー）
  if (error || !post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-400">記事が見つかりませんでした</p>
        <Link to="/blog" className="text-blue-600 mt-4 inline-block hover:underline">← ブログ一覧へ</Link>
      </div>
    );
  }

  // ページ meta は Worker + 上部の usePageMeta で管理。Helmet は JSON-LD のみ担う。
  // 下書きは pageMeta を出さない（usePageMeta が no-op）ため、robots meta も残らない。
  const canonical = `https://kawabado.com/ja/blog/${post.id}`;
  const seoDesc = post.excerpt?.trim() || buildExcerpt(post.content) || `${SITE_NAME}のブログ記事`;
  const seoImage = post.image_url && /^https?:\/\//.test(post.image_url) ? post.image_url : DEFAULT_OGP;
  const isPublic = post.status !== 'draft';

  const blogPostingJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: seoDesc,
    image: seoImage,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.created_at,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    author: { '@type': 'Organization', name: SITE_NAME, url: 'https://kawabado.com' },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: 'https://kawabado.com/favicon.png' },
    },
    inLanguage: 'ja',
  };

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Helmet>
        {/* 下書きは検索対象外（RLSにより一般ユーザーは取得できないが、二重防御） */}
        {!isPublic && <meta name="robots" content="noindex, nofollow" />}
        {isPublic && (
          <script type="application/ld+json">{JSON.stringify(blogPostingJsonLd)}</script>
        )}
      </Helmet>
      {post.status === 'draft' && (
        <div className="mb-6 flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-sm">
          <span className="font-medium">📝 下書きプレビュー — この記事はまだ公開されていません（管理者のみ閲覧可能）</span>
          <Link to="/ja/admin" className="shrink-0 text-blue-600 hover:underline">管理ページへ</Link>
        </div>
      )}
      <Link to="/blog" className="text-blue-600 text-sm hover:underline mb-6 inline-block">← ブログ一覧へ</Link>

      {post.image_url && (
        <img
          src={post.image_url}
          alt={post.title}
          className="w-full h-64 md:h-96 object-cover rounded-2xl mb-8"
          style={{ objectPosition: post.image_position || 'center center' }}
        />
      )}

      <article className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-sm text-gray-400 mb-3">{formatDate(post.created_at)}</div>
        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">{post.title}</h1>
        <style>{`
          .blog-content a { color: #2563eb; text-decoration: underline; }
          .blog-content a:hover { color: #1d4ed8; }
          .blog-content h2 { font-size: 1.4rem; font-weight: 700; margin: 1.5rem 0 0.75rem; color: #111; }
          .blog-content h3 { font-size: 1.15rem; font-weight: 700; margin: 1.25rem 0 0.5rem; color: #222; }
          .blog-content ul { list-style: disc; padding-left: 1.5rem; margin: 0.75rem 0; }
          .blog-content ol { list-style: decimal; padding-left: 1.5rem; margin: 0.75rem 0; }
          .blog-content li { margin: 0.25rem 0; }
          .blog-content strong { font-weight: 700; }
          .blog-content em { font-style: italic; }
          .blog-content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5rem 0; }
          .blog-content p { margin: 0.75rem 0; line-height: 1.75; }
          .blog-content code { background: #f3f4f6; padding: 0.1em 0.4em; border-radius: 3px; font-size: 0.9em; }
        `}</style>
        {post.content_type === 'markdown' ? (
          <div className="prose prose-lg max-w-none text-gray-700 blog-content">
            <ReactMarkdown components={markdownComponents}>{post.content}</ReactMarkdown>
          </div>
        ) : (
          <div
            className="prose prose-lg max-w-none text-gray-700 blog-content"
            dangerouslySetInnerHTML={{ __html: post.content }}
          />
        )}

        {/* YouTube埋め込み */}
        {post.youtube_url && (() => {
          const videoId = getYoutubeId(post.youtube_url);
          return videoId ? (
            <div className="mt-8">
              <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full rounded-xl"
                  src={`https://www.youtube.com/embed/${videoId}`}
                  title="YouTube video"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          ) : null;
        })()}
      </article>
    </main>
  );
};
