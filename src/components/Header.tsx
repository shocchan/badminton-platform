import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Header = () => {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl">🏸</span>
          <div>
            <div className="font-bold text-gray-900 text-lg leading-tight">川口・蕨バド交流杯</div>
            <div className="text-xs text-gray-500">バドミントン大会</div>
          </div>
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            to="/"
            className={`text-sm font-medium transition-colors ${
              location.pathname === '/' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            大会案内
          </Link>
          <Link
            to="/blog"
            className={`text-sm font-medium transition-colors ${
              location.pathname.startsWith('/blog') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            ブログ
          </Link>
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <Link
                to="/admin"
                className={`text-sm font-medium transition-colors ${
                  location.pathname === '/admin' ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                管理画面
              </Link>
              <button
                onClick={logout}
                className="text-sm text-gray-500 hover:text-red-500 transition-colors"
              >
                ログアウト
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              管理者ログイン
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
