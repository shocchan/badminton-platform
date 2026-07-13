import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Trophy,
  CalendarDays,
  Newspaper,
  BarChart3,
  HelpCircle,
  Gamepad2,
  ClipboardList,
  User,
  CircleUserRound,
  LogIn,
  LogOut,
  Sparkles,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useLanguage } from '../contexts/LanguageContext';
import { LogoMark } from './LogoMark';

type NavItem = {
  path: string; // /:lang/ 以降のパス（例: '' / 'activity' / 'blog'）
  label: { ja: string; zh: string };
  icon: LucideIcon;
  category: 'tournament' | 'activity' | 'general';
  badge?: { ja: string; zh: string };
};

const NAV_ITEMS: NavItem[] = [
  { path: '',            label: { ja: '大会案内',   zh: '赛事信息' }, icon: Trophy,        category: 'tournament' },
  { path: 'activity',   label: { ja: '通常活動',   zh: '日常活动' }, icon: CalendarDays,  category: 'activity' },
  { path: 'blog',       label: { ja: 'ブログ',     zh: '博客' },     icon: Newspaper,     category: 'general' },
  { path: 'level-guide',label: { ja: 'クラス案内', zh: '级别说明' }, icon: BarChart3,     category: 'tournament', badge: { ja: '大会', zh: '大会' } },
  { path: 'faq',        label: { ja: 'FAQ',        zh: '常见问题' }, icon: HelpCircle,    category: 'tournament', badge: { ja: '大会', zh: '大会' } },
  { path: 'game',       label: { ja: 'バドゲーム', zh: '羽球游戏' }, icon: Gamepad2,      category: 'general' },
  { path: 'tactics-board', label: { ja: '戦術ボード', zh: '战术板' }, icon: ClipboardList, category: 'general' },
];

const categoryColor = (cat: NavItem['category'], active: boolean) => {
  if (cat === 'activity') return active ? 'text-emerald-700' : 'text-gray-600 hover:text-emerald-700';
  return active ? 'text-blue-700' : 'text-gray-600 hover:text-gray-900';
};

