// ブログの言語切り替え。中国語版（*_zh）が空の記事は日本語にフォールバックする。
// 「中文にしたのに一覧から記事が消える」より「日本語のまま出る」ほうが親切なため。
import type { BlogPost } from '../types';
import type { Lang } from '../contexts/LanguageContext';

/** 記事から表示言語に応じたテキストを取り出す。zhが未入力なら日本語を返す */
export function localizedPost(post: BlogPost, lang: Lang) {
  const useZh = lang === 'zh';
  const pick = (zh: string | null | undefined, ja: string) => (useZh && zh && zh.trim() ? zh : ja);
  return {
    title: pick(post.title_zh, post.title),
    excerpt: pick(post.excerpt_zh, post.excerpt ?? '') || undefined,
    content: pick(post.content_zh, post.content),
    /** 中国語版が用意されているか（未翻訳バッジの出し分けに使う） */
    isTranslated: !useZh || Boolean(post.content_zh && post.content_zh.trim()),
  };
}

/** ブログ画面のUI文言 */
export const BLOG_UI = {
  ja: {
    heading: 'ブログ',
    lead: '大会結果やお知らせをお届けします',
    sort: { newest: '最新順', oldest: '最旧順', popular: '人気順' },
    loadError: '記事の読み込みに失敗しました',
    emptyTitle: 'まだ記事がありません',
    emptyDesc: '大会結果やお知らせを順次掲載していきます',
    readMore: '詳細を見る',
    tagFallback: 'ブログ',
    backToList: '← ブログ一覧へ',
    notFound: '記事が見つかりませんでした',
    draftNotice: '📝 下書きプレビュー — この記事はまだ公開されていません（管理者のみ閲覧可能）',
    toAdmin: '管理ページへ',
    untranslated: 'この記事はまだ中国語版がありません（日本語で表示しています）',
  },
  zh: {
    heading: '博客',
    lead: '发布比赛结果和活动通知',
    sort: { newest: '最新', oldest: '最早', popular: '热门' },
    loadError: '文章加载失败',
    emptyTitle: '还没有文章',
    emptyDesc: '我们会陆续发布比赛结果和活动通知',
    readMore: '查看详情',
    tagFallback: '博客',
    backToList: '← 返回博客列表',
    notFound: '未找到该文章',
    draftNotice: '📝 草稿预览 — 本文尚未公开（仅管理员可见）',
    toAdmin: '前往管理页面',
    untranslated: '本文暂无中文版，以下为日文原文',
  },
} as const;

export const blogLocale = (lang: Lang) => (lang === 'zh' ? 'zh-CN' : 'ja-JP');
