// AIコースのルート判定（App.tsx のヘッダー切替とテストで共用）
// AIコースは通常会員向けではないため、これらのパスでは通常ヘッダー／フッターを出さず、
// AIコース専用ヘッダー（CourseHeader）を使う。

/** /:lang/ai-course および /:lang/ai-course/... か */
export const isAiCourseRoute = (pathname: string): boolean =>
  /^\/[^/]+\/ai-course(\/|$)/.test(pathname);
