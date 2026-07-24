// Phase 1.5: DOM 内 meta タグを in-place で1件だけに揃えるフック。
//
// 【暫定的な互換レイヤーとしての位置付け】
// React 19 が JSX 内の <meta>/<link>/<title> を自動で <head> へ持ち上げるようになった影響で、
// react-helmet-async 3.0.0 の重複排除ロジックが機能しない。
// 対象ページの Helmet 側 meta を除去し、代わりに本フックで DOM を直接書き換えることで
// 「初期 HTML (Worker 注入) の 1 件だけを維持し、SPA 遷移時も 1 件に保つ」実装を担う。
//
// 将来 Phase 2 以降で React 19 ネイティブメタサポート（<title>/<meta>/<link> を JSX として
// 通常書けば自動で <head> に集約される機能）へ移行し、このフックは撤去する予定。
//
// 使用制約:
//  - JSON-LD (<script type="application/ld+json">) はこのフックの管轄外。Helmet で管理する。
//  - noindex ページ（管理画面、認証系）はこのフックを使わない（既存の Helmet<meta name="robots"> を維持）。

import { useEffect } from 'react';
import type { PageMeta } from '../lib/pageMeta';
import { DEFAULT_OGP } from '../lib/pageMeta';

// 名前空間属性で1つの meta タグに絞り込む。複数見つかったら「最初の1件を更新し、残りを削除」して重複を潰す。
// 見つからなければ新規作成して <head> に追加する。
function setSingleMeta(attrKey: 'name' | 'property', attrValue: string, content: string) {
  const selector = `meta[${attrKey}="${cssEscape(attrValue)}"]`;
  const list = document.head.querySelectorAll<HTMLMetaElement>(selector);
  if (list.length === 0) {
    const el = document.createElement('meta');
    el.setAttribute(attrKey, attrValue);
    el.setAttribute('content', content);
    document.head.appendChild(el);
    return;
  }
  list.forEach((el, i) => {
    if (i === 0) {
      el.setAttribute('content', content);
    } else {
      el.remove();
    }
  });
}

// canonical のように1件しか持たない link を in-place 更新（同名の複数タグも1件に集約）。
function setSingleLink(rel: string, href: string) {
  const selector = `link[rel="${cssEscape(rel)}"]:not([hreflang])`;
  const list = document.head.querySelectorAll<HTMLLinkElement>(selector);
  if (list.length === 0) {
    const el = document.createElement('link');
    el.setAttribute('rel', rel);
    el.setAttribute('href', href);
    document.head.appendChild(el);
    return;
  }
  list.forEach((el, i) => {
    if (i === 0) el.setAttribute('href', href);
    else el.remove();
  });
}

// hreflang 群は「全削除 → 再生成」で管理。SPA 遷移で前ページの hreflang が残らないことを保証。
function replaceHreflangs(entries: PageMeta['hreflang']) {
  document.head.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
  for (const e of entries) {
    const el = document.createElement('link');
    el.setAttribute('rel', 'alternate');
    el.setAttribute('hreflang', e.hreflang);
    el.setAttribute('href', e.href);
    document.head.appendChild(el);
  }
}

// 古いブラウザ用の CSS.escape フォールバック。属性値に特殊文字は使わないが安全のため。
function cssEscape(s: string): string {
  if (typeof (globalThis as unknown as { CSS?: { escape?: (v: string) => string } }).CSS?.escape === 'function') {
    return CSS.escape(s);
  }
  return s.replace(/["\\]/g, '\\$&');
}

export function usePageMeta(meta: PageMeta | null | undefined) {
  // meta オブジェクトを serialize して依存に渡すことで、参照は違うが内容が同じケースでは再実行しない
  const key = meta ? JSON.stringify(meta) : '';
  useEffect(() => {
    if (!meta) return;
    // title / html lang
    if (document.title !== meta.title) document.title = meta.title;
    if (document.documentElement.lang !== meta.htmlLang) {
      document.documentElement.lang = meta.htmlLang;
    }

    // description
    setSingleMeta('name', 'description', meta.description);

    // OGP
    setSingleMeta('property', 'og:type', meta.ogType);
    setSingleMeta('property', 'og:title', meta.ogTitle ?? meta.title);
    setSingleMeta('property', 'og:description', meta.ogDescription ?? meta.description);
    setSingleMeta('property', 'og:url', meta.ogUrl ?? meta.canonical);
    setSingleMeta('property', 'og:image', meta.ogImage ?? DEFAULT_OGP);
    setSingleMeta('property', 'og:locale', meta.ogLocale);

    // Twitter Card
    setSingleMeta('name', 'twitter:card', meta.twitterCard);
    setSingleMeta('name', 'twitter:title', meta.twitterTitle ?? meta.title);
    setSingleMeta('name', 'twitter:description', meta.twitterDescription ?? meta.description);
    setSingleMeta('name', 'twitter:image', meta.twitterImage ?? meta.ogImage ?? DEFAULT_OGP);

    // canonical + hreflang（hreflang は空配列なら全削除）
    setSingleLink('canonical', meta.canonical);
    replaceHreflangs(meta.hreflang);

    // このフックを通ったページは公開・インデックス対象。前ページに残った noindex meta があれば消す。
    document.head.querySelectorAll('meta[name="robots"]').forEach((el) => el.remove());
  }, [key]);
}
