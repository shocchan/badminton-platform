# 商品3段階化ロールアウト（2026-08-19）

LP・カタログ・権限構造を「600円体験 → 2,980円1か月 → 10万円6か月」の3段階へ改修した。
**フロントはstagingのみ反映**。本番デプロイ・DB変更はCEO確認後。

## いま動いているもの（コードのみ・DB変更なし）

- LP: 3プラン料金表・AIのみ/AI＋人間コーチ比較表・あなたに合うプラン・12セクション再構成
- 不具合修正: 「学習システムを見る」スクロール／相談CTA文言／LPとログインのURL分離
  （ログイン専用URL `/:lang/ai-course/login`。旧 `?app=1` はブックマーク互換で残置）
- 分析: `src/lib/analytics.ts`（本番実績のある実装をsecurityブランチから移植）＋LP/商品イベント
- 権限の導出: `planEntitlements.ts`（表示とサーバーが同じ定義を読む）
- 1か月→6か月アップセル: 判定ロジック＋バナー実装済み。**plan_id列が無いため全員に非表示（休眠）**

## 追記（2026-08-19 セルフサービス決済）

600円・2,980円の「Stripe決済→自動アカウント発行→自動メール」を実装した（コード完了・未デプロイ）。
有効化手順は [selfserve-checkout-runbook.md](selfserve-checkout-runbook.md)。
決済が無効のあいだ、LPのCTAは従来どおり申込フォームへフォールバックする。

## CEOの承認が要るもの（未実施）

staging と production は同じ Supabase を共有しているため、以下は**適用＝本番変更**。

1. **migration `20260802000000_ai_course_plan_applications.sql`（申込テーブル）**
   - 適用するまで、600円・2,980円プランの申込フォームは送信に失敗し
     「メールでご連絡ください」へフォールバックする（成功したふりはしない設計）
   - 広告を出すなら bot対策（Turnstile等）が先（匿名insertできる設計のため）
2. **migration `20260819100000_ai_course_plan_access.sql`（プラン列＋サーバー側チェック）**
   - `ai_course_access` に plan_id / purchased_at / ai_minutes_total / auto_renew /
     upgraded_from_plan_id / upgrade_credit_jpy を追加
   - `ai_start_session` に期間チェック（期限切れ→ `access_expired`）と
     体験パスの累計60分チェック（→ `plan_minutes_exhausted`）を追加
   - **既存生徒への影響なし**: 行が無い/plan_idがnullの人は従来どおり。既存データは書き換えない
   - rollback: `20260819100000_ai_course_plan_access.rollback.sql`
3. 本番フロントデプロイ（CEOが `deploy-production.sh` を実行）

## 購入フロー（現状）

決済は**手動**（Stripe checkoutはAIコースでは未有効・テストで禁止固定）:
申込フォーム → 人が確認 → メールで案内 → 銀行振込 → 管理画面で `ai_course_access` に
期間を設定（1か月プランなら購入日から30日・plan_id='ai-month'）。

## 適用後にやること（メモ）

- 1か月プラン購入者の行に plan_id / purchased_at / valid_until(購入+30日) を設定
  → アプリ内の伴走コース案内（会話3回後/7日後/期限7日前）が自動で動き出す
- 体験パス購入者は ai_minutes_total=60 を設定
- 期限切れコードのUI文言は既存の accessGate が対応済み（`ai_start_session` の新コード
  `access_expired` 等は音声レッスン開始時のエラーとして返る。表示文言の追加は適用後に確認）
