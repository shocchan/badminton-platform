# SEO / メタタグ アーキテクチャ（責任範囲）

kawabado.com の `<head>` メタ情報は **3層** で管理している。各層の責任範囲を混同すると
「meta の重複」「canonical が2件」「JSON-LD の二重出力」といった不具合が再発するため、
変更時は必ず本ドキュメントの責任分担に従うこと。

React 19 はネイティブで `<title>/<meta>/<link>` を巻き上げる（hoist）ようになったが、
本プロジェクトでは `react-helmet-async` を **JSON-LD 専用** に縮退させ、通常の meta は
Worker 注入 + `usePageMeta` の in-place 更新で扱う「暫定ブリッジ」構成を採用している。
将来的に helmet を完全撤去して React 19 ネイティブへ移行するのは Phase 2+ の負債として残している
（本コミット時点では撤去しない）。

---

## 3層の責任範囲

### 1. Cloudflare Worker（`scripts/generate-worker.mjs`）— 初期HTMLの真実
- **対象**: JS を実行しないクローラー（Googlebot の初回フェッチ含む）と全ページの初期レスポンス。
- **責務**:
  - 静的ページ: `STATIC_PAGES` 定数から title / description / OGP / Twitter / canonical / hreflang / `<html lang>` を注入。
  - 動的ページ (`tournaments/:id`, `activity/:id`, `blog/:id`): Supabase から取得して meta を組み立て注入。
  - 旧URL → 正規URL の **真の 301**（`computeLegacyRedirect`）。
  - `/zh/blog` の `X-Robots-Tag: noindex, follow`、`sitemap.xml` 生成、ID系ページの hard 404。
- **不変条件**: `upsertMeta` / `upsertCanonical` / `replaceHreflangs` は「1件だけに保つ（既存を置換、無ければ挿入）」。
  → canonical は常に **ちょうど1件**、同一 name/property の meta は1件。

### 2. `usePageMeta` フック（`src/hooks/usePageMeta.ts`）— SPA遷移時の in-place 更新
- **対象**: 初回ロード後の **クライアント側ルート遷移**（フルリロードなし）。
- **責務**: 既存の head タグを **その場で書き換える**（無ければ1個だけ挿入）。hreflang は毎遷移で全消去→再構築し、
  前ページの残骸を持ち越さない。
- **注意**: helmet の重複排除に依存しない。React 19 のネイティブ巻き上げと競合しないよう、
  「重複を作らず既存を再利用」する実装を厳守する。
- **静的ページ**は `useStaticPageMeta`（`getStaticPageMeta(pathname)` のラッパ）を呼ぶだけ。
  動的ページは各コンポーネント内で `PageMeta` を組み立てて `usePageMeta(meta)` に渡す。
- **同期義務**: `src/lib/pageMeta.ts` の `STATIC_PAGES` と Worker 側 `STATIC_PAGES` は
  同じ内容を保つ（Worker は TS を import できないため二重管理）。片方だけ変更しないこと。

### 3. `react-helmet-async`（`<Helmet>`）— JSON-LD 専用（それ以外禁止）
- **対象**: 構造化データ（JSON-LD）**のみ**。
- **責務**: `Organization` / `WebSite` / `FAQPage` / `BreadcrumbList` / `SportsEvent` / `BlogPosting` /
  `CollectionPage` 等の `<script type="application/ld+json">` を出力する。
- **禁止**: `<Helmet>` 内に `<title>` / `<meta>` / `<link rel="canonical">` / hreflang を **書かない**。
  これらは層1・層2の責務。helmet で meta を出すと React 19 の巻き上げと二重化する（Phase 1.5 の不具合の原因）。

---

## 変更時チェックリスト
1. 静的ページの文言変更 → `src/lib/pageMeta.ts` と `scripts/generate-worker.mjs` の **両方** を更新。
2. 新しい静的ページ → 上記2箇所 + `sitemap.xml`（`generateSitemap`）+ 内部リンク。
3. 新しい動的ページ種別 → Worker の `buildDynamicMeta` / `extractIdCheck` にルートを追加。
4. `<Helmet>` を触るときは JSON-LD 以外を入れていないか確認。
5. コミット前に `node scripts/verify-worker-seo.mjs`（要 `npm run build`）で
   canonical 1件・301・noindex を自動検証する。
