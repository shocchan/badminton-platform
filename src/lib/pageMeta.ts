// Phase 1.5: Page-specific SEO meta for kawabado.com.
//
// このファイルは React 側と Worker 側の両方で使う静的ページの meta を集約する。
// Worker 側 (scripts/generate-worker.mjs) は同じ内容を JS 定数として保持している
// （TS を Node で直接importできない制約のため）。
// 内容を変更する場合は必ず両方を同期させること。
//
// 動的ページ (tournaments/:id, activity/:id, blog/:id) は DB から meta を生成する
// ため、ここには含めない。それらは Worker が Supabase から取得し、React 側は
// 各ページコンポーネント内で個別に usePageMeta へ渡す。

export type PageLang = 'ja' | 'zh';
export type HtmlLang = 'ja' | 'zh-CN';
export type OgLocale = 'ja_JP' | 'zh_CN';

export interface HreflangEntry {
  hreflang: string;
  href: string;
}

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  hreflang: HreflangEntry[]; // 空配列なら hreflang を出さない
  ogType: 'website' | 'article';
  ogTitle?: string;          // 省略時は title
  ogDescription?: string;    // 省略時は description
  ogUrl?: string;            // 省略時は canonical
  ogImage: string;
  ogLocale: OgLocale;
  twitterCard: 'summary' | 'summary_large_image';
  twitterTitle?: string;     // 省略時は title
  twitterDescription?: string; // 省略時は description
  twitterImage?: string;     // 省略時は ogImage
  htmlLang: HtmlLang;
}

export const SITE_ORIGIN = 'https://kawabado.com';
export const DEFAULT_OGP = `${SITE_ORIGIN}/ogp.jpg`;
export const SITE_BRAND_JA = '川口・蕨バドミントン交流会（kawabado）';
export const SITE_BRAND_ZH = '川口・蕨羽毛球交流会（kawabado）';

// hreflang をペアで返すヘルパー
export function bilingualHreflang(pathAfterLang: string): HreflangEntry[] {
  return [
    { hreflang: 'ja', href: `${SITE_ORIGIN}/ja${pathAfterLang}` },
    { hreflang: 'zh-CN', href: `${SITE_ORIGIN}/zh${pathAfterLang}` },
    { hreflang: 'x-default', href: `${SITE_ORIGIN}/ja${pathAfterLang}` },
  ];
}

interface StaticEntry {
  path: string;              // '/ja/', '/zh/faq' 等
  title: string;
  description: string;
  ogType?: 'website' | 'article';
  ogImage?: string;
  bilingual: boolean;        // false のときは hreflang を出さない
}

