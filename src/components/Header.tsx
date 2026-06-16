import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../contexts/LanguageContext';

type NavItem = {
  path: string; // /:lang/ 以降のパス（例: '' / 'activity' / 'blog'）
  label: { ja: string; zh: string };
  icon: string;
  category: 'tournament' | 'activity' | 'general';
  badge?: { ja: string; zh: string };
};

const NAV_ITEMS: NavItem[] = [
  { path: '',            label: { ja: '大会案内',   zh: '赛事信息' }, icon: '🏆', category: 'tournament' },
  { path: 'activity',   label: { ja: '通常活動',   zh: '日常活动' }, icon: '🏸', category: 'activity' },
  { path: 'blog',       label: { ja: 'ブログ',     zh: '博客' },     icon: '📝', category: 'general' },
  { path: 'level-guide',label: { ja: 'クラス案内', zh: '级别说明' }, icon: '📊', category: 'tournament', badge: { ja: '大会', zh: '大会' } },
  { path: 'faq',        label: { ja: 'FAQ',        zh: '常见问题' }, icon: '❓', category: 'tournament', badge: { ja: '大会', zh: '大会' } },
];

const categoryColor = (cat: NavItem['category'], active: boolean) => {
  if (cat === 'activity') return active ? 'text-emerald-600' : 'text-gray-600 hover:text-emerald-600';
  return active ? 'text-blue-600' : 'text-gray-600 hover:text-gray-900';
};

const categoryBg = (cat: NavItem['category'], active: boolean) => {
  if (!active) return 'text-gray-700 hover:bg-gray-50';
  if (cat === 'activity') return 'bg-emerald-50 text-emerald-600';
  return 'bg-blue-50 text-blue-600';
};

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const { lang, groupSlug } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);

  // グループプレフィックス（kawaguchi-warabi は空）
  const groupPrefix = groupSlug === 'chaoxianzu' ? '/chaoxianzu' : '';

  // ナビリンクの to を生成
  const navTo = (path: string) =>
    path === '' ? `${groupPrefix}/${lang}/` : `${groupPrefix}/${lang}/${path}`;

  // アクティブ判定
  const isActive = (path: string) => {
    const target = navTo(path);
    if (path === '') return location.pathname === target || location.pathname === `${groupPrefix}/${lang}`;
    return location.pathname.startsWith(`${groupPrefix}/${lang}/${path}`);
  };

  // 言語切り替え：URLの lang 部分だけ差し替え
  const switchLanguage = (newLang: string) => {
    const parts = location.pathname.split('/').filter(Boolean);
    if (groupSlug === 'chaoxianzu') {
      parts[1] = newLang; // /chaoxianzu/:lang/...
    } else {
      parts[0] = newLang; // /:lang/...
    }
    navigate('/' + parts.join('/') + (location.search || ''));
    setMenuOpen(false);
  };

  const close = () => setMenuOpen(false);
  const navLang = lang === 'ko' ? 'ja' : lang as 'ja' | 'zh';

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
        {/* ロゴ */}
        <Link to={navTo('')} onClick={close} className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xl sm:text-2xl">🏸</span>
          <div>
            <div className="font-bold text-gray-900 text-sm sm:text-lg leading-tight">川口・蕨バドミントン交流会</div>
            <div className="text-xs text-gray-500 hidden sm:block">バドミントン大会</div>
          </div>
        </Link>

        {/* デスクトップナビ */}
        <nav className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map(({ path, label, icon, category, badge }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={navTo(path)}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${categoryColor(category, active)} ${active ? (category === 'activity' ? 'bg-emerald-50' : 'bg-blue-50') : 'hover:bg-gray-50'}`}
              >
                <span className="text-base leading-none">{icon}</span>
                <span>{label[navLang]}</span>
                {badge && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-600 font-bold leading-none">
                    {badge[navLang]}
                  </span>
                )}
              </Link>
            );
          })}

          <div className="w-px h-4 bg-gray-200 mx-1" />

          <button
            onClick={() => switchLanguage(lang === 'ja' ? 'zh' : 'ja')}
            className="text-xs font-bold px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-gray-600"
          >
            {lang === 'ja' ? '中文' : '日本語'}
          </button>

          {isAuthenticated ? (
            <>
              <Link
                to={navTo('admin')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive('admin') ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                管理画面
              </Link>
              <button
                onClick={logout}
                className="text-sm text-gray-400 hover:text-red-500 transition-colors px-2"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link to="/login" className="text-sm text-gray-400 hover:text-gray-700 transition-colors px-2">
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
          menuOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="border-t border-gray-100 bg-white px-4 py-3 pb-4 flex flex-col gap-1">

          {/* 大会セクション */}
          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest px-2 mb-1">{lang === 'ja' ? '🏆 大会' : '🏆 赛事'}</p>
          {NAV_ITEMS.filter(n => n.category === 'tournament').map(({ path, label, icon, badge }) => (
            <Link key={path} to={navTo(path)} onClick={close}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${categoryBg('tournament', isActive(path))}`}
            >
              <span>{icon}</span>
              <span>{label[navLang]}</span>
              {badge && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-500 font-bold">{badge[navLang]}</span>}
            </Link>
          ))}

          <div className="h-px bg-gray-100 my-2" />

          {/* 通常活動セクション */}
          <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest px-2 mb-1">{lang === 'ja' ? '🏸 通常活動' : '🏸 日常活动'}</p>
          {NAV_ITEMS.filter(n => n.category === 'activity').map(({ path, label, icon }) => (
            <Link key={path} to={navTo(path)} onClick={close}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${categoryBg('activity', isActive(path))}`}
            >
              <span>{icon}</span>
              <span>{label[navLang]}</span>
            </Link>
          ))}

          <div className="h-px bg-gray-100 my-2" />

          {/* その他 */}
          {NAV_ITEMS.filter(n => n.category === 'general').map(({ path, label, icon }) => (
            <Link key={path} to={navTo(path)} onClick={close}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${categoryBg('general', isActive(path))}`}
            >
              <span>{icon}</span>
              <span>{label[navLang]}</span>
            </Link>
          ))}

          {/* 言語切り替え（モバイル） */}
          <div className="h-px bg-gray-100 my-1" />
          <button
            onClick={() => switchLanguage(lang === 'ja' ? 'zh' : 'ja')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-left"
          >
            🌐 {lang === 'ja' ? '中文に切り替え' : '切换为日语'}
          </button>

          <div className="h-px bg-gray-100 my-1" />
          {isAuthenticated ? (
            <>
              <Link to={navTo('admin')} onClick={close}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${categoryBg('general', isActive('admin'))}`}
              >
                ⚙️ 管理画面
              </Link>
              <button onClick={() => { logout(); close(); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                ログアウト
              </button>
            </>
          ) : (
            <Link to="/login" onClick={close}
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
