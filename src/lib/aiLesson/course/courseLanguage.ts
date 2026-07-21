// AIコースの表示言語ユーティリティ（純関数・テスト対象）。
//
// 方針:
// - 言語切替は navigate せず in-memory で行う（remount＝状態喪失を避ける）。
// - URL は history.replaceState で装飾的に同期し、共有・再読込時に効くようにする。
// - 書き換えるのは AIコースの locale segment だけ。通常サイトのURLは触らない。

export type UiLang = 'ja' | 'zh';

/** 初期表示言語を決める（URL明示 > 保存設定 > ブラウザ言語 > ja） */
export const resolveInitialLang = (params: {
  urlLang: UiLang;         // ルートから来る lang（AIコースは常に ja/zh を含む）
  savedLang?: UiLang | null;
  browserLang?: string | null;
}): UiLang => {
  // AIコースのURLは常に明示的（/ja/ or /zh/）なのでURLを最優先する
  if (params.urlLang === 'ja' || params.urlLang === 'zh') return params.urlLang;
  if (params.savedLang === 'ja' || params.savedLang === 'zh') return params.savedLang;
  if (params.browserLang && /^zh/i.test(params.browserLang)) return 'zh';
  return 'ja';
};

/** 反対の言語 */
export const otherLang = (lang: UiLang): UiLang => (lang === 'ja' ? 'zh' : 'ja');

/**
 * AIコースのパスの locale segment だけを安全に差し替える。
 * - 先頭の /ja/ または /zh/ のみ変更（/xx/ai-course... の xx）
 * - AIコース配下（/:lang/ai-course...）でなければ元のパスを返す（誤変換防止）
 * - query / hash は呼び出し側で維持する（この関数は pathname のみ扱う）
 */
export const swapCourseLocaleInPath = (pathname: string, next: UiLang): string => {
  const m = pathname.match(/^\/(ja|zh)(\/ai-course(?:\/.*)?)$/);
  if (!m) return pathname;
  return `/${next}${m[2]}`;
};

/** AIコースのパスか（locale切替を許可する範囲か） */
export const isCoursePath = (pathname: string): boolean => /^\/(ja|zh)\/ai-course(\/|$)/.test(pathname);
