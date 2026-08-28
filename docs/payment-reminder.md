# 入金管理と自動督促（2026-07-30 実装）

未入金者への督促を自動化し、入金確認は管理ページのワンクリックで済ませるための仕組み。

## 全体の流れ

```
申し込み
  └ 支払い方法を選択（クレジット / PayPay / 銀行振込）
      ├ クレジット  → Stripeで即時決済 → payment_status='completed'（督促の対象外）
      └ PayPay/振込 → payment_status='pending' のまま
            ↓
      管理者に通知メール（★支払い方法が件名と本文に出る）
            ↓
      毎日10:00（JST）pg_cron → Edge Function `payment-reminder`
            ├ 期限3日前  → リマインド
            ├ 期限当日   → 本日が期限です
            ├ 期限1〜2日超過 → 督促
            └ 期限3日超過 → 最終督促 ＋ 管理者に「要対応」通知（自動キャンセルはしない）
            ↓
      入金を確認したら 管理ページ → エントリー一覧 → 「入金確認」ボタン
            → payment_status='completed', paid_at=now() → 以降の督促は止まる
```

## 構成要素

| 場所 | 役割 |
|---|---|
| `supabase/migrations/20260730_payment_reminders.sql` | `payment_reminders` 台帳テーブル、インデックス、GRANT |
| `supabase/migrations/20260730_payment_reminder_cron.sql` | pg_cron / pg_net の登録（Vaultにservice_roleキーが必要） |
| `supabase/functions/payment-reminder/index.ts` | 督促の抽出・送信・管理者まとめ通知 |
| `supabase/functions/send-payment-email/index.ts` | 管理者への新規エントリー通知に「支払い方法」を追加 |
| `src/pages/AdminPage.tsx` | エントリー一覧の「入金」列・「入金確認」ボタン・「未入金のみ」フィルタ |

## 二重送信の防止

`payment_reminders (entry_id, stage)` に UNIQUE 制約。同じ段階は一度しか送らない。
cronが1日飛んでも、段階は「残り日数の範囲」で判定するので取りこぼさない
（例：期限2日前に動いた場合も `before3` として送られる）。

## 導入状況（2026-07-30 時点）

| 項目 | 状態 |
|---|---|
| `20260730_payment_reminders.sql` | ✅ 本番Supabaseに適用済み |
| Edge Function `payment-reminder` | ✅ デプロイ済み |
| Edge Function `send-payment-email` | ✅ デプロイ済み（支払い方法の表示を追加） |
| pg_cron `payment-reminder-daily` | ✅ 登録済み（毎日 01:00 UTC = 10:00 JST）、疎通確認200 OK |
| `20260730_entries_admin_delete.sql`（一括削除用のGRANT） | ✅ 本番Supabaseに適用済み |
| フロント（入金列・一括削除） | ✅ 本番（kawabado.com）反映済み |
| `REMINDER_DRY_RUN` | ✅ `false`（**本稼働中**） |

**2026-07-30 に全て本稼働。** 初回の督促は 2026-08-03（吕顺さん / 期限8-06の3日前）。

ドライランに戻したい場合：
```
SUPABASE_ACCESS_TOKEN=<sbp_...> supabase secrets set REMINDER_DRY_RUN=true --project-ref jdkwijdphlkrcoiggfqw
```
（`unset` ではなく `set ...=false` で解除する。コードは文字列 `"true"` のときだけドライラン）

## エントリーの一括削除について

エントリー一覧の左端チェックボックスで複数選択 →「選択したN件を削除」。
確認モーダルで `削除` と入力しないと実行できない。

- 選択できるのは**いま画面に出ている行だけ**（フィルタで隠れた行を巻き込まない）
- 決済記録のある行（`stripe_payment_id` あり、または `payment_status` が `completed`/`refunded`）が
  含まれていると、モーダルに名前入りの警告が出る。**入金・返金の履歴ごと消える**ため、
  記録を残したい場合は削除ではなく「取消」を使う
- `entries` を参照する外部キーはどちらも ON DELETE CASCADE
  （`results` = 試合結果、`payment_reminders` = 督促履歴も一緒に消える）
- 権限は RLS の `entries_delete_admin`（`is_admin()`）＋ `authenticated` への GRANT。
  **anon には DELETE も UPDATE も付いていない**

## 認証の仕組み（payment-reminder）

anonキーで外から叩かれないよう、以下のどちらかを満たさないと403で弾く。

- `x-cron-secret` ヘッダ = Edge Function secret の `REMINDER_CRON_SECRET`（pg_cronはこちら。値はVaultの `reminder_cron_secret` に格納）
- `Authorization: Bearer <service_roleキー>`（手動実行用）

cron を主に共有シークレット方式にしているのは、Supabaseが注入する service_role キーの形式が変わっても
cronが黙って止まらないようにするため（実際、この環境の `SUPABASE_SERVICE_ROLE_KEY` は
レガシーJWTではなく新形式の `sb_secret_...` が入っている）。

シークレットを作り直す場合は Edge Function secret と Vault の両方を更新すること。
```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'reminder_cron_secret'),
  '<新しい値>'
);
```

## 運用メモ

- **大会に「支払い期限」が未設定だと督促は飛ばない。** 対象者がいる場合は管理者まとめメールで警告される。
- 支払い方法を選ばずに離脱したエントリー（`payment_method` が NULL）も督促対象。銀行振込とPayPayの両方を案内する。
- 督促メールには必ず「すでにお振り込み済みの場合は行き違いですのでご容赦ください」の一文を入れている。
- 最終督促の後は自動では何もしない。取消するかどうかは管理ページで人間が判断する。

## 確認コマンド

```sql
select jobid, jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
select * from net._http_response order by created desc limit 10;
select e.name, p.stage, p.sent_at from payment_reminders p join entries e on e.id = p.entry_id order by p.sent_at desc;
```