// 静的ページ用の meta 集。ページ固有・言語別に定義。
// path はサイトルート起点のフル URL パス（先頭 /、末尾 / はホーム以外なし）。
const STATIC_PAGES: StaticEntry[] = [
  // ── トップ ──
  { path: '/ja/', title: `川口・蕨バドミントン交流会 | 平日夜バドミントン大会 川口・蕨`,
    description: '川口市・蕨市エリアの平日夜バドミントン交流会。超初級〜オープンまで全レベル歓迎。4試合以上保証。芝園公民館・蕨市民体育館ほかで定期開催。',
    bilingual: true },
  { path: '/zh/', title: '川口・蕨羽毛球交流会 | 平日夜间羽毛球活动 川口・蕨',
    description: '埼玉县川口市・蕨市地区的平日夜间羽毛球交流活动。从超初级到高水平全级别欢迎参加。保证4场以上比赛。',
    bilingual: true },
  // ── 通常活動一覧 ──
  { path: '/ja/activity', title: '通常活動 一覧 | 川口・蕨バドミントン交流会',
    description: '川口市・蕨市の公民館で開催するバドミントン通常活動の一覧。芝園公民館・幸栄公民館など。参加費600円〜。',
    bilingual: true },
  { path: '/zh/activity', title: '常规活动列表 | 川口・蕨羽毛球交流会',
    description: '在川口市・蕨市公民馆举办的羽毛球常规活动列表。参加费600日元起。',
    bilingual: true },
  // ── ブログ一覧（Case C: ja のみ）──
  { path: '/ja/blog', title: `ブログ・開催レポート | ${SITE_BRAND_JA}`,
    description: '川口・蕨エリアで開催しているバドミントン大会・通常活動のレポート、参加者の声、運営からのお知らせをまとめたブログ。',
    bilingual: false },
  // 中国語ブログ一覧: 記事本文は日本語のため noindex 相当（Worker が X-Robots-Tag を付与）。
  // hreflang は出さず、sitemap にも含めない。self-canonical のみ。
  { path: '/zh/blog', title: `博客・活动报道 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会的比赛・日常活动报道。※ 博客文章目前均以日语撰写。',
    bilingual: false },
  // ── FAQ ──
  { path: '/ja/faq', title: `よくある質問（FAQ）| ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会のFAQ。参加方法、レベルの目安、キャンセル、持ち物、会場、初参加・一人参加、外国人参加者への対応などを掲載。',
    bilingual: true },
  { path: '/zh/faq', title: `常见问题（FAQ）| ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会的常见问题。参加方式、级别参考、取消、携带物品、场馆、首次参加・单独参加、外国人参加者的对应等。',
    bilingual: true },
  // ── 会場ガイド ──
  { path: '/ja/venues', title: `会場一覧・アクセス | ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会で使用している会場（芝園公民館、蕨市民体育館ほか）のアクセス・設備・利用ルールをまとめました。',
    bilingual: true },
  { path: '/zh/venues', title: `场馆一览・交通 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会使用的场馆（芝园公民馆、蕨市民体育馆等）的交通・设施・使用规则汇总。',
    bilingual: true },
  // ── レベルガイド ──
  { path: '/ja/level-guide', title: `参加レベルの目安 | ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会の参加レベル（超初級・初級・中級・上級・オープン）の目安と、自分に合ったクラスの選び方を解説します。',
    bilingual: true },
  { path: '/zh/level-guide', title: `参加级别参考 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会各级别（超初级・初级・中级・高级・公开）的参考标准和适合自己的班次选择方法。',
    bilingual: true },
  // ── ゲームページ ──
  { path: '/ja/game', title: `バド対決ゲーム | ${SITE_BRAND_JA}`,
    description: 'AIとバドミントンのラリー対決！タイミングよく打ち返してハイスコアを目指そう。15ラリーごとに抽選が回って、ごくまれに無料券が当たる！',
    bilingual: true },
  { path: '/zh/game', title: `羽毛球对决游戏 | ${SITE_BRAND_ZH}`,
    description: '与AI进行羽毛球对拉！掌握时机打出高分。每15次对拉自动参与抽奖，有极小概率获得免费参加券。',
    bilingual: true },
  // ── 大会一覧（ディスカバリー）──
  { path: '/ja/tournaments', title: `バドミントン大会一覧（川口・蕨・埼玉） | ${SITE_BRAND_JA}`,
    description: '川口市・蕨市を中心に埼玉で開催するバドミントン交流大会の一覧。シングルス・ダブルス・ミックスダブルスをレベル別に開催、1人参加・初参加歓迎。募集中の大会はこのページから申し込めます。',
    bilingual: true },
  { path: '/zh/tournaments', title: `羽毛球比赛一览（川口・蕨・埼玉） | ${SITE_BRAND_ZH}`,
    description: '以埼玉县川口市・蕨市为中心举办的羽毛球交流比赛一览。单打・双打・混合双打按级别举办，欢迎单独参加・首次参加。正在报名中的比赛可在本页面报名。',
    bilingual: true },
  // ── 大会ギャラリー ──
  { path: '/ja/tournaments/gallery', title: `過去大会ギャラリー | ${SITE_BRAND_JA}`,
    description: '川口・蕨バド交流杯 過去大会の集合写真ギャラリー。会場の雰囲気や参加者の様子をご覧いただけます。',
    bilingual: true },
  { path: '/zh/tournaments/gallery', title: `往届比赛画廊 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流杯 往届比赛的集体照画廊。可以看到场馆的氛围和参加者的样子。',
    bilingual: true },
  // ── 会員登録案内 ──
  { path: '/ja/join', title: `会員登録のご案内 | ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会の会員登録ページ。会員特典・登録方法・注意事項を掲載しています。',
    bilingual: true },
  { path: '/zh/join', title: `会员注册指南 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会的会员注册页面。会员福利・注册方法・注意事项。',
    bilingual: true },
  // ── お問い合わせ ──
  { path: '/ja/contact', title: `お問い合わせ | ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会へのお問い合わせフォーム。参加相談、団体様からのご相談、その他ご質問をお受けします。',
    bilingual: true },
  { path: '/zh/contact', title: `咨询表单 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会的咨询表单。参加咨询、团体咨询、其他问题欢迎联系。',
    bilingual: true },
  // ── キャンセルポリシー ──
  { path: '/ja/cancel-policy', title: `キャンセルポリシー・参加ルール | ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会のキャンセルポリシーと参加ルール（大会・通常活動）。',
    bilingual: true },
  { path: '/zh/cancel-policy', title: `取消政策・参赛规则 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会的取消政策和参加规则（比赛・日常活动）。',
    bilingual: true },
  // ── プライバシー ──
  { path: '/ja/privacy-policy', title: `プライバシーポリシー | ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会のプライバシーポリシー。取得情報・利用目的・第三者提供・お問い合わせ窓口。',
    bilingual: true },
  { path: '/zh/privacy-policy', title: `隐私政策 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会的隐私政策。收集的信息・使用目的・向第三方提供・咨询窗口。',
    bilingual: true },
  // ── 特商法 ──
  { path: '/ja/tokushoho', title: `特定商取引法に基づく表記 | ${SITE_BRAND_JA}`,
    description: '川口・蕨バドミントン交流会の特定商取引法に基づく表記。',
    bilingual: true },
  { path: '/zh/tokushoho', title: `特定商业交易法标示 | ${SITE_BRAND_ZH}`,
    description: '川口・蕨羽毛球交流会 基于特定商业交易法的标示。',
    bilingual: true },
  // ── シャトルロードマップ ──
  { path: '/ja/shuttle-roadmap', title: `シャトルロードマップ | ${SITE_BRAND_JA}`,
    description: 'コートで役目を終えたシャトルたちが、コミュニティの中で作品として生まれ変わるロードマップ。節目達成ごとに景品として会員へお届けします。',
    bilingual: true },
  { path: '/zh/shuttle-roadmap', title: `羽毛球路线图 | ${SITE_BRAND_ZH}`,
    description: '在球场上完成使命的羽毛球，将在社群中作为作品重生。每达到里程碑，作品会作为奖品送给会员。',
    bilingual: true },
  // ── 大会結果 Vol.1〜3 ──
  { path: '/ja/results/vol1', title: `第1回 川口・蕨バド交流大会 結果 | ${SITE_BRAND_JA}`,
    description: '第1回川口・蕨バド交流大会 シングルス夜の部（2026年6月18日）の結果・総当たり戦成績表・最終順位。',
    bilingual: true },
  { path: '/zh/results/vol1', title: `第1届 川口・蕨羽毛球交流大会 结果 | ${SITE_BRAND_ZH}`,
    description: '第1届川口・蕨羽毛球交流大会 单打夜场（2026年6月18日）比赛结果・循环赛成绩表・最终排名。',
    bilingual: true },
  { path: '/ja/results/vol2', title: `第2回 川口・蕨バド交流大会 結果 | ${SITE_BRAND_JA}`,
    description: '第2回川口・蕨バド交流大会の結果・成績表・最終順位。',
    bilingual: true },
  { path: '/zh/results/vol2', title: `第2届 川口・蕨羽毛球交流大会 结果 | ${SITE_BRAND_ZH}`,
    description: '第2届川口・蕨羽毛球交流大会的比赛结果・成绩表・最终排名。',
    bilingual: true },
  { path: '/ja/results/vol3', title: `第3回 川口・蕨バド交流大会 結果 | ${SITE_BRAND_JA}`,
    description: '第3回川口・蕨バド交流大会の結果・成績表・最終順位。',
    bilingual: true },
  { path: '/zh/results/vol3', title: `第3届 川口・蕨羽毛球交流大会 结果 | ${SITE_BRAND_ZH}`,
    description: '第3届川口・蕨羽毛球交流大会的比赛结果・成绩表・最终排名。',
    bilingual: true },
];

