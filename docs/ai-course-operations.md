# AI日本語コース 運用ランブック（Phase 5–6）

> 対象: `feature/ai-japanese-demo` / staging (`staging.badminton-platform.pages.dev`)
> 原則: **AIコース専用・追加的・非破壊・ロールバック可能・実ユーザー無変更**。
> staging フロントは**本番と同じ Supabase** を参照する。DB/RPC/RLS/Edge の変更は本番バックエンドへ影響するため、破壊的変更は実行せず停止・報告する。
> `.env` / Secret / 招待コード / OTP / service_role 値は表示・コミットしない。

---

## 0. 現在のバックエンド資産（監査で確認済み）

### AIコース専用テーブル（14・すべて RLS 有効）
`ai_admins` `ai_config` `ai_course_invites` `ai_course_signup_grants` `ai_feedback`
`ai_growth_snapshots` `ai_issue_reports` `ai_item_progress` `ai_learners`
`ai_learning_sessions` `ai_notification_queue` `ai_otp_throttle`
`ai_session_utterances` `ai_usage_daily`

### AIコース専用 RPC（12）
| RPC | 用途 | 認可 |
|---|---|---|
| `ai_start_session` | セッション予約（**原子的**・上限判定・同時開始防止） | learner |
| `ai_release_stale_sessions` | 放置セッション解放（15分） | system |
| `ai_redeem_invite` | 招待コード消費 | service (auth fn) |
| `ai_consume_signup_grant` | サインアップ付与消費 | service |
| `ai_email_has_learner` | 既存メール判定（再ログイン可否） | service |
| `ai_check_otp_throttle` | OTP スロットル | service |
| `ai_my_learner_ids` | 自分の learner 一覧 | learner |
| `ai_delete_my_utterances` | 自分の発話削除 | learner |
| `ai_admin_delete_utterances` | 指定生徒の発話削除 | **admin** |
| `ai_delete_test_learners` | テスト生徒一括削除 | **admin** |
| `ai_purge_expired_utterances` | 期限切れ発話パージ | system |
| `ai_is_admin` | 管理者判定（RLS/RPC で使用） | — |

### AIコース専用 Edge Function（4）
`ai-course-auth`（OTP発行/招待検証） `ai-lesson-token`（Realtimeトークン） `ai-lesson-report`（レポート生成） `ai-lesson-translate`（中国語補助訳）

### マイグレーション（4・すべて追加的）
`20260718000000_ai_course.sql` / `20260720000000_ai_course_security.sql` /
`20260721000000_ai_course_growth.sql` / `20260722000000_ai_course_monthly_cap.sql`

---

## 1. セキュリティ監査結果（Phase 6.1 Edge Function）

read-only コードレビュー。**変更・再デプロイはしていない。**

| Function | JWT検証 | learner所有チェック | service_role | body検証 | CORS | 判定 |
|---|---|---|---|---|---|---|
| ai-course-auth | 該当なし（**pre-auth の OTP 発行口**） | 不要 | ✅ | ✅ | ✅ | OK（未認証前提の入口。招待/メール検証は service_role で実施し、失敗理由を詳細に返さない＝総当たり対策） |
| ai-lesson-token | ✅ | ✅ | ✅ | ✅ | ✅ | OK（JWT＋予約済み sessionId で認可） |
| ai-lesson-report | ✅ | ✅ | ✅ | ✅ | ✅ | OK |
| ai-lesson-translate | ✅ | ✅ | ✅ | ✅ | ✅ | OK |

- 管理者操作は Edge ではなく **DB RPC（`ai_is_admin` ガード）** で強制 → 正しい設計。
- **人間確認が必要（自動監査不可）**: 他人 learnerId/sessionId の実リクエスト拒否、replay、巨大 payload、rate limit の実挙動、エラー本文に内部情報が出ないこと。→ Phase 7 の異常系チェックリストで手動確認。

## 2. RLS 実地監査（Phase 6.2）— **未実施・要人間**

全 `ai_` テーブルの RLS は **staging=本番 Supabase** に対して有効だが、
未認証/別 learner/管理者/停止 learner/test learner の**実アクセス確認は本番データに触れるため自動実行しない**。
安全な実施方法（別途・人間主導）:

1. staging 用のテスト learner を2人作成（`ai_delete_test_learners` で後始末できる `is_test=true`）。
2. それぞれの JWT で、相手の `ai_session_utterances` / `ai_item_progress` / `ai_learners.settings` / `ai_usage_daily` を `select` → **0件（拒否）** を確認。
3. learner JWT から `ai_config`（上限）や他人の `admin_overrides` を更新できないことを確認。
4. `ai_is_admin=false` の learner で管理 RPC を呼び拒否されることを確認。
5. 確認後、テスト learner を削除。

> ⚠️ 破壊的検証・本番データでの RLS 破壊テストは禁止（過去の blog 消失事故の教訓）。必ずテスト learner・事前バックアップで。

## 3. セッション整合性（Phase 6.3）

- **原子性・同時開始・二重計上防止**は `ai_start_session`（サーバー権威）＋クライアントの `doneRef` 冪等 `complete()` で担保済み（コード確認済み）。
- **放置解放**は `ai_release_stale_sessions`（15分）。
- 自動テスト（`courseAcceptance.test.ts` / `courseCostLimits.test.ts`）で復習ライフサイクル・上限・二重計上防止のロジックを固定。
- **DB レベルの競合テスト（同時 `ai_start_session`）は本番 Supabase 相手には自動実行しない** → テスト learner で人間確認。

