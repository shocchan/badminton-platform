# セルフサービス決済 有効化ランブック（2026-08-19）

600円・2,980円プランの「Stripe決済 → 自動アカウント発行 → 自動メール」の有効化手順。

## ✅ 2026-08-19 実施済み（QA完了）

- migration適用済み: 20260819210000（台帳）/ 20260819100000（ai_start_sessionの期限・累計チェック）/
  20260819220000（service_role GRANT。QAで42501を検出して追加）
- Edge Functions デプロイ済み: ai-course-checkout / ai-course-stripe-webhook / ai-course-purchase-status
- E2E QA合格: 署名検証・自動発行・失敗→再送リカバリー・冪等（二重発行なし）・同一購入者の
  再購入=アカウント再利用・ID+PWログイン・**サーバー側の access_expired / plan_minutes_exhausted 実測**・
  実生徒9名の受講権に影響なし。QAデモアカウント: `sb599656`（購入メールが shodorannga@gmail.com に届いている）
## ✅ 2026-08-19 追記: **liveモード稼働開始**

- 鍵は大会決済と同じ本番キー **STRIPE_SECRET_KEY を共用**（AI_COURSE_STRIPE_SECRET_KEY は未設定。
  分けたくなったら設定すれば上書きされる）。AI_COURSE_CHECKOUT_MODE=live
- **Webhookは本番エンドポイント登録済み**（we_1U653aRtVOvBLPLdReZZjiZU・checkout.session.completed。
  一時関数 ai-course-stripe-setup で自動登録→whsecをsecretsへ保存→関数は削除済み）
- staging・.env.production ともに VITE_AI_COURSE_CHECKOUT=live（**staging上のボタンも実課金**。
  テストカード4242は使えない。Stripe手数料 約3.6% は返金しても戻らない）
- LP→Stripe本番決済ページへの遷移を実機確認済み。台帳はクリーンな状態から運用開始
- 以下の Step 1〜6 は完了済み。**Step 7（本番フロント反映）だけが残り**＝CEOが
  `./scripts/deploy-production.sh` を実行すれば kawabado.com でも購入ボタンが有効になる

## （参考）当初の有効化手順

## 全体像

```
LP料金表CTA（VITE_AI_COURSE_CHECKOUT=test|live のときだけ）
  → Edge Function ai-course-checkout（金額はサーバー側カタログから）
  → Stripe Checkout（ホスト決済ページ・メール＋カード入力）
  → Webhook ai-course-stripe-webhook（署名検証→冪等に自動発行→メール送信）
       発行内容: authユーザー（ID+パスワード・内部メール方式=既存の発行スクリプトと同じ）
                + signup grant + ai_course_access（plan_id/source='purchase'/30日/体験は3600秒）
                + ai_plan_purchases 台帳
       メール: 購入者へログインID・初期PW・手順（ja/zh）＋ info@ へ購入通知
  → 完了ページ /{lang}/ai-course/purchase/complete（状態を照会してIDと手順を表示）
```

- 決済無効（環境変数なし）の間は、LPは従来どおり**申込フォームへフォールバック**（壊れない）
- 6か月コース（人間レッスン入り）はクライアント・サーバー両方で決済を**拒否**（無人販売しない）
- 同じ購入者メールの再購入は既存アカウントを再利用して期間延長（アカウント増殖なし）
- 期限切れ後のブロックは既存のクライアントゲート＋（migration適用後）ai_start_session が担う

## 有効化手順

### Step 1. DB（CEO承認のうえ、バックアップ後に適用）

```bash
cd ~/badminton-aicourse
launchctl start com.kawabado.supabase-backup   # 手動バックアップ1回
node scripts/ai-course/remote-sql.mjs --file supabase/migrations/20260819210000_ai_plan_purchases.sql --write --label "apply ai_plan_purchases"
node scripts/ai-course/remote-sql.mjs --file supabase/migrations/20260819100000_ai_course_plan_access.sql --write --label "apply plan access checks"
```
- 20260819210000: 購入台帳（新テーブル・既存に影響なし）
- 20260819100000: ai_start_session に期間・累計上限チェック（既存生徒は行あり期間内なので影響なし）
- 申込フォールバックも動かすなら 20260802000000_ai_course_plan_applications.sql も適用

