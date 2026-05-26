import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const navLinks = [
  { to: '/',            label: '大会案内' },
  { to: '/blog',        label: 'ブログ' },
  { to: '/level-guide', label: 'クラス案内' },
  { to: '/faq',         label: 'FAQ' },
];

export const Header = () => {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);

  const close = () => setMenuOpen(false);

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
        {/* ロゴ */}
        <Link to="/" onClick={close} className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xl sm:text-2xl">🏸</span>
          <div>
            <div className="font-bold text-gray-900 text-sm sm:text-lg leading-tight">川口・蕨バド交流杯</div>
            <div className="text-xs text-gray-500 hidden sm:block">バドミントン大会</div>
          </div>
        </Link>

        {/* デスクトップナビ */}
        <nav className="hidden sm:flex items-center gap-6">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className={`text-sm font-medium transition-colors whitespace-nowrap ${
                isActive(to) ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {label}
            </Link>
          ))}
          {isAuthenticated ? (
            <>
              <Link
                to="/admin"
                className={`text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/admin') ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                管理画面
              </Link>
              <button
                onClick={logout}
                className="text-sm text-gray-400 hover:text-red-500 transition-colors"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link to="/login" className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
              管理者ログイン
            </Link>
          )}
        </nav>

        {/* ハンバーガーボタン（モバイルのみ） */}
        <button
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'メニューを閉じる' : 'メニューを開く'}
          className="sm:hidden flex flex-col justify-center items-center w-10 h-10 rounded-xl hover:bg-gray-100 transition-colors gap-[5px]"
        >
          <span className={`block w-5 h-[2px] bg-gray-700 rounded transition-all duration-200 origin-center ${menuOpen ? 'rotate-45 translate-y-[7px]' : ''}`} />
          <span className={`block w-5 h-[2px] bg-gray-700 rounded transition-all duration-200 ${menuOpen ? 'opacity-0 scale-x-0' : ''}`} />
          <span className={`block w-5 h-[2px] bg-gray-700 rounded transition-all duration-200 origin-center ${menuOpen ? '-rotate-45 -translate-y-[7px]' : ''}`} />
        </button>
      </div>

      {/* モバイルドロップダウン */}
      <div
        className={`sm:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          menuOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-gray-100 bg-white px-4 py-2 pb-4 flex flex-col gap-1">
          {navLinks.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onClick={close}
              className={`flex items-center px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                isActive(to)
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="h-px bg-gray-100 my-1" />
          {isAuthenticated ? (
            <>
              <Link
                to="/admin"
                onClick={close}
                className={`flex items-center px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  location.pathname.startsWith('/admin')
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                管理画面
              </Link>
              <button
                onClick={() => { logout(); close(); }}
                className="flex items-center px-4 py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link
              to="/login"
              onClick={close}
              className="flex items-center px-4 py-3 rounded-xl text-sm font-medium text-gray-400 hover:bg-gray-50 transition-colors"
            >
              管理者ログイン
            </Link>
          )}
        </div>
      </div>
    </header>
  );
};
