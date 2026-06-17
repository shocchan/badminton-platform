import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import { useBlogPost } from '../hooks/useBlogPosts';

export const BlogDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { post, loading, error } = useBlogPost(Number(id));

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
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-400">記事が見つかりませんでした</p>
        <Link to="/blog" className="text-blue-600 mt-4 inline-block hover:underline">← ブログ一覧へ</Link>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-10">
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
        <div className="text-sm text-gray-400 mb-3">{formatDate(post.published_at)}</div>
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
