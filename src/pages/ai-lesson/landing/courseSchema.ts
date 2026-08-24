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
import { LEGAL_FACTS } from '../../../lib/aiLesson/course/legal/legalFacts';

const SITE = 'https://kawabado.com';

/**
 * 日本語教育の主体（provider）の識別子。**バドミントン団体とは別の entity にする。**
 *
 * 【なぜ分けるか（2026-08-24 の実体衝突）】
 * ここは以前 `provider: { Organization, url: 'https://kawabado.com' }` だった。
 * その URL の Organization ノードは HomePage が
 * `@id: https://kawabado.com/#organization` / `@type: [Organization, SportsOrganization]` /
 * `sport: 'バドミントン'` として宣言している。
 * つまり検索エンジンとLLMには「**バドミントン競技団体が日本語教育コースを提供している**」と
 * 読めていた。ドメインは分けない（分けると AIコースの評価がゼロから積み直しになる）ので、
 * 構造化データの上だけで、日本語教育の主体を独立した entity として名乗る。
 *
 * 【@id の付け方】
 * `#organization` とは**別のフラグメント**にし、しかも ja/zh で同じ値にする。
 * 言語ごとに @id を変えると「同じ組織が2つある」ことになり、実体を分けたい目的に反する。
 * 基準にするのは LP の canonical / hreflang x-default と同じ /ja/ai-course。
 */
export const AI_COURSE_PROVIDER_ID = `${SITE}/ja/ai-course#provider`;

/** HomePage が宣言しているバドミントン側の Organization。**参照しない**ことを明示するために置く */
export const KAWABADO_ORGANIZATION_ID = `${SITE}/#organization`;

/**
 * Course.provider に入れる entity。事実は既に確定しているものだけを使う
 * （事業者名・窓口は legalFacts＝特商法表記と同じ値。ここで作文しない）。
 *
 * 【parentOrganization を張るかの判断 → 張らない】
 * 同じ運営者（kawabado 安田翔）である、というのは事実。ただし schema.org の
 * parentOrganization は**組織の親子関係**の主張であって、「同じ人がやっている」ではない。
 * `parentOrganization: { '@id': '.../#organization' }` と書くと、
 * 「SportsOrganization の配下組織が日本語教育をしている」という読みを機械に与える。
 * それはこの WAVE で消したかった誤読そのもので、しかも実際に法人の親子関係は存在しない。
 * 代わりに、本当に共有している事実だけを両ノードに持たせる:
 *   - legalName に特商法上の事業者名（kawabado 安田翔）
 *   - email は info@kawabado.com（HomePage 側の Organization と同じ値）
 * 同一運営者であることは、この2つと同一ドメインで十分に辿れる。
 * 法人化して実際に親子関係ができたら、そのとき parentOrganization を張ればよい。
 */
export const buildCourseProvider = () => ({
  // Organization も併記する: Course.provider を Organization 型で見る実装に対しても素直に通る
  '@type': ['Organization', 'EducationalOrganization'],
  '@id': AI_COURSE_PROVIDER_ID,
  // LPで実際に使っている名前（ja）。zh 名・別称は alternateName に入れ、
  // ノードの name は言語で振らない（同じ @id に違う name を主張しないため）
  name: '日本語の相棒',
  alternateName: ['你的日语搭档', 'AI日本語会話コース', 'AI日语会话课程'],
  // 特商法表記の事業者名。バドミントン側の Organization と同じ運営者であることの唯一の根拠
  legalName: LEGAL_FACTS.operatorName ?? undefined,
  url: `${SITE}/ja/ai-course`,
  description: 'AIとの会話練習と日本語コーチの個別レッスンで、'
    + '中国語母語話者が日本語を話せるようになるための学習サービス。',
  email: LEGAL_FACTS.contactEmail,
  knowsLanguage: ['ja', 'zh-Hans'],
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: LEGAL_FACTS.contactEmail,
    availableLanguage: ['Japanese', 'Chinese'],
    url: `${SITE}/ja/ai-course/contact`,
  },
});

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
  // バドミントン団体（#organization）ではなく、日本語教育の entity を主体にする
  provider: buildCourseProvider(),
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
