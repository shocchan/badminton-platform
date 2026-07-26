# しくみラボ 進捗の永続化設計（Phase 2B §14-16）

## 現在: SessionFoundationProgressRepository（実装済み）
- 保存先: `sessionStorage['ai_course_foundation_preview_v1']`（キー・内容にemail/userId/ニックネーム/自由入力本文を含めない）
- schemaVersion=1。不一致・不正JSONは黙って破棄しキー削除（試作データのため移行しない）
- attempt開始（未完了attemptへの自動再開＝リロード復元）／回答保存（同一問題の二重記録防止）／完了／軸別集計／復習キュー／リセット（foundation専用キーのみ削除）
- locale変更でも進捗維持（キーをlocaleに含めない）
- UIには「正式保存されません」を常時表示

## 将来: Supabase専用テーブル（草案・未適用）
- 草案: `supabase/migrations_draft/20260726120000_ai_course_foundation_progress_DRAFT.sql`
- ロールバック: 同フォルダ `rollback_*.sql`
- **`migrations_draft/` は supabase CLI の適用対象外ディレクトリ。共有Supabaseへは未適用・適用コマンドも未実行。**
- settings jsonbではなく専用テーブル4つ:
  1. `ai_course_foundation_unit_attempts` — 単元attempt（軸別スコアはjsonbで保持し列爆発を回避）
  2. `ai_course_foundation_question_attempts` — 問題attempt（**自由入力本文は保存しない**。必要になった場合は別途CEO承認）
  3. `ai_course_foundation_item_progress` — learner×itemの軸別状態＋next_review_at
  4. `ai_course_foundation_review_queue` — 復習キュー（status: pending/done/skipped）
- additive only・既存テーブル変更なし・backfillなし・FK（ai_learners/unit_attempts）・CHECK・unique・index・idempotent（if not exists/drop policy if exists）

## RLS設計
- 全テーブルRLS有効。anonは revoke all。service_role は全権（サーバー処理用）
- learner本人: `learner_id in (select ai_my_learner_ids())` でselect/insert/update。deleteポリシーなし（削除はservice_role運用のみ・soft delete不採用）
- 管理者: 既存 `ai_is_admin()`（ai_adminsテーブル）でselect
- question_attempts のinsertは「unit_attemptの所有者と一致」をEXISTSで強制（permissive policyのOR結合を考慮し汎用insertポリシーは削除済み）

## RLSテスト仕様（適用時に実施・現在は未適用のため未実行）
| # | 検証 | 期待 |
|---|---|---|
| 1 | learner AがAのattemptをselect | 可 |
| 2 | learner AがBのattemptをselect | 0行 |
| 3 | learner AがBのlearner_idでinsert | 拒否（with check違反） |
| 4 | anonでselect/insert | 拒否（grant/RLSなし） |
| 5 | ai_adminsのユーザーがselect | 可（書込は本人分のみ） |
| 6 | 存在しない/他人のlearner_idをinsert | 拒否 |
| 7 | 他人のunit_attempt_idへquestion_attemptをinsert | 拒否（ペアEXISTS） |
| 8 | 他人のreview_queueをupdate | 拒否 |
| 9 | learnerによるdelete | 拒否（deleteポリシーなし） |
| 10 | 同一(learner,unit,attempt_number)の重複insert | 拒否（unique） |

## admin_overrides をRLS根拠にできるかの監査結果（§16）
**使用しない。** 既存 `ai_learners_update` ポリシーは learner 本人の行更新を列制限なしで許可しており、
理論上 learner が自分の `admin_overrides`（labPreview含む）を直接PostgRESTで書き換えられる余地がある。
- 現状の影響: labPreviewはdraft教材の閲覧ゲートのみで金銭・他者データに影響しない（低リスク）
- 対応方針: RLSの権限根拠には `ai_is_admin()` のみを使用。admin_overrides列の更新をtriggerまたは列権限で
  管理者専用に固定する修正は**別課題としてCEO判断待ち**（既存ポリシー変更になるため本Phaseでは実施しない）

## 適用前チェックリスト（適用はCEO承認後）
1. 事前バックアップ（destructive-test-safety ルール準拠）
2. staging相当での migration dry-run とRLSテスト全10項目
3. rollback SQLの動作確認
4. フロントのRepository切替（SessionFoundationProgressRepository→Supabase実装）を別コミットで
