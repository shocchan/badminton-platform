# 正式DB保存 実装パケット（適用前・CEO承認待ち）

作成: 2026-07-28 ／ 状態: **草案。共有Supabaseへは一切適用していない。**

対象: 語彙進捗・診断結果・復習予定の正式保存（現在は端末内 sessionStorage の preview のみ）。

---

## 1. データモデル（最終案）

migration草案: `supabase/migrations/20260728000000_ai_course_vocab_persistence.sql`
rollback: 同ディレクトリの `rollback_20260728000000_ai_course_vocab_persistence.sql`

| テーブル | 1行の単位 | 主キー |
|---|---|---|
| `ai_course_vocab_item_progress` | 学習者×語（×sense） | (learner_id, item_id, sense_key) |
| `ai_course_vocab_pack_progress` | 学習者×パック | (learner_id, pack_id) |
| `ai_course_vocab_diagnostic_attempts` | 診断の1回の試行 | attempt_id（クライアント生成UUID） |

設計判断:

- **教材固定データとlearner進捗を混ぜない。** 語・訳・例文・cognateはTS静的データのまま。
  DBには学習者の状態だけが入り、`content_version` でどの教材版で学んだかを追える
- **JSON一括保存にしない。** self_assessment / review_stage / next_review_on などは列。
  唯一のJSON列 `dimension_states` は6次元固定の小さなオブジェクトで、行の一部としてのみ更新
- 一覧・期限クエリのために `(learner_id, next_review_on)` の部分インデックスを持つ
- senseの無い語は sense_key='-'（PKにnullを置かないための番兵値）

## 2. RLS（最終草案）

既存の `ai_my_learner_ids()` / `ai_is_admin()` をそのまま使う（新しい権限関数を作らない）。

- select: 本人 or admin
- insert / update: 本人のみ（with checkで learner_id の差し替えを防ぐ）
- **delete: policyを作らない＝authenticatedは削除不可。** 削除はservice_role（運用作業）のみ
- anonは revoke all

## 3. 冪等性・競合

| 対策 | 内容 |
|---|---|
| 進捗のupsert | PK (learner_id, item_id, sense_key) への upsert。再送しても行は増えない |
| 診断の再送 | attempt_id（クライアント生成UUID）でupsert。再読込・二重送信でも1試行 |
| 楽観ロック | `row_version` を読み取り時に保持し、更新時に `where row_version = :seen` を付ける。0行更新なら再読込して再適用（サーバー側triggerが毎更新で+1） |
| 復習予定の重複 | 予定は item_progress の1列（next_review_on）なので、行が一意である限り重複しえない |

## 4. 端末間同期・offline・競合方針

- **同期の単位は「語ごとの最新状態」**（イベントログではない）。last-write-wins ではなく
  row_version 楽観ロックで「古い端末からの上書き」を検出し、負けた側は再読込して自分の操作だけ再適用
- **offline**: 書き込みは今のsessionStorage repositoryへ先に行い（現行動作のまま）、
  オンライン時にDBへ同期するoutboxを後段に足す。**学習体験はDB接続に依存させない**
- 競合で守る不変条件: 復習予定は「より早い期限が勝つ」／self_assessmentは「新しいattempt時刻が勝つ」

## 5. 日付・timezone

- タイムスタンプは timestamptz（UTC）
- **「学習上の今日」はクライアントの LearningClock が唯一の決定者**（既存設計を維持）。
  期限は `next_review_on date`（LearningClockのローカル日付キーをそのまま保存）で比較し、
  サーバー側で日付をまたぐ変換をしない。端末のtimezoneが変わっても「予定日」がずれて見えない

## 6. sessionStorage（現行preview）からの移行

- 現行キー: `ai_course_vocab_preview_v1`（schemaVersion 2）・`ai_course_vocab_schedule_preview_v1`（v1）
- 初回ログイン同期時に、previewの entries を上記モデルへ**一方向で**変換しupsert
  （wrong/supported/independent・reviewStage・nextReviewAt(date)・selfAssessment はそのまま対応列へ）
- 変換後もpreviewキーは**消さない**（同期が確認できるまで二重保持。削除はCEO確認後の後続作業）
- 変換できない値（未知のstage等）は捨てずに `dimension_states` へ `{legacy:...}` として保持

## 7. TS側の設計（今回作成済み・未接続）

`src/lib/aiLesson/course/persistence/vocabPersistence.ts`（設計のみ。**どこからもimportされない**）

- 行型 3種（テーブルと1:1）
- `VocabPersistenceGateway` interface（upsertItemProgress / upsertPackProgress /
  upsertDiagnosticAttempt / listDueItems / loadAll）
- `createLocalGateway(storage)`: 現行sessionStorage repositoryを同じinterfaceで包む
- 切り替え: `createGateway(mode: 'local' | 'supabase')`。**supabase実装は適用承認後に実装**

## 8. shocchanテストデータのみの検証手順（適用承認後）

1. 適用前に `pg_dump --schema-only` と `ai_learners` のdumpを取得（backup）
2. migrationをshadow DB（`supabase db reset --linked=false` のローカル）で先に流し、
   `rollback_...sql` → 再適用 の往復が通ることを確認（dry-run）
3. 共有DBへ適用後、**shocchanのlearner_idだけ**でinsert/update/selectのRLS動作を確認
   （他learnerのlearner_idを指定したinsertが拒否されることを含む）
4. Andyさん・他learnerの行は作らない・読まない（確認クエリはlearner_id指定のみ）

## 9. 本番データ非接触の証明方法

- 適用前後に `select count(*) from ai_item_progress` 等、**既存テーブルの行数スナップショット**を取り不変を示す
- 新3表は作成直後 `count(*) = 0` を記録
- 適用SQLに既存テーブルへの alter / update / delete が**一切含まれない**ことは草案の全文で確認可能
  （create table if not exists / 新規policy / 新規trigger のみ）

## 10. 今回やっていないこと（禁止事項の遵守）

- migration適用・共有DB変更・実learnerデータ移行・Andyさん接触・本番反映: **なし**
- 作成したのは 草案SQL・rollback SQL・型とinterface（未接続）・本パケットのみ

## 11. CEOの承認ポイント

1. この3表モデルでよいか（特に「教材はDBに入れない」「delete不可」の2点）
2. migration適用のタイミング（適用作業はCEO立ち会いのもと実施を推奨）
3. preview→DB移行後の二重保持期間（提案: CEOが複数端末で確認できるまで）
