// ブログのSEOメタと、言語切替で本文を差し替えるための判定（一覧・詳細で共有）。
//
// 【なぜ要るか】
// ブログの2ページ（一覧 /:lang/blog と詳細 /:lang/blog/:id）だけ Helmet が無く、
// index.html のフォールバック「川口・蕨バドミントン交流会」がそのまま出ていた。
// sitemap には /ja/blog と /zh/blog の両方が載っているので、
// Googleからは「同じタイトル・同じ説明・同じ本文のページが2本」に見える（重複扱い）。
//
// 【中国語版の扱い（2026-08-25 更新）】
// blog_posts に title_zh / excerpt_zh / content_zh を足し、**同じ記事・同じURL構造のまま**
// 右上の言語切替で中身が入れ替わる形にした（migration 20260825110000_blog_zh_columns.sql）。
// 中国語版を別記事として立てる案は採っていない（view_count が2行に割れるため）。
//
// SEOは記事ごとに分岐する:
//   - 中国語本文がある記事 → /ja/blog/:id と /zh/blog/:id をそれぞれ自己参照canonicalにし、
//     ja/zh/x-default の hreflang を出す
//   - まだ無い記事        → 従来どおり canonical を /ja/blog/:id へ寄せ、hreflang は出さない
// 「自己参照でない canonical と hreflang を併用すると矛盾する」ので、
// **訳済みのときだけ hreflang を出す**。この一行がこのファイルの肝。
export const SITE = 'https://kawabado.com';

export type BlogLang = 'ja' | 'zh';

export const BLOG_META: Record<BlogLang, {
  title: string; description: string; heading: string; lead: string; back: string;
  empty: { title: string; description: string }; error: string; more: string; tag: string;
  /** 中国語UIで日本語のまま出している記事に付けるバッジ */
  jaBadge: string;
  /** 同じ記事の詳細ページ上部に出す一行 */
  jaNotice: string;
  /** 一覧の並べ替え。ここだけ日本語のままだと「全部中国語になった」に見えない */
  sort: { newest: string; oldest: string; popular: string };
}> = {
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
    jaBadge: '日本語',
    jaNotice: 'この記事は日本語で掲載しています。',
    sort: { newest: '最新順', oldest: '最旧順', popular: '人気順' },
  },
  zh: {
    title: '博客 | 川口・蕨羽毛球交流会',
    description: '川口・蕨羽毛球交流会的活动博客。刊登赛事结果报告、会场情况、参加者感想与各类通知。部分文章已提供中文版。',
    heading: '博客',
    lead: '发布赛事结果与各类通知。部分文章已提供中文版',
    back: '← 返回博客列表',
    empty: { title: '还没有文章', description: '赛事结果与通知会陆续发布' },
    error: '文章加载失败',
    more: '查看详情',
    tag: '博客',
    // 訳が無い記事も一覧に並べる。訳済みだけを出すと、中国語で見たときに記事が数本しか
    // 無いサイトに見える＝「更新が止まった場所」に見えるため。並べたうえで日本語だと示す
    jaBadge: '日文',
    jaNotice: '本文暂为日语。中文版正在陆续增加中。',
    sort: { newest: '最新', oldest: '最早', popular: '最热' },
  },
};

/** ブログ一覧URLのcanonical。一覧は日本語版へ寄せたまま（記事ごとの判定は下の関数） */
export const blogCanonical = (path: string) => `${SITE}/ja/${path}`;

/** 翻訳の有無を判定するのに使う「中身がある文字列か」 */
const filled = (s?: string | null): s is string => typeof s === 'string' && s.trim() !== '';

/** 言語切替で差し替える対象を持つ記事の最小形（BlogPost の部分集合） */
export interface BlogTextSource {
  title: string;
  excerpt?: string;
  content: string;
  title_zh?: string | null;
  excerpt_zh?: string | null;
  content_zh?: string | null;
}

/**
 * 中国語版があるか。判定は**本文（content_zh）だけ**を見る。
 * タイトルだけ訳して本文が日本語のままの記事を「中国語版あり」にすると、
 * 中国語のタイトルを開いたら日本語の記事だった、という一番がっかりする状態になる。
 */
export const hasZhBody = (post: BlogTextSource): boolean => filled(post.content_zh);

export interface BlogTextPick {
  /** 実際に表示している中身の言語（UIの言語ではない） */
  lang: BlogLang;
  /** 中国語で表示できているか（＝zh要求 かつ 中国語本文あり） */
  translated: boolean;
  /** 中国語UIなのに日本語本文を出している＝「日文」バッジを出す */
  showJaBadge: boolean;
  title: string;
  excerpt: string;
  content: string;
}

/**
 * 表示する本文・タイトル・抜粋を言語で選ぶ。画面はこの結果だけを見る。
 *
 * 中国語本文が無ければ**日本語のまま出す**（空にしない・隠さない）。
 * タイトル/抜粋だけは、本文が中国語のときに限って中国語版を使う
 * （本文が日本語なのにタイトルだけ中国語、という混ざり方を作らない）。
 */
export const pickBlogText = (post: BlogTextSource, lang: BlogLang): BlogTextPick => {
  const translated = lang === 'zh' && hasZhBody(post);
  if (!translated) {
    return {
      lang: 'ja',
      translated: false,
      showJaBadge: lang === 'zh',
      title: post.title,
      excerpt: post.excerpt ?? '',
      content: post.content,
    };
  }
  return {
    lang: 'zh',
    translated: true,
    showJaBadge: false,
    title: filled(post.title_zh) ? post.title_zh : post.title,
    excerpt: filled(post.excerpt_zh) ? post.excerpt_zh : (post.excerpt ?? ''),
    content: post.content_zh as string,
  };
};

/**
 * 記事URLの canonical。
 * 中国語版がある記事だけ、その言語のURLを自己参照する。無い記事は日本語版へ寄せる（従来どおり）。
 */
export const blogPostCanonical = (id: number | string, lang: BlogLang, postHasZh: boolean): string =>
  `${SITE}/${postHasZh ? lang : 'ja'}/blog/${id}`;

/**
 * 記事URLの hreflang。中国語版がある記事にだけ出す。
 * 未訳の記事は canonical が自己参照でない（/zh → /ja）ので、ここで hreflang を出すと矛盾する。
 * 返り値が null のときは1本も出さないこと。
 */
export const blogPostAlternates = (
  id: number | string,
  postHasZh: boolean,
): { ja: string; zh: string; xDefault: string } | null =>
  (postHasZh
    ? { ja: `${SITE}/ja/blog/${id}`, zh: `${SITE}/zh/blog/${id}`, xDefault: `${SITE}/ja/blog/${id}` }
    : null);
