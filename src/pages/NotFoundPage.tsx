import { Link } from 'react-router-dom';

export const NotFoundPage = () => {
  return (
    <div className="min-h-[80vh] flex items-center justify-center text-center px-4">
      <div>
        <div className="text-6xl mb-4">🏸</div>
        <h1 className="text-4xl font-bold text-gray-900 mb-4">404</h1>
        <p className="text-gray-500 mb-8">ページが見つかりませんでした</p>
        <Link to="/" className="bg-blue-600 text-white px-6 py-3 rounded-xl font-medium hover:bg-blue-700 transition-colors">
          ホームへ戻る
        </Link>
      </div>
    </div>
  );
};
