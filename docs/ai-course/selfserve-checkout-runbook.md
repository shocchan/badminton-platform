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

---

## 2026-08-20 追記: 広告前の備え（実装・適用済み）

### 返金の自動処理（稼働中）
Stripeで**全額返金**すると、webhook が台帳を `refunded` にし、その購入で付けた受講権を
即時終了する（`purchase_id` で照合するので、後から買った上位プランは消えない）。
一部返金は止めない。チャージバック（`charge.dispute.created`）は**通知だけ**で自動停止しない。
いずれも info@kawabado.com へメールが届く。学習記録は消えない（復活は管理画面で期間設定）。

### 管理画面の購入台帳（稼働中）
`/ja/ai-course/admin` → 受講権タブの先頭。発行済み件数・売上（本番決済のみ）・要対応を表示。
**「要対応」は自動発行に失敗した購入**＝入金済みなのに学習を始められない人がいる状態。
理由が行に出るので、必要なら `scripts/ai-course/create-student-login.mjs` で手動発行する。

### 申込フォームのbot対策（コード完了・**鍵の投入だけ残り**）
受け口は Edge Function `ai-course-apply` 一本（匿名の直接insertは剥奪済み・実測401）。
Turnstileは**鍵が設定されているときだけ必須**になる。いまは未設定＝フォームは動くが
bot対策は効いていない。**広告を出す前に下記2ステップを実施すること。**

1. https://dash.cloudflare.com → Turnstile → 「サイトを追加」
   - サイト名: kawabado / ドメイン: `kawabado.com`（`staging.badminton-platform.pages.dev` も追加可）
   - ウィジェットモード: **Managed**
   - 作成後に「サイトキー（公開）」と「シークレットキー」が出る
2. 鍵を入れる（シークレットはSupabaseへ、サイトキーはフロントの env へ）
   ```bash
   cd ~/badminton-aicourse
   SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase secrets set \
     TURNSTILE_SECRET_KEY=0x4AAA...（シークレット） --project-ref jdkwijdphlkrcoiggfqw
   # .env.production と .env.staging の両方へ追記
   echo 'VITE_TURNSTILE_SITE_KEY=0x4AAA...（サイトキー）' >> .env.production
   echo 'VITE_TURNSTILE_SITE_KEY=0x4AAA...（サイトキー）' >> .env.staging
   ./scripts/deploy-production.sh
   ```
   ※ サイトキーは公開情報（配信JSに載る）。シークレットは絶対にフロントへ置かない。
   ※ Cloudflare Pages の env_vars にも `VITE_TURNSTILE_SITE_KEY` を追加しておく（[[kawabado-deploy]] の教訓）。

投入後の確認: LPの6か月コース「連絡先を送って相談する」→ フォーム下にチェックが出る →
チェックしないと送信ボタンが押せない、を実機で確認する。

---

## 2026-08-20 追記: 料金への導線改善（転換率）

改修前の本番実測（kawabado.com・375px）: ページ全長 **約21画面**、`#price` は **9画面目**、
そこへ一足飛びに行くCTAが**ページ内に1つも無かった**（FVの主CTAは無料相談だけ）。
＝「いくらなのか」を知るには9画面スクロールするしかなかった。

入れたもの（すべて金額の文字は `planCatalog` の `priceLabel` から描画。LPコピーに金額を書かない）:

| 場所 | 内容 | イベント |
|---|---|---|
| FV 主CTA | 「600円（税込）で試してみる」→ 料金セクションへ | `click_ai_course_to_pricing` (location=hero) |
| FV 直下 | **価格プレビュー帯**（3プランの価格・名前・向いている人） | 同 (location=price_teaser / price_teaser_more) |
| ヘッダー | PC=「料金」テキストリンク／スマホ=「料金」ピル | 同 (location=nav) |
| スマホ下部 | **固定CTAバー**（体験CTA＋相談）。600px超で出現・料金セクション表示中は自動で引っ込む | 同 (location=sticky) |

- 体験の入口プランは `trialEntryPlan()` が決める＝**公開中でオンライン決済でき、いちばん安いもの**。
  カタログで価格やプラン構成を変えれば、FV・固定バーの文言が自動で追従する（人間レッスン入りは選ばれない）
- FV相談CTAは ghost へ格下げ（消していない）。「学習システムを見る」はテキストリンクへ
- 副産物の修正: **375pxでヘッダーが崩れていた**（ロゴ・「ログイン」・「中文」が縦積みに折り返し、
  相談CTAが2行になってはみ出す）。スマホはロゴを一段小さく＋`whitespace-nowrap`、
  相談CTAは`hidden sm:block`のラッパーで隠す（`CtaButton` の基底に `inline-flex` があるため
  className に `hidden` を足しても display は勝てない）
- 実測（staging 375px）: 3プランの価格が **2画面目までに全部見える**（改修前は9画面目）。
  横スクロールなし・タップ領域44px・料金セクション着地は見出しが隠れない位置

---

## 2026-08-21 追記: 売れる仕組みの穴埋め（A-1〜A-7）