### Step 2. Stripeテストキー（CEO作業）

Stripeダッシュボード（テストモード）→ 開発者 → APIキー:
- `sk_test_...`（シークレット）と `pk_test_...`（今回は不使用。Checkoutはpk不要）を控える

### Step 3. Supabase secrets 設定＋Function デプロイ

```bash
export SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token)
supabase secrets set AI_COURSE_STRIPE_SECRET_KEY=sk_test_XXXX AI_COURSE_CHECKOUT_MODE=test --project-ref jdkwijdphlkrcoiggfqw
supabase functions deploy ai-course-checkout --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
supabase functions deploy ai-course-purchase-status --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
supabase functions deploy ai-course-stripe-webhook --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
```
（RESEND_API_KEY は設定済みのものを共用）

### Step 4. Stripe Webhook 登録（CEO作業・テストモード）

ダッシュボード → 開発者 → Webhook → エンドポイント追加:
- URL: `https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/ai-course-stripe-webhook`
- イベント: `checkout.session.completed`（＋任意で `checkout.session.async_payment_succeeded`）
- 発行された署名シークレット `whsec_...` を:
```bash
supabase secrets set AI_COURSE_STRIPE_WEBHOOK_SECRET=whsec_XXXX --project-ref jdkwijdphlkrcoiggfqw
```

### Step 5. フロント（staging）

`.env.staging` に `VITE_AI_COURSE_CHECKOUT=test` を追記 → `./scripts/deploy-staging.sh`

### Step 6. テスト決済（E2E確認）

1. staging LP → 「600円で体験する」→ Stripeのテスト決済ページへ（TEST表示があること）
2. メール: 自分のアドレス / カード: `4242 4242 4242 4242`・未来の期限・任意CVC
3. 完了ページにログインIDが出る → メール2通（購入者向け＋info@へ[TEST]通知）
4. 届いたID/PWで https://staging.badminton-platform.pages.dev/ja/ai-course/login からログイン
   → 名前入力 → 学習開始。管理画面の受講権タブに source=purchase の行が出る
5. 2,980円プランも同様に1回。**同じメール**で買うと同じIDのまま期間延長になることを確認
6. テストアカウントの後始末: 管理画面から期間を止める or `ai_delete_test_learners` 系の運用で削除

### Step 7. 本番切替（CEO判断）

1. Stripe **liveモード**でWebhookをもう1本登録（URL同じ）→ live用 `whsec_` を控える
2. secrets を live へ:
```bash
supabase secrets set AI_COURSE_STRIPE_SECRET_KEY=sk_live_XXXX AI_COURSE_STRIPE_WEBHOOK_SECRET=whsec_live_XXXX AI_COURSE_CHECKOUT_MODE=live --project-ref jdkwijdphlkrcoiggfqw
```
3. `.env.production` に `VITE_AI_COURSE_CHECKOUT=live`（Pages env_vars にも追加。[[kawabado-deploy]]の教訓）
4. CEOが `./scripts/deploy-production.sh`
5. 実カードで1件600円を自己購入 → メール・ログイン・台帳確認 → Stripeダッシュボードで返金

## 運用メモ

- **返金**: Stripeダッシュボードから手動refund（大会側と同じ運用）。返金したら管理画面で
  該当アカウントの期間を止める（自動連動は未実装）
- **失敗時**: ai_plan_purchases.status='failed' ＋ error に理由。Stripeが自動再送する。
  30分直らなければ手動対応（create-student-login.mjs で発行してメール）
- **領収書**: Stripe設定「支払い成功時に顧客へメール」をONにすると Stripe からも領収書が届く（推奨）
- **テスト決済と実売上**: 台帳の livemode 列で区別（[TEST]は売上に数えない）
- 未対応（今後）: 返金時の権限自動停止／Turnstile等のbot対策（広告出稿前に）／管理画面の台帳タブ表示
