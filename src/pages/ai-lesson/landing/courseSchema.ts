// AIコースの Course 構造化データを組み立てる（2026-08-24 切り出し）。
//
// 【なぜ純関数にするか】
// ここに書いた価格は Google の検索結果と、ChatGPT・Claude 等の回答に出る。
// カタログの価格を変えたのに schema が古いままだと、
// **利用者は古い値段を見て問い合わせてくる**。サイト本文より気づきにくい嘘になる。
// JSXの中に埋めたままだと機械で確かめにくいので、値を作る部分だけ外に出す。
//
// 原則: **数値をここに書かない。** すべて planCatalog から読む。
import { publishedPlans } from '../../../lib/aiLesson/course/plans/planCatalog';

const SITE = 'https://kawabado.com';

export interface CourseSchemaInput {
  lang: 'ja' | 'zh';
  /** ページの <title> と揃える（別々に作ると食い違う） */
  name: string;
  description: string;
}

/**
 * 販売中のプランを Offer にする。
 * 金額が確定していないプラン（priceJpy が null）は**載せない**＝存在しない値段を出さない。
 * 表示ラベルが「税込」なので valueAddedTaxIncluded を明示する。
 */
export const buildCourseOffers = (lang: 'ja' | 'zh') =>
  publishedPlans()
    .filter((p) => typeof p.priceJpy === 'number' && p.priceJpy > 0)
    .map((p) => ({
      '@type': 'Offer',
      name: lang === 'zh' ? p.nameZh : p.nameJa,
      price: p.priceJpy as number,
      priceCurrency: 'JPY',
      priceSpecification: {
        '@type': 'PriceSpecification',
        price: p.priceJpy as number,
        priceCurrency: 'JPY',
        valueAddedTaxIncluded: true,
      },
      availability: 'https://schema.org/InStock',
      // 決済まで自分で進めるのか、相談が要るのかを区別する（伴走コースは相談経由）
      category: p.ctaMode === 'consult' ? 'Consultation required' : 'Online purchase',
      url: `${SITE}/${lang}/ai-course#price`,
    }));

export const buildCourseSchema = ({ lang, name, description }: CourseSchemaInput) => ({
  '@context': 'https://schema.org',
  '@type': 'Course',
  name,
  description,
  provider: { '@type': 'Organization', name: 'kawabado', url: SITE },
  inLanguage: lang === 'ja' ? 'ja' : 'zh-Hans',
  // Google の Course リッチリザルトは hasCourseInstance が無いと対象にならない。
  // 実態（オンライン・随時開始）とズレない範囲だけ書く
  hasCourseInstance: {
    '@type': 'CourseInstance',
    courseMode: 'online',
    courseWorkload: 'PT20M',
    inLanguage: lang === 'ja' ? 'ja' : 'zh-Hans',
  },
  offers: buildCourseOffers(lang),
});
