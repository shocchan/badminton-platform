/**
 * 公式SNS等のプロフィールURL（schema.org の `sameAs`）。
 *
 * 【なぜ別ファイルか】
 * 最初は HomePage.tsx に置いたが、コンポーネント以外を export すると
 * Fast Refresh が効かなくなる（eslint: react-refresh/only-export-components）。
 * SEO用のデータなので src/lib/seo/ に置くのが素直。
 *
 * 【入れてよいURL】
 * **実在が確認できたプロフィールURLだけ。** 次は入れない:
 *   - 検索結果ページ（例: x.com/search?q=... ）
 *   - 招待リンク・短縮URL
 *   - AI日本語コース側／個人のアカウント（二軸を混ぜない。実体が1つに見えなくなる）
 * 判断基準と現在の調査結果は docs/seo/brand-entity-signals.md。
 *
 * 【空のあいだの扱い】
 * 配列が空なら JSON-LD に `sameAs` キー自体を出さない。
 * 空配列を出すと「SNSを1つも持っていない」と積極的に主張することになるため。
 *
 * ⚠️ scripts/generate-worker.mjs の BRAND_SAME_AS と**同じ内容**にすること。
 *    Workerは独立ファイルなので import できない。
 *    ズレたら src/lib/seo/seoConventions.test.mjs が落ちる。
 */
export const BRAND_SAME_AS: string[] = [
  // 2026-08-30 追加。@show_eigyouhack（営業ハック時代）から改名した公式アカウント。
  // 表示名「カワバド｜川口・蕨バドミントン」・website は kawabado.com/ja/ で、
  // このサイトと同じ実体であることを名乗れる状態になったので sameAs に入れた。
  'https://x.com/kawabado',
];