導線分析で出た7つの穴のうち、**コードで閉じられるものは全部閉じた**。
残りはCEOの操作か素材が要るものだけ。

### ✅ A-2 放棄カートの回収（実装済み）
`ai-course-checkout` の Checkout セッションに `after_expiration[recovery][enabled]=true` を付けた。
決済ページまで来て離脱した人へ、Stripeから「続きから再開する」リンク付きメールが届く。
値引きは配らない（`allow_promotion_codes=false`）。
- 実測の裏付け: 台帳で「決済ページを開いたが未完了」が完了より多かった
- ⚠️ **送信の実行はStripeダッシュボード側の設定に従う**（設定→請求→カスタマーメール→
  「放棄されたカート」をON）。パラメーターは回収URLを有効にするもの
- パラメーターを足してもセッション作成が壊れないことは、一時関数で実測して確認済み

### ✅ A-3 購入後フォローメール3通（実装・稼働中）
それまで**購入時の1通を送ったきり、以後の接触がゼロ**だった。
`ai-course-lifecycle-mails`（Edge Function）＋ `ai_course_mail_log`（送信ログ）＋
pg_cron `ai-course-lifecycle-daily`（毎日 01:30 UTC ＝ 日本時間 10:30）。

| 用件 | 条件 |
|---|---|
| `trial_not_started` | 体験パスを買って**24時間**たっても開始していない（期限内） |
| `trial_ended` | 体験の窓（60分）が終わった＝次の選択肢を出す唯一の機会 |
| `expiring_soon` | 利用期限まで**3日**以内 |

- **1人につき1回の実行で1通まで**。同じ用件は `dedupe_key` で二度と送らない
- 送信に失敗したらログ行を消す＝翌日リトライできる（一時障害でメールが永久に消えない）
- 返金済みには送らない。宛先不明の行（購入行を消したQA残骸）も落ちる
- 判定と本文は `supabase/functions/_shared/aiCourseLifecycle.ts`（純粋関数）。
  🔑 `ai_course_access` は auth.users への外部キーがあり**本番に検証用の行を置けない**
  （2026-08-21に 23503 で実測）。だから判定はローカルの
  `src/lib/aiLesson/course/plans/aiCourseLifecycle.test.ts` で固定している
- 手動実行（dryRun）:
  ```sql
  select net.http_post(
    url := 'https://jdkwijdphlkrcoiggfqw.supabase.co/functions/v1/ai-course-lifecycle-mails',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='reminder_cron_secret')),
    body := '{"dryRun":true}'::jsonb, timeout_milliseconds := 30000);
  -- 応答: select status_code, content from net._http_response order by created desc limit 1;
  ```

### ✅ A-7 人民元の参考表示（実装済み）
中国語ページの価格に「约◯元」を併記。正準は `planCatalog.CNY_REFERENCE`
（`cnyPerJpy` と `asOf` の2つ。出典はECB参照レート）。**請求は常に日本円**なので、
料金表の末尾に「元为参考换算，实际扣款金额以发卡行当日汇率为准」を出す。
- レートを見直したら `cnyPerJpy` と `asOf` を**両方**直す（テストが形式を検査する）

### 🔑 A-1 Alipay / WeChat Pay（**CEO操作が必要**）
中国人学習者向けなのに**カード決済しかない**のが、いまいちばん大きい入口の詰まり。

2026-08-21に実測した結果:
- Stripeアカウント（JP・JPY）の **`alipay_payments` / `wechat_pay_payments` capability が未申請**
- 決済手段の設定を `on` にしても、Checkoutセッションの `payment_method_types` は `card` のまま
  → **設定だけでは出ない。Stripe側の有効化申請が要る**
- 設定は元（off）に戻し済み。ベースライン `["card","link"]` 復旧を実測

CEOの操作:
1. Stripeダッシュボード → 設定 → 決済手段 → **Alipay** と **WeChat Pay** を有効化
   （事業内容の確認が入る場合あり。JPYでの利用可否もここで分かる）
2. 有効になったら教えてください。コード側は `payment_method_types` を固定していないので
   **基本は自動で出ます**。ただし WeChat Pay は `payment_method_options[wechat_pay][client]=web`
   の指定が要る可能性があり、⚠️ **capabilityが無い状態でこれを付けると Link が消える**
   （2026-08-21実測）。有効化後に付けること

### ⏳ 残り（コードでは閉じられない）
- **A-4 社会的証明**: 掲載は「先行モニター利用中」の1枚だけ。捏造しない方針は維持。
  出せる材料は ①実データ ②CEOの指導歴 ③実画面スクショ／デモ動画
  （枠は `sectionsB.tsx` の `SHOW_SCREENSHOT_FRAME` / `SHOW_SYSTEM_DEMO` に用意済み。**素材待ち**）
- **A-5 返金条件**: 「プランにより異なります」のまま。特定継続的役務提供に当たるかの確認が未了
  （docs/ai-course/legal-open-questions.md）。**CEOの判断が要る**ので断定文言は入れていない
- **A-6 Turnstile**: 鍵の投入だけ残り（このファイル上部の手順）
