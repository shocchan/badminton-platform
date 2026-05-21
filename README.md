# 🏸 バドミントン大会プラットフォーム

スピバド型のシンプルな大会案内 + 申し込み + ブログサイト

## 機能
- 大会案内ページ（月次）
- 申し込みフォーム（Supabase保存）
- ブログページ（大会結果）
- 管理画面（大会・ブログCRUD、エントリー確認）

## 技術スタック
- React 18 + TypeScript
- Tailwind CSS v4
- Supabase（PostgreSQL + Auth）
- Vite
- Cloudflare Pages（ホスティング）

## セットアップ

```bash
npm install
cp .env.example .env
# .env に Supabase の URL と API キーを設定
npm run dev
```

## Supabase SQL

Supabase ダッシュボードで `supabase/schema.sql` を実行してテーブルを作成してください。

## デプロイ（Cloudflare Pages）

1. GitHub に push
2. Cloudflare Pages > Create > GitHub で接続
3. 環境変数を設定（VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY）
4. 自動デプロイ開始
