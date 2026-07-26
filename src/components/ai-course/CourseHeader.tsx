// AIコース専用ヘッダー（/:lang/ai-course 配下・管理画面で使用）
// Andyさんは kawabado の通常会員ではないため、通常ヘッダー（マイページ／予約／決済）は出さない。
// 既存の Header.tsx には一切手を加えない。表示切替は App.tsx のルート判定で行う。
//
// レスポンシブ:
// - スマホ: ブランド行＋横スクロールタブ（従来のコンパクト表示）
// - lg以上: 1段レイアウト（左ブランド／中央ナビ／右 言語切替・ログアウト）

import { GraduationCap, Home, TrendingUp, Map, History, Settings, LogOut, Languages, FlaskConical, BookOpen } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';

/** ヘッダーのナビ対象（AiCoursePage の Step と対応） */
export type CourseNavKey = 'home' | 'growth' | 'roadmap' | 'vocab' | 'lab' | 'history' | 'settings';

interface Props {
  t: AiCourseDict;
  /** 未ログイン・初回診断中はナビを出さない（押しても行き先がないため） */
  showNav?: boolean;
  current?: CourseNavKey;
  onNavigate?: (key: CourseNavKey) => void;
  onLogout?: () => void;
  /** 現在の表示言語。言語切替ボタンを出すために必須 */
  lang?: 'ja' | 'zh';
  /** ワンタップ言語切替。ある場合だけボタンを出す（管理画面では渡さない） */
  onToggleLang?: () => void;
  /** しくみラボの主要ナビ表示（labPreview権限のみtrue・一般受講生はDOM自体を出さない・§1） */
  showLab?: boolean;
}

const navItems = (showLab: boolean): { key: CourseNavKey; icon: typeof Home }[] => [
  { key: 'home', icon: Home },
  { key: 'growth', icon: TrendingUp },
  { key: 'roadmap', icon: Map },
  // ことば図鑑・しくみラボはAI会話と並ぶ主要機能としてロードマップの次に置く（labPreviewのみ）
  ...(showLab ? ([{ key: 'vocab', icon: BookOpen }, { key: 'lab', icon: FlaskConical }] as { key: CourseNavKey; icon: typeof Home }[]) : []),
  { key: 'history', icon: History },
  { key: 'settings', icon: Settings },
];

/** 言語切替ボタン。日本語表示中は「中文」、中国語表示中は「日本語」を出す（必ず文字を表示） */
const LangToggle = ({ lang, onToggle, label }: { lang: 'ja' | 'zh'; onToggle: () => void; label: string }) => (
  <button
    type="button" onClick={onToggle}
    aria-label={lang === 'ja' ? '切换到中文' : '日本語に切り替える'}
    className="min-h-11 px-2.5 text-xs font-medium text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg flex items-center gap-1 shrink-0"
  >
    <Languages className="w-3.5 h-3.5" />
    {/* 日本語表示中→「中文」、中国語表示中→「日本語」 */}
    {label}
  </button>
);

export const CourseHeader = ({ t, showNav = false, current, onNavigate, onLogout, lang, onToggleLang, showLab = false }: Props) => {
  const toggleLabel = lang === 'ja' ? '中文' : '日本語';
  const NAV = navItems(showLab);
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-4">
        {/* ── 上段: ブランド ＋ （lg以上）中央ナビ ＋ 右操作 ── */}
        <div className="h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <GraduationCap className="w-5 h-5 text-blue-600 shrink-0" />
            <span className="font-bold text-gray-900 text-sm truncate">{t.brand}</span>
          </div>

          {/* lg以上: ナビを中央に1段で出す */}
          {showNav && onNavigate && (
            <nav className="hidden lg:flex items-center gap-1" aria-label={t.brand}>
              {NAV.map(({ key, icon: Icon }) => (
                <button
                  key={key} type="button" onClick={() => onNavigate(key)}
                  aria-current={current === key ? 'page' : undefined}
                  className={`min-h-11 px-3 py-2 text-sm font-medium rounded-lg flex items-center gap-1.5 transition-colors action-raised ${
                    current === key ? 'bg-blue-50 text-blue-700 shadow-inner is-current-pill' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {t.nav[key]}
                </button>
              ))}
            </nav>
          )}

          <div className="flex items-center gap-2 shrink-0">
            {lang && onToggleLang && <LangToggle lang={lang} onToggle={onToggleLang} label={toggleLabel} />}
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
        </div>

        {/* ── 下段: スマホ/タブレット用の横スクロールタブ（lg未満のみ） ── */}
        {showNav && onNavigate && (
          <nav className={`flex lg:hidden items-center gap-1 -mb-px ${showLab ? 'flex-wrap' : 'overflow-x-auto'}`} aria-label={t.brand}>
            {NAV.map(({ key, icon: Icon }) => (
              <button
                key={key} type="button" onClick={() => onNavigate(key)}
                aria-current={current === key ? 'page' : undefined}
                className={`min-h-11 px-3 py-2 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-1.5 transition-colors ${
                  current === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
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
};
