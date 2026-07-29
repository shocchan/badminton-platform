# Incident Response Runbook（AI日本語コース）

生成: 2026-07-29 / 状態: **draft（CEO確認前）**
担当者・連絡先・外部通知先は **CEO decision** 欄。AIでは確定できない。

## 共通ルール

- **learnerに技術用語を出さない。** 表示文言は `src/lib/aiLesson/course/ops/errorCodes.ts` の `userMessageJa` を使う。
- **証拠を先に残す。** 復旧作業の前に、影響範囲のクエリ結果とスクリーンショットを保存する。
- **共有Supabaseへの変更は `APPLY_SHARED_SUPABASE_MIGRATIONS`、本番反映は `APPROVE_AI_COURSE_PRODUCTION_RELEASE` が必要。** 緊急時も文字列なしでは実行しない。
- **admin_overrides の保護を、進捗のrollbackのついでに外さない。** security rollback と feature rollback は別手順（`rollback-backup.md`）。

| 重大度 | 定義 | 初動 |
|---|---|---|
| SEV1 | learner間のデータ露出・認証破綻 | 即時封じ込め → CEOへ即連絡 |
| SEV2 | 保存不能・全面障害・課金/entitlement誤付与 | 機能停止または縮退 → 当日連絡 |
| SEV3 | 一部教材の誤り・画像404・単一機能の不具合 | 記録して次リリースで修正 |

---

## 1. 保存障害（学習記録が保存できない）

- **detection**: `SAVE_FAILED` / `SYNC_PENDING` の監視イベント増加、outbox滞留（`repo.pendingCount()`）
- **severity**: SEV2
- **immediate containment**: 学習は継続可能なまま「まだ保存できていません」を表示（実装済み）。書き込み先の障害が疑われる場合は新規セッション開始を止めず、outboxに退避させる
- **learner communication**: 「まだ保存できていません／通信が戻ると自動で保存されます」（既存文言）
- **rollback**: 直前のmigrationが原因なら `rollback-backup.md` の feature rollback
- **evidence**: 監視イベント（code/route/feature/時刻）、outbox件数、サーバのエラー率
- **owner**: CEO decision
- **recovery criteria**: `SAVE_FAILED` 発生率が15分間0、outbox滞留0
- **postmortem**: 原因・検知までの時間・再発防止（テスト追加）

## 2. learner間データ露出の疑い

- **detection**: `RLS_DENIED` が想定外に0（＝素通りしている疑い）、他learnerのIDを含む取得、問い合わせ
- **severity**: **SEV1**
- **immediate containment**: 該当テーブルのData API公開を止める（RLS有効化またはgrant剥奪）。証拠取得を先に行う
- **learner communication**: 影響が確認できるまで断定しない。確認後にCEOが通知内容を決定（**CEO decision**）
- **rollback**: security rollback（`rollback-backup.md`）。進捗rollbackとは独立して実行する
- **evidence**: RLSポリシー一覧、grants、該当クエリのログ、影響learner数
- **owner**: CEO decision
- **recovery criteria**: JWT matrix（`rls-entitlement-matrix.md`）が全行期待どおり
- **postmortem**: 露出範囲・期間・法的通知要否（**legal decision**）

## 3. entitlement 誤付与（本来使えない人が使える／使える人が使えない）

- **detection**: `ENTITLEMENT_DENIED` の急増または急減、問い合わせ
- **severity**: SEV2
- **immediate containment**: 誤って付与された側は即時剥奪しない（学習中断を避ける）。まず範囲特定
- **learner communication**: 「このコースはまだご利用いただけません」（既存文言）
- **rollback**: entitlementテーブルのdumpから復元
- **evidence**: entitlement変更履歴、付与元の操作
- **owner**: CEO decision
- **recovery criteria**: 期待するlearnerのみがアクセス可能

## 4. AI会話の全面障害

- **detection**: `AI_UNAVAILABLE` / `REALTIME_DISCONNECTED` の急増
- **severity**: SEV2
- **immediate containment**: AI会話の導線を隠さず、テキスト学習へ誘導（`safeAction: テキストで学習を続ける`）
- **learner communication**: 「いまはAI会話を始められません／テキストで学習を続ける」
- **rollback**: 直近のprompt・モデル変更があれば戻す（**本セッションではprompt未変更**）
- **evidence**: エラー率、発生開始時刻、プロバイダ状態
- **owner**: CEO decision
- **recovery criteria**: 10分間エラー率が通常水準

## 5. API費用の急増

- **detection**: 日次使用量の閾値超過（閾値は **CEO decision**）
- **severity**: SEV2
- **immediate containment**: 1日あたりの会話回数上限を下げる（`RATE_LIMITED` の文言は実装済み）
- **learner communication**: 「今日の会話の上限に達しました／明日また続ける（復習は今日もできます）」
- **evidence**: 日次コスト、learnerあたり回数分布
- **owner**: CEO decision
- **recovery criteria**: 想定範囲へ復帰

## 6. 誤教材・誤答（内容が間違っている）

- **detection**: support報告（`content_wrong` / `answer_wrong`）、品質監査の新規検出
- **severity**: SEV3（ただし答えが複数ある・正解が誤りはSEV2）
- **immediate containment**: 該当問題を出題対象から外す（データ側のフラグ）
- **learner communication**: 個別対応。誤答で不利益が出た場合の扱いは **CEO decision**
- **evidence**: 問題ID（support payloadの `subjectId`）、監査結果
- **owner**: CEO decision（教材の最終判断はCEO）
- **recovery criteria**: 該当問題の修正 or 出題停止、回帰テスト追加

## 7. 画像404 / イラスト欠損

- **detection**: `IMAGE_FAILED`（既定では監視送信しない・件数のみ）
- **severity**: SEV3
- **immediate containment**: 文字で学習を継続できることを確認（実装済み）
- **owner**: CEO decision

## 8. 認証障害（ログインできない）

- **detection**: `AUTH_EXPIRED` の急増、ログイン成功率低下
- **severity**: SEV1〜2（全learnerならSEV1）
- **immediate containment**: 認証設定の直近変更を戻す。**Auth/OTP設定はガードレール対象**のため、変更はCEO承認後のみ
- **learner communication**: 「ログインの有効期限が切れました／もう一度ログインする」
- **owner**: CEO decision

## 9. migration failure（適用途中で失敗）

- **detection**: 適用スクリプトの異常終了、schema diffの不一致
- **severity**: SEV1（本番）／SEV3（local）
- **immediate containment**: **部分適用を残さない。** 全migrationはトランザクション内で実行し、失敗時は即rollback
- **evidence**: 適用ログ、`supabase migration list`、schema diff、grants/RLSの再確認
- **rollback**: `rollback-backup.md` の手順。security rollbackを先に検証する
- **recovery criteria**: schema diff 0、grants/RLS/triggerが期待どおり、backupから復元可能なことを確認済み
- **owner**: CEO decision

---

## CEO decision が必要な項目（未確定）

1. 各シナリオの owner（一次対応者）
2. learnerへの通知手段と文面の最終決定権
3. SEV1時の外部通知（法務・関係者）の要否と宛先
4. API費用の警告閾値と自動縮退の可否
5. 誤教材で不利益が出た場合の補償方針
6. support問い合わせ先の正式値（現在は送信先未確定）
