// AIコースのルート判定（App.tsx のヘッダー切替とテストで共用）
// AIコースは通常会員向けではないため、これらのパスでは通常ヘッダー／フッターを出さず、
// AIコース専用ヘッダー（CourseHeader）を使う。

/**
 * /:lang/ai-course および /:lang/ai-course/... か。
 *
 * 2026-09-09 追加: /:lang/learn/:code（個人専用URL）も同じ扱いにする。
 * ここへ来るのは学習者だけで、バドミントンのヘッダー・フッター
 * （大会案内・クラス案内・ログイン/新規登録）は文脈が違って混乱させる。
 */
export const isAiCourseRoute = (pathname: string): boolean =>
  /^\/[^/]+\/ai-course(\/|$)/.test(pathname) || /^\/[^/]+\/learn(\/|$)/.test(pathname)
  // 招待リンク限定ページ（2026-09-11）。バドミントン側のヘッダー・フッターを出さない
  || /^\/[^/]+\/invite(\/|$)/.test(pathname);
