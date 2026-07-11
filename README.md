# 🏸 川口・蕨バド交流杯

川口・蕨エリアのバドミントン大会プラットフォーム（大会案内 + 申し込み + ブログ）

## 機能
- 🎫 大会案内ページ（開催予定の大会一覧表示）
- 📝 申し込みフォーム（Supabase自動保存）
- 💳 事前支払い機能（クレジットカード〔Stripe〕・銀行振込・PayPay対応）
- 📧 自動メール送信（支払い案内）
- 📰 ブログページ（大会結果・レポート）
- 🔧 管理画面（大会・ブログCRUD、エントリー確認）

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

## Stripe クレジット決済の設定

クレジット決済は **キー未設定の間は選択肢が表示されない**（PayPay/銀行振込のみで動作する）。有効化する手順:

1. [Stripe ダッシュボード](https://dashboard.stripe.com/apikeys) で公開可能キー（`pk_...`）とシークレットキー（`sk_...`）を取得
2. フロント: `.env` に `VITE_STRIPE_PUBLISHABLE_KEY=pk_...` を設定して再ビルド
3. バックエンド: Edge Functions にシークレットキーを設定
   ```bash
   supabase secrets set STRIPE_SECRET_KEY=sk_... --project-ref <project-ref>
   ```
4. Edge Functions をデプロイ
   ```bash
   supabase functions deploy create-payment-intent --project-ref <project-ref>
   supabase functions deploy confirm-payment --project-ref <project-ref>
   supabase functions deploy send-payment-email --project-ref <project-ref>
   ```
5. マイグレーション `supabase/migrations/20260711_add_payment_columns.sql` を実行（entries に payment_method / payment_status / stripe_payment_id / paid_at を追加）

### 決済金額

参加費 + 決済手数料3.6%（四捨五入）。例: ¥3,000 → 手数料 ¥108 → 合計 **¥3,108**。金額は `create-payment-intent` がサーバー側で計算する（クライアントの申告値は使わない）。

### テスト決済（Test Mode キー使用時）

- カード番号: `4242 4242 4242 4242`（成功） / `4000 0000 0000 0002`(拒否)
- 有効期限: 任意の未来の月/年、CVC: 任意の3桁
- 決済フロー: 申し込み → 支払い方法選択 → カード入力 → 完了画面（領収書DL）＋完了メール

### キャンセル・返金（クレジット決済分）

Stripe ダッシュボードから該当 PaymentIntent を refund し、entries テーブルの該当行を手動更新する（自動返金は未実装）。

## デプロイ（Cloudflare Pages）

**必ずステージング → CEO確認 → 本番の順で反映する。本番（kawabado.com）への直接デプロイは禁止。**

```bash
# 1. ステージングへ（CEO確認用、kawabado.com には影響しない）
./scripts/deploy-staging.sh
# → https://staging.badminton-platform.pages.dev

# 2. ステージングでCEOがOKを出したら本番へ
./scripts/deploy-production.sh
# → https://kawabado.com
```

- ステージングURLは非公開（リンクを知っている人のみ・検索エンジンにも載らない）
- DB・メールは本番と共通。申し込みテストは `visibility='unlisted'` の【テスト】大会を作って行い、終わったらテスト大会とエントリーを削除する（メール送信も実際に動くので送信テストができる）
