import { Link } from 'react-router-dom';
import { useBlogPosts } from '../hooks/useBlogPosts';

export const BlogPage = () => {
  const { blogPosts, loading, error } = useBlogPosts();

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return (
    <main className="max-w-6xl mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-gray-900 mb-3">📰 ブログ</h1>
        <p className="text-gray-500">大会結果やお知らせをお届けします</p>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {!loading && !error && blogPosts.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📝</div>
          <p>まだ記事がありません</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {blogPosts.map(post => (
          <article key={post.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
            {post.image_url && (
              <img
                src={post.image_url}
                alt={post.title}
                className="w-full h-48 object-cover"
                style={{ objectPosition: post.image_position || 'center center' }}
              />
            )}
            {!post.image_url && (
              <div className="w-full h-48 bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-4xl">
                🏸
              </div>
            )}
            <div className="p-5">
              <p className="text-xs text-gray-400 mb-2">{formatDate(post.published_at)}</p>
              <h2 className="font-bold text-gray-900 text-lg mb-2 line-clamp-2">{post.title}</h2>
              {post.excerpt && (
                <p className="text-gray-500 text-sm mb-4 line-clamp-3">{post.excerpt}</p>
              )}
              <Link
                to={`/blog/${post.id}`}
                className="text-blue-600 text-sm font-medium hover:underline"
              >
                詳細を見る →
              </Link>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
};