## 4. コスト管理（Phase 6.4）

### 推定モデル（`courseConfig.REALTIME_COST` / `estimateSessionCost`）
- gpt-realtime 概算単価: 入力 **$32 / 1M tok**、出力 **$64 / 1M tok**。
- 3–4分レッスンの概算トークン: 入力 1800 tok/分、出力 1200 tok/分。
- 翻訳（中国語補助）コストは `courseTranslateApi.estimateTranslateCostUsd` で別途加算。
- 保存先: `ai_usage_daily`（生徒別・日別に `sessions_count / seconds_used / estimated_cost_usd`）。

### 上限（`DEFAULT_USAGE_LIMITS`、`ai_config.usage_limits` で上書き可）
日次: 10回 / 45分 ・ 月次: 80回 / 6時間 ・ 1セッション最大4分 ・ 月次コスト警告 $40。

### ⚠️ 推定額と実請求の突き合わせ手順（毎月）
1. 管理画面（`CourseUsageCostCard`）で当月の生徒別 `estimated_cost_usd` 合計を確認。
2. OpenAI ダッシュボード → Usage → 対象期間の realtime + text + 翻訳モデルの**実請求**を取得。
3. `実請求 ÷ アプリ推定` の比率を算出。乖離が ±20% を超えたら `REALTIME_COST` の係数を実測へ調整（コードのみ・非破壊）。
4. **円換算は「参考」表記に限定**し、厳密な請求額として見せない（換算レート・日時を併記）。
5. test learner のコストは本番集計から分離（`is_test` で除外）。

- **二重加算防止**: 再試行は同一 sessionId に `finalizeSession` で確定 → 使用量記録は1回。翻訳失敗はコスト計上しない。

## 5. 管理監査ログ（Phase 5.4）— **追加提案・未適用**

現状、管理操作（停止/上限変更/削除）の**専用監査ログテーブルは存在しない**（`admin_overrides` に最新状態は残るが、時系列の操作履歴は残らない）。

### 追加提案（**マイグレーション未適用・要 CEO 承認**）
`ai_admin_audit`（append-only）を追加。記録: `id, created_at, admin_user_id, target_learner_id, action, before_summary(jsonb), after_summary(jsonb), success, note`。
**記録しない**: OTP・APIキー・Secret・招待コード全文・発話全文・不要な個人情報。
RLS: admin のみ `select`、`insert` はサーバー（RPC/service）経由のみ、`update/delete` 不可（改ざん防止）。

> これは**追加的・非破壊**だが本番 Supabase へのスキーマ追加になるため、**本ランブックでは適用しない**。適用は CEO の Supabase デプロイ手順で（migration ファイルを別途用意 → `supabase db push` → RLS 確認）。適用までは、Supabase の built-in ログ + `admin_overrides` の現状値で暫定運用。

## 6. 障害時 UX（Phase 6.5）— 現状確認

`limits`（no_learner/suspended/session_already_active/daily・monthly の各上限/network/unknown）、
`voice`（mic-denied/wechat/connectionLost/connectFailed/retryLimit/interrupted/部分レポート）、
`issue`（送信失敗）は ja/zh とも**内部コードを出さない自然文**で実装済み（`aiCourse.ts`）。
- 再試行可否・データ保存有無の明示、二重開始防止、問題報告への誘導は実装済み。
- **未カバー候補（要検討）**: OpenAI/Supabase の広域障害時の共通バナー（現状は個別エラーに寄せている）。Phase 5 候補。

## 7. バックアップ・ロールバック（Phase 6.6）— dry-run 手順

**実際の破壊的ロールバックは行わない。以下は検証済みの手順のみ。**

| 目的 | 手順（安全） |
|---|---|
| コース一時停止 | `ai_config` の運用フラグ or 全 learner を `is_active=false`（`ai_learners`、admin RPC 経由）。※一括更新は要確認ダイアログ |
| 招待停止 | `ai_course_invites` の対象コードを `revoked=true`（発話・learner は残す） |
| learner 停止 | 管理画面「利用を停止」→ `ai_learners.is_active=false`。`ai_start_session` がサーバー側で拒否 |
| Edge Function ロールバック | `supabase functions deploy <name>`（1つ前のソースで再デプロイ）。※本番影響のため CEO 実行 |
| staging フロント ロールバック | 直近の正常 deployment へ: `wrangler pages deployment list --project-name=badminton-platform` → 対象 ID を昇格、または前ビルドで `deploy-staging.sh` 再実行 |
| 本番フロント ロールバック | Cloudflare Pages ダッシュボード → Deployments → 前デプロイを「Rollback」 |
| データバックアップ | Supabase → Database → Backups（PITR）。破壊的操作の**前に必ず**取得 |
| 発話のみ削除 | 生徒: `ai_delete_my_utterances` / 管理: `ai_admin_delete_utterances`（レポート・進捗は残る） |
| 全データ削除 | test: `ai_delete_test_learners`。実生徒は auth ユーザー削除と DB 削除を**区別**して個別に |
| 復旧確認 | ログイン → ホーム → 履歴 → 直近レポートが読めることを確認 |
