// AIコース専用ヘッダー（/:lang/ai-course 配下・管理画面で使用）
// Andyさんは kawabado の通常会員ではないため、通常ヘッダー（マイページ／予約／決済）は出さない。
// 既存の Header.tsx には一切手を加えない。表示切替は App.tsx のルート判定で行う。

import { GraduationCap, Home, TrendingUp, Map, History, Settings, LogOut } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';

/** ヘッダーのナビ対象（AiCoursePage の Step と対応） */
export type CourseNavKey = 'home' | 'growth' | 'roadmap' | 'history' | 'settings';

interface Props {
  t: AiCourseDict;
  /** 未ログイン・初回診断中はナビを出さない（押しても行き先がないため） */
  showNav?: boolean;
  current?: CourseNavKey;
  onNavigate?: (key: CourseNavKey) => void;
  onLogout?: () => void;
}

const NAV: { key: CourseNavKey; icon: typeof Home }[] = [
  { key: 'home', icon: Home },
  { key: 'growth', icon: TrendingUp },
  { key: 'roadmap', icon: Map },
  { key: 'history', icon: History },
  { key: 'settings', icon: Settings },
];

export const CourseHeader = ({ t, showNav = false, current, onNavigate, onLogout }: Props) => (
  <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
    <div className="max-w-3xl mx-auto px-4">
      <div className="h-14 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <GraduationCap className="w-5 h-5 text-blue-600 shrink-0" />
          <span className="font-bold text-gray-900 text-sm truncate">{t.brand}</span>
        </div>
        {showNav && onLogout && (
          <button
            type="button" onClick={onLogout}
            className="min-h-11 px-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1 shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.login.logout}</span>
          </button>
        )}
      </div>

      {showNav && onNavigate && (
        <nav className="flex items-center gap-1 -mb-px overflow-x-auto">
          {NAV.map(({ key, icon: Icon }) => (
            <button
              key={key} type="button" onClick={() => onNavigate(key)}
              aria-current={current === key ? 'page' : undefined}
              className={`min-h-11 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                current === key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.nav[key]}
            </button>
          ))}
        </nav>
      )}
    </div>
  </header>
);
