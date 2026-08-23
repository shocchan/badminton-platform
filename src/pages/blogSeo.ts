// ブログのSEOメタ（一覧・詳細で共有）。
//
// 【なぜ要るか】
// ブログの2ページ（一覧 /:lang/blog と詳細 /:lang/blog/:id）だけ Helmet が無く、
// index.html のフォールバック「川口・蕨バドミントン交流会」がそのまま出ていた。
// sitemap には /ja/blog と /zh/blog の両方が載っているので、
// Googleからは「同じタイトル・同じ説明・同じ本文のページが2本」に見える（重複扱い）。
//
// 【中国語版の扱い】
// 記事本文は日本語しか無い。UIだけ中国語にしても中身は日本語のままなので、
// /zh/blog・/zh/blog/:id は canonical を日本語版へ寄せる（hreflangは出さない＝
// 自己参照でないcanonicalとhreflangは併用すると矛盾するため）。
// 記事の中国語版を用意したら、この方針ごと見直すこと。
export const SITE = 'https://kawabado.com';

export type BlogLang = 'ja' | 'zh';

export const BLOG_META: Record<BlogLang, { title: string; description: string; heading: string; lead: string; back: string; empty: { title: string; description: string }; error: string; more: string; tag: string }> = {
  ja: {
    title: 'ブログ | 川口・蕨バドミントン交流会',
    description: '川口・蕨バドミントン交流会の活動ブログ。大会結果レポート、会場の様子、参加者の声、お知らせを掲載しています。',
    heading: 'ブログ',
    lead: '大会結果やお知らせをお届けします',
    back: '← ブログ一覧へ',
    empty: { title: 'まだ記事がありません', description: '大会結果やお知らせを順次掲載していきます' },
    error: '記事の読み込みに失敗しました',
    more: '詳細を見る',
    tag: 'ブログ',
  },
  zh: {
    title: '博客 | 川口・蕨羽毛球交流会',
    description: '川口・蕨羽毛球交流会的活动博客。刊登赛事结果报告、会场情况、参加者感想与各类通知（正文为日语）。',
    heading: '博客',
    lead: '发布赛事结果与各类通知（正文为日语）',
    back: '← 返回博客列表',
    empty: { title: '还没有文章', description: '赛事结果与通知会陆续发布' },
    error: '文章加载失败',
    more: '查看详情',
    tag: '博客',
  },
};

/** ブログURLのcanonical。中国語版は日本語版へ寄せる（本文が日本語のみのため） */
export const blogCanonical = (path: string) => `${SITE}/ja/${path}`;
