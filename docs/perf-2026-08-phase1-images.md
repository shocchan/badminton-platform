# 表示速度改善 Phase 1: 画像最適化（2026-08-06）

Cloudflare Web Analytics の実測悪化（LCP P99 9.2s、画像最大18.6s）を受けた画像最適化。
有料プラン（Cloudflare Polish / Supabase 画像変換）は使わず、**事前生成方式**で対応した。

## 実装内容

| 領域 | 対応 |
|---|---|
| 静的画像（public/） | `scripts/optimize-static-images.mjs` でWebP変種を事前生成（表示CSS幅×2上限）。ヒーロー・会場写真・アイコン類・結果表 |
| ヒーローLCP | `<picture>` srcset化（768/1280/1376w）＋ Worker がトップ系URL（`/` `/ja/` `/zh/`）のHTMLに `<link rel=preload imagesrcset>` を注入 |
| ブログ画像（Supabase Storage） | アップロード時にクライアント側で WebP 3変種（480/960/1600w）生成（`src/lib/blogImages.ts`）。既存64枚は `scripts/migrate-blog-images.mjs` で一括生成済み。**DBは書き換えず**URL命名規約 `{base}_w{width}.webp` で表示側が導出。変種404時は `error` イベントで原本にフォールバック |
| ブログ詳細LCP | Worker のOGP注入パスでカバー画像のpreloadをHTMLに注入。本文内 `<img>` は表示時に lazy/decoding/srcset を付与（`enhanceBlogContentHtml`） |
| 寸法明示 | 全対応画像に `width`/`height` を付与（CLS対策・Phase 2の先行分） |
| キャッシュ | `public/_headers` で画像に30日キャッシュ。Storage変種は `cacheControl: 31536000` |
| 接続 | `index.html` に Supabase への preconnect |

## 計測（Lighthouse モバイル・低速4Gスロットリング）

Before = 本番 kawabado.com / After = staging.badminton-platform.pages.dev（2026-08-06）

| ページ | スコア | LCP | 総転送量 |
|---|---|---|---|
| /ja/ | 39 → **68** | 9.3s → **5.1s** | 1,095KB → **589KB** |
| /ja/activity | 52 → **77** | 9.8s → **4.9s** | 1,515KB → **675KB** |
| /ja/blog/9 | 41 → **62** | 13.4s → **5.2s** | 3,181KB → **813KB** |

※ 低速4G条件の数値（実ユーザーのP95相当）。フィールド値（CWA）は反映まで約1ヶ月。

主なファイルサイズ変化:

- `hero.jpg`（フォールバック）: 1,962KB → 101KB。WebP変種はモバイル 36KB
- `venues/shibaen-kouminkan.jpg` 500KB → 変種 29〜86KB（通常活動一覧のLCP 18.6s の主犯）
- `icons/` 景品PNG 6枚 計6.5MB → 64px WebP 計約5KB
- `icons/shuttle-icon.png` 119KB → 3KB（トップページ常駐）
- ブログ /ja/blog/9 の画像合計 約2.5MB → 221KB（全て `_w960.webp` 選択時）
- 副次効果: 本文内のHEIC画像1枚（Chrome表示不可だった）が変種WebPで表示可能に

## 運用ルール

1. **public/ の画像を差し替えるときはファイル名を変える**（30日キャッシュのため）。新画像は `scripts/optimize-static-images.mjs` の TARGETS に追加して再実行
2. srcset/sizes を変えるときは **`generate-worker.mjs` のpreload注入と表示側（HomePage / BlogDetailPage）を必ず一致させる**（不一致だと二重ダウンロード）
3. ブログ画像の命名規約 `{base}_w{480|960|1600}.webp` は `src/lib/blogImages.ts` と `scripts/migrate-blog-images.mjs` の2箇所で共有
4. Pages preview 環境に `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を追加済み（2026-08-06）。これによりステージングでもOGP注入・preloadが本番と同挙動

## 本番反映（2026-08-06）

CEO承認のうえ同日昼に本番反映（CEOが `deploy-production.sh` を実行、AIはdenyルールにより実行不可）。反映後の本番検証:

- ヒーローpreload・ブログカバーpreload・OGP注入: 動作確認済み
- kawabado.com配下の画像: 30日キャッシュ確認済み / Storage変種: 1年キャッシュ＋CDN HIT確認済み
- Lighthouse（本番・モバイル低速4G）: /ja/ LCP 9.3s→**7.9s**（931KB）、/ja/blog/9 LCP 13.4s→**7.6s**（3,181KB→**1,157KB**、画像は全て_w960変種で計222KB）
- 本番のラボ値がステージング（5.1s/5.2s）より重いのは、本番のみGA4＋Metaピクセル（約230KB＋実行コスト）が入るため。**画像起因のボトルネックは解消済み**で、残りはJSバンドル＋計測タグ（スコープ外、必要ならPhase 3以降で検討）
- フィールド値（CWA Core Web Vitals）は2026-09上旬に再確認する

## 未実施（Phase 2 以降）

- CLS対策本体: ルート遅延読込の `PageLoader`（min-h-[60vh]）とスケルトンの高さ確保によるフッター飛び対策
- ShuttleCounter のマイルストーン行の高さ確保
- ブログ本文画像の height 未確定によるシフト（マイグレーションで寸法記録が必要になるため見送り）
