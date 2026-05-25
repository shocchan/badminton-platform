import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export const Header = () => {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();

  const navLink = (to: string, label: string) => {
    const active = to === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`text-sm font-medium transition-colors whitespace-nowrap ${
          active ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xl sm:text-2xl">🏸</span>
          <div>
            <div className="font-bold text-gray-900 text-sm sm:text-lg leading-tight">川口・蕨バド交流杯</div>
            <div className="text-xs text-gray-500 hidden sm:block">バドミントン大会</div>
          </div>
        </Link>

        <nav className="flex items-center gap-3 sm:gap-6">
          {navLink('/', '大会案内')}
          {navLink('/blog', 'ブログ')}
          {isAuthenticated ? (
            <>
              {navLink('/admin', '管理画面')}
              <button
                onClick={logout}
                className="text-xs sm:text-sm text-gray-400 hover:text-red-500 transition-colors"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="text-xs sm:text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              管理者ログイン
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};