const langOf = (path: string): PageLang =>
  path.startsWith('/zh/') || path === '/zh/' ? 'zh' : 'ja';

function pathAfterLang(path: string): string {
  // '/ja/faq' → '/faq'、'/ja/' → '/'、'/zh/results/vol1' → '/results/vol1'
  return path.replace(/^\/(?:ja|zh)/, '') || '/';
}

// 静的ページの meta を返す。該当なしなら null。
export function getStaticPageMeta(path: string): PageMeta | null {
  const entry = STATIC_PAGES.find((e) => e.path === path);
  if (!entry) return null;
  const lang = langOf(entry.path);
  const htmlLang: HtmlLang = lang === 'zh' ? 'zh-CN' : 'ja';
  const ogLocale: OgLocale = lang === 'zh' ? 'zh_CN' : 'ja_JP';
  const canonical = `${SITE_ORIGIN}${entry.path}`;
  return {
    title: entry.title,
    description: entry.description,
    canonical,
    hreflang: entry.bilingual ? bilingualHreflang(pathAfterLang(entry.path)) : [],
    ogType: entry.ogType ?? 'website',
    ogImage: entry.ogImage ?? DEFAULT_OGP,
    ogLocale,
    ogUrl: canonical,
    twitterCard: 'summary_large_image',
    htmlLang,
  };
}
