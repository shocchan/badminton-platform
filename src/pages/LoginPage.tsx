import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSignup, setShowSignup] = useState(true);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await login(email, password);
      navigate('/ja/mypage');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* 会員登録メリット表示（初期表示時） */}
        {!showSignup && (
          <div className="mb-6 rounded-2xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-100 p-6">
            <p className="text-sm font-bold text-blue-900 mb-3">🎁 会員登録するとこんなメリット！</p>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <span className="text-lg">🍜</span>
                <span><strong>バド対決ゲーム</strong>の景品（無料券）を受け取れる</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">📱</span>
                <span><strong>マイページ</strong>でいつでも無料券を確認・提示できる</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-lg">✅</span>
                <span><strong>大会への参加申込</strong>がスムーズになる</span>
              </li>
            </ul>
          </div>
        )}

        <div className="text-center mb-8">
          <div className="text-4xl mb-2">{showSignup ? '📝' : '🔓'}</div>
          <h1 className="text-2xl font-bold text-gray-900">{showSignup ? 'アカウント作成' : 'ログイン'}</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">メールアドレス</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="your-email@example.com"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">パスワード</label>
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 rounded-xl transition-colors mt-6"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600">
              会員登録がまだの方は
              <button
                onClick={() => setShowSignup(true)}
                className="font-bold text-blue-600 hover:text-blue-700 ml-1"
              >
                こちらから登録
              </button>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
};
