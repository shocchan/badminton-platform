import { useParams, Link } from 'react-router-dom';
import { useBlogPost } from '../hooks/useBlogPosts';

export const BlogDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { post, loading, error } = useBlogPost(Number(id));

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
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
        <div
          className="prose prose-lg max-w-none text-gray-700"
          dangerouslySetInnerHTML={{ __html: post.content }}
        />
      </article>
    </main>
  );
};
