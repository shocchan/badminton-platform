# ブランドの実体信号（sameAs）— 2026-08-30 更新

構造化データの `sameAs` は「この団体は他のどこに存在するか」を検索エンジンとAIに伝える。
**実体を裏づける信号としては最も強い部類**で、いま kawabado.com が持っていない最大のものがこれ。

このファイルは「なぜまだ空なのか」と「URLが手に入ったら何をすればよいか」の記録。

## 現状：X を1本だけ名乗っている（2026-08-30〜）

| プラットフォーム | URL | 入れた日 |
|---|---|---|
| X | `https://x.com/kawabado` | 2026-08-30 |

**旧ハンドル `@show_eigyouhack` は書かない。** Xは改名しても旧ハンドルをリダイレクトせず、
第三者が取得できる。古い方を残すと「他人のアカウントを自社として名乗る」状態になる。
`seoConventions.test.mjs` が旧ハンドルの混入を検出する。

## 受け口の仕組み

コード側の受け口は用意済み。`BRAND_SAME_AS` にURLを足すだけで出るようになっている。

| 場所 | 変数 |
|---|---|
| 画面（Google が見る側） | `src/lib/seo/brandSameAs.ts` の `BRAND_SAME_AS` |
| 素のHTML（JSを実行しないクローラーが見る側） | `scripts/generate-worker.mjs` の `BRAND_SAME_AS` |

**2つある。片方だけ足すと、素のHTMLとJS実行後で名乗る実体が変わる。**
`src/lib/seo/seoConventions.test.mjs` が本数の一致を見ているので、片方だけ直すとテストが落ちる。

配列が空のあいだは `sameAs` キー自体を出さない。空配列を出すと「SNSは1つも持っていない」と
積極的に主張することになるため。

## リポジトリ全体を調べた結果（2026-08-29）

`src/` `public/` `docs/` `scripts/` `supabase/` `index.html` と `.env` 系を横断検索した。

| プラットフォーム | 見つかったもの | `sameAs` に使えるか |
|---|---|---|
| X / Twitter | `src/pages/HomePage.tsx` の `https://x.com/search?q=川口蕨バド` | ❌ **検索結果ページであってプロフィールではない** |
| 小紅書 | `attribution.test.ts` のテスト用ダミーURL | ❌ テストの固定値 |
| WeChat | `lpContent.ts` の WeChat ID `Shocchance` | ❌ IDであってURLではない。かつAI日本語コース側の窓口 |
| YouTube | 記事埋め込み用の `youtube.com/embed/...` と管理画面のプレースホルダ | ❌ 自社チャンネルではない |
| Facebook | CSP の許可ドメイン（Metaピクセル用） | ❌ 計測ドメイン |
| Instagram / note / ココナラ / TikTok / 微博 / LINE | 0件 | — |
| 環境変数 | SNS関連のキーなし（Supabase / GA4 / Metaピクセル / Stripe のみ） | — |

**2026-08-29 時点の結論：安全に使える実URLは1本も無かった。**
→ 2026-08-30、CEOが @show_eigyouhack を **@kawabado** へ改名しプロフィールを
kawabado 一本に統一したため、この1本だけを sameAs に入れた。

### ついでに見つかった別の問題

トップページの「開催予定の大会はありません」状態のとき、
「LINEやXでお知らせをお待ちください！」と書いて **X の検索結果ページ**へリンクしている
（`src/pages/HomePage.tsx`）。公式アカウントが無いので検索結果に送るしかない状態。
利用者から見ると「フォロー先が無い」ので、ここは公式アカウントができたら差し替えたい。

## CEOから公式URLをもらったらやること

1. **URLが本物か確認する。** プロフィールのURL（`https://x.com/<ユーザー名>` の形）であること。
   検索結果・招待リンク・短縮URLは入れない。`seoConventions.test.mjs` が形を見ている。
2. 下の表を埋める。
3. `src/lib/seo/brandSameAs.ts` と `scripts/generate-worker.mjs` の **両方の** `BRAND_SAME_AS` に足す。
4. `npm run build` → `npx vitest run src/lib/seo` で確認 → staging → CEO確認 → 本番。

### 記入欄（CEO提供待ち）

| プラットフォーム | 公式URL | 提供日 | 備考 |
|---|---|---|---|
| X（旧Twitter） | ✅ https://x.com/kawabado | 2026-08-30 | トップの検索結果リンク差し替えは未対応 |
| 小紅書（RED） | | | 軸1の主戦場。あれば最優先 |
| WeChat 公式アカウント | | | 個人IDではなく公式アカウントのURL |
| Instagram | | | |
| YouTube | | | |
| その他 | | | |

**注意：ここに書いてよいのは「kawabado（川口・蕨バドミントン交流会）としての」アカウントだけ。**
AI日本語コース側のアカウントや、しょっちゃん個人のアカウントを混ぜると、
検索エンジンから見て実体が1つに見えなくなる（二軸を混ぜない、の構造化データ版）。

関連: `docs/seo/search-visibility-2026-08.md`（実測ベースライン）
