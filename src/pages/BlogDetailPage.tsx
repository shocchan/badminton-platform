import { useParams, Link } from 'react-router-dom';
import { useEffect, useMemo, useRef } from 'react';
import { Helmet } from 'react-helmet-async';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { useBlogPost } from '../hooks/useBlogPosts';
import { supabase } from '../services/supabaseClient';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { useLanguage } from '../contexts/LanguageContext';
import {
  BLOG_META, blogPostAlternates, blogPostCanonical, hasZhBody, pickBlogText, SITE,
} from './blogSeo';
// BLOG_UI は BLOG_META に無いUI文言（下書きバナー・管理ページ・記事なし）だけを使う。
// 表示テキストの選択（どの言語で出すか）は pickBlogText 側に一本化してある（下のコメント参照）
import { BLOG_UI, blogLocale, localizeHref, localizeBlogHtmlLinks } from '../lib/blogI18n';
import {
  blogImageSrcSet,
  enhanceBlogContentHtml,
  fallbackToOriginal,
  BLOG_DETAIL_COVER_SIZES,
  BLOG_CONTENT_SIZES,
} from '../lib/blogImages';

/** HTML/Markdownから説明文を作る（excerptが無い記事のため） */
const toDescription = (post: { excerpt?: string; content: string }) => {
  if (post.excerpt) return post.excerpt.slice(0, 120);
  return post.content.replace(/<[^>]*>/g, ' ').replace(/[#*_>`[\]()]/g, '')
    .replace(/\s+/g, ' ').trim().slice(0, 120);
};

export const BlogDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { post, loading, error } = useBlogPost(Number(id));
  const { lang } = useLanguage();
  const l: 'ja' | 'zh' = lang === 'zh' ? 'zh' : 'ja';
  const m = BLOG_META[l];
  const ui = BLOG_UI[l];

  // 言語切替で中身ごと差し替える（2026-08-25）。中国語版が無い記事は日本語のまま出す。
  //
  // 【なぜ pickBlogText（blogSeo.ts）で、blogI18n.ts の localizedPost ではないか】
  // 読む列は両者とも同じ（title_zh / excerpt_zh / content_zh・本番DBに投入済み）。違いは判定で、
  //   - localizedPost: 列ごとに独立してフォールバック（本文が日本語でもタイトルだけ中国語になり得る）
  //   - pickBlogText : 本文（content_zh）があるときだけ中国語に切り替える
  // 下の canonical / hreflang / JSON-LD の inLanguage は「その記事に中国語版があるか」で分岐する。
  // 表示とSEOの判定がズレると「中国語で表示しているのに canonical は日本語版」が起きるため、
  // 判定は hasZhBody / pickBlogText の1か所に寄せる（src/pages/blogZh.test.tsx が固定している）。
  // フックより前に必要なので、post が来る前は null のまま置く
  const text = post ? pickBlogText(post, l) : null;

  // 下書きプレビュー（管理者のみRLSで取得可能）では閲覧数を増やさない
  useEffect(() => {
    if (!post || post.status === 'draft') return;
    supabase.rpc('increment_blog_view', { blog_id: post.id })
      .then(({ error }) => { if (error) console.error('increment_blog_view error:', error); });
  }, [post?.id, post?.status]);

  // 本文HTML内の<img>に lazy/srcset を付与（カバーが無い記事は先頭画像がLCPなのでeager扱い）。
  // 続けて本文内のサイト内リンクを読者の言語に揃える（/ja のリンクを中国語で踏んで言語が飛ぶのを防ぐ）
  const enhancedContent = useMemo(
    () =>
      post && text && post.content_type !== 'markdown'
        ? localizeBlogHtmlLinks(enhanceBlogContentHtml(text.content, { eagerFirst: !post.image_url }), l)
        : '',
    [post, text, l],
  );

  // srcset の変種が存在しない場合（マイグレーション漏れ等）に原本へフォールバックする
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const imgs = Array.from(root.querySelectorAll<HTMLImageElement>('img[srcset]'));
    const onError = (e: Event) => fallbackToOriginal(e.currentTarget as HTMLImageElement);
    imgs.forEach(img => {
      if (img.complete && img.naturalWidth === 0) fallbackToOriginal(img);
      else img.addEventListener('error', onError);
    });
    return () => imgs.forEach(img => img.removeEventListener('error', onError));
  }, [enhancedContent]);

  // 日付も読者の言語で出す（zhは zh-CN）
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(blogLocale(l), { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const getYoutubeId = (url: string) => {
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([^&?\s]+)/);
    return m ? m[1] : null;
  };

  // Markdownのリンクを別タブで開く（サイト内リンクは読者の言語へ）。
  // 画像はlazy化+srcset（変種404時は原本へ戻す）
  const markdownComponents: Components = {
    a: ({ href, children }) => (
      <a href={localizeHref(href, l)} target="_blank" rel="noopener noreferrer">{children}</a>
    ),
    img: ({ src, alt }) => {
      const url = typeof src === 'string' ? src : undefined;
      const srcSet = blogImageSrcSet(url);
      return (
        <img
          src={url}
          alt={alt ?? ''}
          srcSet={srcSet}
          sizes={srcSet ? BLOG_CONTENT_SIZES : undefined}
          loading="lazy"
          decoding="async"
          onError={e => fallbackToOriginal(e.currentTarget)}
        />
      );
    },
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
  if (error || !post || !text) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-400">{ui.notFound}</p>
        {/* 見つからないURLを検索結果に残さない */}
        <Helmet><meta name="robots" content="noindex,follow" /></Helmet>
        <Link to={`/${l}/blog`} className="text-blue-600 mt-4 inline-block hover:underline">{m.back}</Link>
      </div>
    );
  }

  // 下書き・限定公開（unlisted）は検索結果に出さない
  const hidden = post.status === 'draft' || post.status === 'unlisted';
  const postHasZh = hasZhBody(post);
  const description = toDescription({ excerpt: text.excerpt, content: text.content });
  // canonical/hreflang は「その記事に中国語版があるか」で決まる（表示中の言語ではない）。
  // 中国語版がある記事だけ ja/zh を相互に結ぶ。無い記事は /ja へ寄せて hreflang を出さない
  // （自己参照でない canonical と hreflang の併用は矛盾する。詳細は blogSeo.ts 冒頭）
  const canonical = blogPostCanonical(post.id, l, postHasZh);
  // 下書き・限定公開は noindex を出しているので hreflang も出さない
  // （検索に出さないと言いながら別言語版を案内するのは矛盾。広告用variant LPと同じ扱い）
  const alternates = hidden ? null : blogPostAlternates(post.id, postHasZh);
  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: text.title,
    description,
    datePublished: post.published_at || post.created_at,
    dateModified: post.updated_at || post.created_at,
    // 本文の言語を名乗る（UIの言語ではない）。中国語UIでも本文が日本語なら ja
    inLanguage: text.lang,
    mainEntityOfPage: canonical,
    ...(post.image_url && /^https?:/.test(post.image_url) ? { image: post.image_url } : {}),
    publisher: { '@id': 'https://kawabado.com/#organization' },
  };

  return (
    <>
    <Helmet>
      {/* 本文の言語を名乗る。中国語UIでも本文が日本語なら ja（Worker側の素のHTMLと揃える） */}
      <html lang={text.lang} />
      <title>{`${text.title}｜${text.lang === 'zh' ? '川口・蕨羽毛球交流会' : '川口・蕨バドミントン交流会'}`}</title>
      <meta name="description" content={description} />
      <meta property="og:type" content="article" />
      <meta property="og:title" content={text.title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={`${SITE}/${l}/blog/${post.id}`} />
      <meta property="og:locale" content={text.lang === 'zh' ? 'zh_CN' : 'ja_JP'} />
      {post.image_url && /^https?:/.test(post.image_url) && (
        <meta property="og:image" content={post.image_url} />
      )}
      <link rel="canonical" href={canonical} />
      {alternates && <link rel="alternate" hrefLang="ja" href={alternates.ja} />}
      {alternates && <link rel="alternate" hrefLang="zh" href={alternates.zh} />}
      {alternates && <link rel="alternate" hrefLang="x-default" href={alternates.xDefault} />}
      {hidden && <meta name="robots" content="noindex,nofollow" />}
      {!hidden && <script type="application/ld+json">{JSON.stringify(articleSchema)}</script>}
    </Helmet>
    <main className="max-w-4xl mx-auto px-4 py-10">
      <Breadcrumbs items={[
        { label: l === 'zh' ? '首页' : 'ホーム', path: `/${l}/` },
        { label: m.heading, path: `/${l}/blog` },
        { label: text.title },
      ]} />
      {post.status === 'draft' && (
        <div className="mb-6 flex items-center justify-between gap-3 bg-amber-50 border border-amber-300 text-amber-900 px-4 py-3 rounded-xl text-sm">
          {/* 下書きバナーの文言は中国語も用意してある（BLOG_UI） */}
          <span className="font-medium">{ui.draftNotice}</span>
          <Link to={`/${l}/admin`} className="shrink-0 text-blue-600 hover:underline">{ui.toAdmin}</Link>
        </div>
      )}
      <Link to={`/${l}/blog`} className="text-blue-600 text-sm hover:underline mb-6 inline-block">{m.back}</Link>

      {post.image_url && (
        // このページのLCP要素。srcset/sizes は generate-worker.mjs のpreload注入と一致させること
        <img
          src={post.image_url}
          srcSet={blogImageSrcSet(post.image_url)}
          sizes={BLOG_DETAIL_COVER_SIZES}
          alt={text.title}
          width={1600}
          height={900}
          fetchPriority="high"
          decoding="async"
          onError={e => fallbackToOriginal(e.currentTarget)}
          className="w-full h-64 md:h-96 object-cover rounded-2xl mb-8"
          style={{ objectPosition: post.image_position || 'center center' }}
        />
      )}

      <article className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="text-sm text-gray-400 mb-3">{formatDate(post.created_at)}</div>
        {/* 中国語UIで日本語のまま出している記事。読み始める前に分かるよう見出しの上に置く */}
        {text.showJaBadge && (
          <p
            data-testid="ja-badge"
            className="mb-3 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium px-3 py-1.5 rounded-lg"
          >
            <span className="font-bold">{m.jaBadge}</span>
            <span>{m.jaNotice}</span>
          </p>
        )}
        <h1 lang={text.lang} className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">{text.title}</h1>
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
          <div lang={text.lang} data-testid="blog-body" className="prose prose-lg max-w-none text-gray-700 blog-content">
            <ReactMarkdown components={markdownComponents}>{text.content}</ReactMarkdown>
          </div>
        ) : (
          <div
            ref={contentRef}
            lang={text.lang}
            data-testid="blog-body"
            className="prose prose-lg max-w-none text-gray-700 blog-content"
            // content_zh は content と同じHTML骨格（scripts/blog/apply-zh.mjs がテキストノードだけ差し替える）。
            // 訳文だけを別に流し込んでいるわけではないので、既存と同じ扱いでよい
            dangerouslySetInnerHTML={{ __html: enhancedContent }}
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
    </>
  );
};
