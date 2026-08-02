# セルフサービス販売基盤 — セッション引継ぎ

2026-08-02 クローズ時点の状態。**このセッションでは追加のP0修正を行っていない。**

本番デプロイ・本番Stripe有効化・remote migration 適用は、いずれも**実行していない**。

---

## 1. 未適用 migration

| ファイル | 内容 | 適用先 | 状態 |
|---|---|---|---|
| `supabase/migrations/20260803000000_ai_course_sales.sql` | `ai_purchases` / `ai_entitlements` / `ai_entitlement_consumption` / `ai_active_sessions` / `ai_support_events` の5表＋RLS＋`authenticated` GRANT＋`ai_grant_entitlement` / `ai_consume_active_time` / `ai_resync_entitlement` の3 RPC | Supabase `jdkwijdphlkrcoiggfqw` | **未適用** |

⚠️ **staging と production は同じ Supabase プロジェクトを共有している。**
remote への適用は production への適用と同義なので、CEO承認なしに実行しない。

適用手順（承認後）:

```bash
SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase db push --project-ref jdkwijdphlkrcoiggfqw
```

⚠️ 既知の落とし穴: このプロジェクトは migration 履歴に重複 version prefix
（`20260707` / `20260710` / `20260712`）があり、`db push` が `--include-all` を要求する。
該当ファイル群を一時退避 → push → 戻す、の手順を踏むこと（`project_kawabado-ai-course` メモリ参照）。

---

## 2. 未デプロイ Edge Function

| 関数 | 役割 | 状態 |
|---|---|---|
| `supabase/functions/ai-course-checkout/` | 決済セッション作成／支払結果照会／利用権の自動付与／再同期。金額は `_shared/planCatalog.json` からサーバーが決め、クライアントの金額を受け取らない | **未デプロイ** |

デプロイは production Edge Function のデプロイと同義（同一プロジェクト共有）。CEO承認必須。

```bash
SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) supabase functions deploy ai-course-checkout --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
```

**現在の staging 実証は、この関数を経由していない**。ブラウザ内の模擬ゲートウェイ
（`paymentGateway.ts` の `simulated` 実装）で、注文→支払確認→利用権付与→学習開始までを通している。
DB経路の実走は未証明。

---

## 3. 必要な環境変数

| 変数 | 置き場所 | 現状 | 備考 |
|---|---|---|---|
| `VITE_STRIPE_PUBLISHABLE_KEY` | `.env.staging` | **未設定** | `pk_test_` のときだけ決済が有効。`pk_live_` は `salesEnv.ts` が拒否する |
| `STRIPE_SECRET_KEY` | Supabase Secrets | **未設定** | `sk_test_` を入れる。live鍵を入れない |
| `AI_COURSE_SALES_WEBHOOK_SECRET` | Supabase Secrets | 未設定 | 支払結果の照会のみで運用する場合は不要 |
| `SUPABASE_ACCESS_TOKEN` | `~/.supabase_backup_token` | 設定済み | migration / functions deploy に使用 |

⚠️ **`.env`（ベース）には Stripe 鍵を絶対に入れない。** staging ビルドが `.env` を読むため、
live鍵が入ると staging で実課金が起きる（`project_kawabado-stripe-payment` の事故防止メモ）。

---

## 4. 【P0】教材の公開露出 — 再現手順

**問題**: 問題バンクが静的JSチャンクとして公開配信されており、利用権・ログインなしで誰でも全件取得できる。
§8「全問題bankをクライアントへ送らない」を満たしていない。

### 再現

```bash
curl -s https://selfserve-sales.badminton-platform.pages.dev/ja/ai-course | grep -oE 'ai-course-(vocab-content|reading|listening)-[A-Za-z0-9_-]+\.js'
```

出力されたファイル名をそのまま取得する（**認証ヘッダなし・Cookieなしで200が返る**）:

```bash
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://selfserve-sales.badminton-platform.pages.dev/assets/ai-course-vocab-content-w-WhaZiW.js
```

### 2026-08-02 の実測

| チャンク | HTTP | サイズ |
|---|---|---|
| `ai-course-vocab-content-*.js` | 200 | 1,048,961 bytes |
| `ai-course-reading-*.js` | 200 | 372,853 bytes |
| `ai-course-listening-*.js` | 200 | 300,813 bytes |

