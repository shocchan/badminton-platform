// AIコース専用ヘッダー（/:lang/ai-course 配下・管理画面で使用）
// Andyさんは kawabado の通常会員ではないため、通常ヘッダー（マイページ／予約／決済）は出さない。
// 既存の Header.tsx には一切手を加えない。表示切替は App.tsx のルート判定で行う。
//
// レスポンシブ:
// - スマホ: ブランド行＋横スクロールタブ（従来のコンパクト表示）
// - lg以上: 1段レイアウト（左ブランド／中央ナビ／右 言語切替・ログアウト）

import { useEffect, useRef, useState } from 'react';
import { GraduationCap, Home, TrendingUp, Map, History, Settings, LogOut, Languages, FlaskConical, BookOpen, Mic, MoreHorizontal } from 'lucide-react';
import type { AiCourseDict } from '../../locales/aiCourse';
import { trackCourse } from '../../lib/aiLesson/course/courseAnalytics';

/** ヘッダーのナビ対象（AiCoursePage の Step と対応。conversationはホームの会話開始位置への入口） */
export type CourseNavKey = 'home' | 'conversation' | 'growth' | 'roadmap' | 'vocab' | 'lab' | 'history' | 'settings';

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

// 案A改（Phase 2E-1 §19・labPreviewのみ）: 中核機能のAI会話を主要ナビへ明示。
// ロードマップ・学習記録は成長内へ統合（旧URL・旧画面は削除せず直接アクセス可能）。
// 一般受講生は従来の5項目のまま変更しない。
const navItems = (showLab: boolean): { key: CourseNavKey; icon: typeof Home }[] => (showLab
  ? [
    { key: 'home', icon: Home },
    { key: 'conversation', icon: Mic },
    { key: 'vocab', icon: BookOpen },
    { key: 'lab', icon: FlaskConical },
    { key: 'growth', icon: TrendingUp },
    { key: 'settings', icon: Settings },
  ]
  : [
    { key: 'home', icon: Home },
    { key: 'growth', icon: TrendingUp },
    { key: 'roadmap', icon: Map },
    { key: 'history', icon: History },
    { key: 'settings', icon: Settings },
  ]);

/**
 * labPreviewモバイルナビ（案A・2E-1.5 §16）: ホーム/AI会話/ことば/しくみ＋その他。
 * 「その他」は新画面ではなく軽量シート（成長・設定）。Escape/外側タップ/選択で閉じる。
 * 4項目は320pxでも各72px以上・44pxタップ領域を確保できる。
 */
const MobileLabNav = ({ t, current, onNavigate }: {
  t: AiCourseDict; current?: CourseNavKey; onNavigate: (k: CourseNavKey) => void;
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false); };
    const onDown = (e: MouseEvent) => { if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('mousedown', onDown); };
  }, [moreOpen]);
  const MAIN: { key: CourseNavKey; icon: typeof Home; label: string }[] = [
    { key: 'home', icon: Home, label: t.nav.home },
    { key: 'conversation', icon: Mic, label: t.nav.conversation },
    { key: 'vocab', icon: BookOpen, label: t.nav.vocab },
    { key: 'lab', icon: FlaskConical, label: t.nav.labShort },
  ];
  const moreActive = current === 'growth' || current === 'settings';
  return (
    <nav className="lg:hidden relative -mb-px" aria-label={t.brand}>
      <div className="flex items-stretch">
        {MAIN.map(({ key, icon: Icon, label }) => (
          <button
            key={key} type="button" onClick={() => { setMoreOpen(false); onNavigate(key); }}
            aria-current={current === key ? 'page' : undefined}
            className={`flex-1 basis-0 min-w-0 min-h-11 px-1 py-2 text-xs font-medium border-b-2 whitespace-nowrap flex items-center justify-center gap-1 transition-colors ${
              current === key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            {label}
          </button>
        ))}
        <button
          type="button" aria-expanded={moreOpen} aria-haspopup="menu"
          onClick={() => { if (!moreOpen) trackCourse('open_ai_course_mobile_more'); setMoreOpen((v) => !v); }}
          className={`flex-1 basis-0 min-w-0 min-h-11 px-1 py-2 text-xs font-medium border-b-2 flex items-center justify-center gap-1 transition-colors ${
            moreActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MoreHorizontal className="w-3.5 h-3.5 shrink-0" />
          {t.nav.more}
        </button>
      </div>
      {moreOpen && (
        <div ref={moreRef} role="menu" aria-label={t.nav.more}
          className="absolute right-2 top-full mt-1 z-40 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-40 motion-safe:animate-[fadeIn_120ms_ease-out]">
          {([['growth', TrendingUp, t.nav.growth], ['settings', Settings, t.nav.settings]] as [CourseNavKey, typeof Home, string][]).map(([key, Icon, label]) => (
            <button key={key} type="button" role="menuitem"
              onClick={() => { setMoreOpen(false); onNavigate(key); }}
              aria-current={current === key ? 'page' : undefined}
              className={`w-full min-h-11 px-4 py-2 text-sm text-left flex items-center gap-2 ${current === key ? 'text-blue-700 font-bold' : 'text-gray-700'} hover:bg-gray-50`}
            >
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      )}
    </nav>
  );
};

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
                className="min-h-11 min-w-11 px-2 text-xs text-gray-500 hover:text-gray-700 flex items-center justify-center gap-1 shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t.login.logout}</span>
              </button>
            )}
          </div>
        </div>

        {/* ── 下段: スマホ/タブレット用タブ（lg未満のみ）。
             labPreviewは案A（2E-1.5 §16）: 主要4項目＋「その他」（成長・設定は軽量シート）。
             一般受講生は従来の5項目のまま。 ── */}
        {showNav && onNavigate && (
          showLab
            ? <MobileLabNav t={t} current={current} onNavigate={onNavigate} />
            : (
              <nav className="flex lg:hidden items-center gap-1 -mb-px overflow-x-auto" aria-label={t.brand}>
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
            )
        )}
      </div>
    </header>
  );
};