const categoryBg = (cat: NavItem['category'], active: boolean) => {
  if (!active) return 'text-gray-700 hover:bg-gray-50';
  if (cat === 'activity') return 'bg-emerald-50 text-emerald-700';
  return 'bg-blue-50 text-blue-700';
};

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const { lang, groupSlug } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);

  // グループプレフィックス（kawaguchi-warabi は空、それ以外は /groupSlug）
  const groupPrefix = groupSlug === 'kawaguchi-warabi' ? '' : `/${groupSlug}`;

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
    if (groupSlug === 'kawaguchi-warabi') {
      parts[0] = newLang; // /:lang/...
    } else {
      parts[1] = newLang; // /:groupSlug/:lang/...
    }
    navigate('/' + parts.join('/') + (location.search || ''));
    setMenuOpen(false);
  };

  const close = () => setMenuOpen(false);
  const navLang = lang as 'ja' | 'zh';

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
        {/* ロゴ */}
        <Link to={navTo('')} onClick={close} className="flex items-center gap-2.5 flex-shrink-0">
          <LogoMark className="h-8 w-8 sm:h-10 sm:w-10 flex-shrink-0 drop-shadow-sm" />
          <div>
            <div className="font-extrabold text-gray-900 text-sm sm:text-lg leading-tight tracking-tight">川口・蕨バドミントン交流会</div>
            <div className="text-[10px] sm:text-xs text-gray-500 font-medium tracking-widest hidden sm:block">KAWABADO</div>
          </div>
        </Link>

        {/* デスクトップナビ */}
        <nav aria-label="メインナビゲーション" className="hidden sm:flex items-center gap-1">
          {NAV_ITEMS.map(({ path, label, icon: Icon, category, badge }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={navTo(path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${categoryColor(category, active)} ${active ? (category === 'activity' ? 'bg-emerald-50' : 'bg-blue-50') : 'hover:bg-gray-50'}`}
              >
                <Icon className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
                <span>{label[navLang]}</span>
                {badge && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-blue-100 text-blue-700 font-bold leading-none">
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

          {/* プロフィールアイコン */}
          <div className="relative">
            <button
              onClick={() => setAuthMenuOpen(!authMenuOpen)}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white flex items-center justify-center hover:shadow-lg transition-shadow ml-2"
              title={isAuthenticated ? 'マイメニュー' : 'ログイン'}
              aria-label={isAuthenticated ? 'マイメニューを開く' : 'ログインメニューを開く'}
              aria-expanded={authMenuOpen}
            >
              <User className="h-5 w-5" strokeWidth={2.25} />
            </button>

            {/* ドロップダウンメニュー */}
            {authMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50">
                {isAuthenticated ? (
                  <>
                    <Link
                      to={navTo('mypage')}
                      onClick={() => setAuthMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      <CircleUserRound className="h-4 w-4 text-blue-500" /> マイページ
                    </Link>
                    <button
                      onClick={() => {
                        logout();
                        setAuthMenuOpen(false);
                      }}
                      className="w-full text-left flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <LogOut className="h-4 w-4" /> ログアウト
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to={navTo('auth-landing')}
                      onClick={() => setAuthMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-100"
                    >
                      <LogIn className="h-4 w-4 text-gray-500" /> ログイン
                    </Link>
                    <Link
                      to={navTo('auth-landing')}
                      onClick={() => setAuthMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Sparkles className="h-4 w-4" /> 新規登録
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
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
        <div className="border-t border-gray-100 bg-white px-4 py-3 pb-4 flex flex-col gap-1 overflow-y-auto max-h-[calc(500px-8px)]">

          {/* 大会セクション */}
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-blue-600 uppercase tracking-widest px-2 mb-1">
            <Trophy className="h-3 w-3" /> {lang === 'ja' ? '大会' : '赛事'}
          </p>
          {NAV_ITEMS.filter(n => n.category === 'tournament').map(({ path, label, icon: Icon, badge }) => (
            <Link key={path} to={navTo(path)} onClick={close}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${categoryBg('tournament', isActive(path))}`}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" strokeWidth={2} />
              <span>{label[navLang]}</span>
              {badge && <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">{badge[navLang]}</span>}
            </Link>
          ))}

          <div className="h-px bg-gray-100 my-2" />

          {/* 通常活動セクション */}
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 uppercase tracking-widest px-2 mb-1">
            <CalendarDays className="h-3 w-3" /> {lang === 'ja' ? '通常活動' : '日常活动'}
          </p>
          {NAV_ITEMS.filter(n => n.category === 'activity').map(({ path, label, icon: Icon }) => (
            <Link key={path} to={navTo(path)} onClick={close}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${categoryBg('activity', isActive(path))}`}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" strokeWidth={2} />
              <span>{label[navLang]}</span>
            </Link>
          ))}

          <div className="h-px bg-gray-100 my-2" />

          {/* その他 */}
          {NAV_ITEMS.filter(n => n.category === 'general').map(({ path, label, icon: Icon }) => (
            <Link key={path} to={navTo(path)} onClick={close}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${categoryBg('general', isActive(path))}`}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" strokeWidth={2} />
              <span>{label[navLang]}</span>
            </Link>
          ))}

          {/* 言語切り替え（モバイル） */}
          <div className="h-px bg-gray-100 my-1" />
          <button
            onClick={() => switchLanguage(lang === 'ja' ? 'zh' : 'ja')}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors text-left"
          >
            <Globe className="h-4.5 w-4.5 flex-shrink-0" strokeWidth={2} />
            {lang === 'ja' ? '中文に切り替え' : '切换为日语'}
          </button>

          <div className="h-px bg-gray-100 my-1" />
          {isAuthenticated ? (
            <>
              <Link to={navTo('mypage')} onClick={close}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-blue-50 text-blue-600 transition-colors"
              >
                <CircleUserRound className="h-4.5 w-4.5 flex-shrink-0" /> マイページ
              </Link>
              <button onClick={() => { logout(); close(); }}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors text-left w-full"
              >
                <LogOut className="h-4.5 w-4.5 flex-shrink-0" /> ログアウト
              </button>
            </>
          ) : (
            <>
              <Link to={navTo('auth-landing')} onClick={close}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <LogIn className="h-4.5 w-4.5 flex-shrink-0 text-gray-500" /> ログイン
              </Link>
              <Link to={navTo('auth-landing')} onClick={close}
                className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold bg-blue-50 text-blue-600 transition-colors"
              >
                <Sparkles className="h-4.5 w-4.5 flex-shrink-0" /> 新規登録
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
