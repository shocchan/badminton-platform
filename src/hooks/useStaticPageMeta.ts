// Phase 1.5: 静的ページ用の usePageMeta ラッパー。
// 現在のパスから src/lib/pageMeta.ts の meta 定義を引き、usePageMeta を呼ぶ。
// 対応が無いパスでは何もしない（フォールバックの index.html 側 meta を維持）。

import { useLocation } from 'react-router-dom';
import { usePageMeta } from './usePageMeta';
import { getStaticPageMeta } from '../lib/pageMeta';

export function useStaticPageMeta() {
  const { pathname } = useLocation();
  // 末尾スラッシュを1つに正規化: /ja → /ja/, /ja/faq/ → /ja/faq
  const normalized =
    pathname === '/ja' ? '/ja/' :
    pathname === '/zh' ? '/zh/' :
    pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
  // 対応が無いパスでは usePageMeta が no-op になる（内部で null チェック）
  usePageMeta(getStaticPageMeta(normalized));
}
