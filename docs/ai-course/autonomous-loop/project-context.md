# プロジェクトコンテキスト（自律ループ引き継ぎ用）

## プロダクト

成人中国語母語者向けAI日本語伴走学習プラットフォーム（kawabado / 翔子先生とAI日本語会話コース）。
半年伴走コース（¥100,000）の中核体験。現在は labPreview（CEOのshoアカウント）限定で
語彙・診断・レビュー機能を開発中。一般受講生（Andyさん）には既存の60ミッション体験のみ公開。

## 教育設計

- 24週カリキュラム・週次ミッション（Realtime AI会話＋テキスト会話）
- ことば図鑑: 140語（基礎78＋N3準備62）・全draft。多義語Sense・cognate分類
  （transparent_same/mostly_same/partial_overlap/false_friend/japanese_specific/no_cognate/unreviewed）
- 診断: 次元別（reading/meaning/usage/collocation/particle/conjugation）・基礎13問・N3 16問（probe5含む）
- 診断1回の正解で「習得済み」にしない。復習は忘却を前提に再表示
- 中国語母語者向け: 漢字の透過性を利用しつつfalse friendを重点警告。例文はふりがな（ruby）付き

## 技術構成

- React + Vite(rolldown) + Tailwind v4 + TS + Supabase（共有・変更禁止）・Cloudflare Pages
- deploy: `bash scripts/deploy-staging.sh`（本番はCEOのみ）。staging: https://staging.badminton-platform.pages.dev
- テスト: vitest（現在577件）。lint: `eslint .` ベースライン45E/6W=51（増分0厳守）
- bundle予算: main 590.30KB/gzip 169.96KBを基準に大幅増加禁止。レビュー系データはlazy chunkのみ
- 教材データ: src/lib/aiLesson/course/（foundationUnit1/ItemBank/VocabBank/VocabN3・
  vocabularyLevelMeta・vocabContentMeta・vocabFurigana・vocabRelations・visualAssetManifest）
- 二重AIレビュー: vocabDualReview.ts＋vocabChatgptReview.ts（140語・レビュー画面lazy chunk専用）
- レビュー画面: labPreview限定・localStorage v2永続化・P0-P3/AI一致・不一致フィルター

## labPreviewと一般利用者の違い

- labPreview: admin_overrides.labPreview===true のみ。ことば図鑑・レビュー画面・診断・モバイルナビ案A
- 一般利用者: 従来ナビ5項目・labチャンク非ロード・レビューURLへ来ても安全にホームへ
- 教材・画像はすべて draft・labPreview限定。学習者進捗と教材レビューは完全分離

## 重要な既存仕様

- XHS（小紅書）はAI操作禁止（全社ルール）
- AIレビューは human_reviewed/approved に昇格させない（人間のみ）
- 数値はコードから導出（dualReviewSummary等の単一関数）・手計算禁止
- draft教材の変更は許可、既存60ミッション・N2/N3本文・PREP本文・Realtime promptは変更禁止