チャンク名はビルドごとに変わるが、HTMLかエントリチャンクから必ず辿れるため、
名前がハッシュ付きであることは保護にならない。

### 原因

教材が `src/lib/aiLesson/course/adventure/content/` から**静的import**され、
`vite.config.ts` の `manualChunks` で独立チャンクに切り出されている。
チャンク分割はバンドルサイズ対策であって、アクセス制御ではない。

`src/lib/aiLesson/course/sales/contentGuard.ts` に正しい配信方針
（stepごと配信・内部ID除去・枠あたり総本数上限・連打制限・管理者QAとの権限分離）を実装済みだが、
**学習アプリ本体がこの層を通っていない。**

### 直し方の方向（未着手）

1. 教材をビルド成果物から外し、Edge Function 経由の配信にする
2. 配信時に `contentGuard.ts` の `serveStep()` を通す（利用権確認・件数上限・内部ID除去）
3. `manualChunks` の教材エントリを削除し、静的importを動的fetchへ置換
4. 「全チャンクを列挙して200が返らない」ことをテストで固定する

影響範囲が学習アプリ本体に及ぶため、販売基盤とは別の作業として扱う。

---

## 5. 未接続のランタイム機能

ロジック層とUI部品は実装・テスト済みだが、**学習アプリ本体（`AiCoursePage` / `AdvShell`）に接続していない**。
現在これらが動くのは、テストと販売画面の中だけ。

| 機能 | 実装 | 接続先（未接続） | 影響 |
|---|---|---|---|
| **サーバー正準 active-time** `sales/activeTime.ts` | 純関数＋テスト58件 | 学習セッションの開始・heartbeat・終了に `beginActiveSegment` / `applyHeartbeat` / `endActiveSegment` を差し込む | 60分パスを買っても**実際には時間が減らない**。残り時間表示も出ない |
| **利用権チェック** `sales/entitlement.ts` | 純関数＋テスト | 学習開始時に `resolveEntitlement` を確認し、期限切れ・残0を止める | 利用権なしでも学習画面が使える |
| **60分→1か月アップセル** `sales/upsell.ts` ＋ `UpsellDialog.tsx` | 純関数＋UI＋テスト | 冒険完了・20分到達・残10分・使い切りの各地点で `shouldShowUpsell` を評価 | アップセルが一度も出ない |
| **1か月→6か月相談導線** 同上 | 同上 | 7日利用・弱点反復などの判定地点 | 同上 |
| **販売ファネル analytics** `sales/salesAnalytics.ts` | 実装＋テスト | `hour_pass_started` 以降の学習側イベント発火点 | 購入までのイベントは出るが、**学習中のイベントが出ない** |
| **大量取得防止** `sales/contentGuard.ts` | 実装＋テスト17件 | 教材配信経路（上記P0と同一） | 方針が実際には効いていない |
| **利用権の再同期** `salesHelp.ts` の `resyncEntitlement` | 実装＋UI | Edge Function `ai-course-checkout` の `resync` エンドポイント | 画面はあるがサーバー側が未デプロイ |

**つまり現状で実証できているのは「購入して利用権が付くところまで」**であり、
「その利用権で学習し、時間が減り、アップセルが出る」ところは接続待ち。

---

## 6. 価格の確定状態

| プラン | priceAmount | priceStatus | 通常表示 | 購入 |
|---|---|---|---|---|
| 60分AIパス | 600 | `confirmed` | 600円（税込） | 可 |
| **1か月AIプラン** | **2980** | **`draft`** | **準備中** | **不可** |
| 6か月伴走コース | 100000 | `confirmed` | 100,000円（税込） | 相談のみ |

1か月プランは `?plans=preview` でのみ「2,980円（案）」と表示される。
`acceptsPurchase()` と `startCheckout()` の両方が拒否するので、画面を直しても未確定価格では課金できない。

⚠️ 60分¥600 と 6か月¥100,000 も、依頼書上は「価格候補」。CEOの明示確定を取っていない。
確定でなければ同じく `priceStatus: 'draft'` にすること。
