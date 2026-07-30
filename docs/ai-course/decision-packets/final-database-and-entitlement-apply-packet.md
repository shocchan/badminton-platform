# 最終 適用前パケット（正式DB保存 ＋ entitlement/RLS）

作成: 2026-07-28 ／ 状態: **未適用。共有Supabaseへは一切変更していない。**

> **適用条件**: CEOの次の回答が明示文字列
> **`APPLY_STAGING_MIGRATIONS`**
> でない限り、いかなるmigration・RLS・policy・データ変更も実行しません。
> 共有プロジェクトのため「stagingだから安全」とは判断しません。

---

## 1. 実行予定SQL全文

| ファイル | 内容 |
|---|---|
| `supabase/migrations_draft/20260728000000_ai_course_vocab_persistence_DRAFT.sql` | 語彙進捗3表＋RLS＋trigger |
| `supabase/migrations_draft/20260728010000_ai_course_entitlements_DRAFT.sql` | entitlements表＋RLS＋admin_overrides列保護＋既存フラグ移行insert |

（全文はファイル参照。適用時はDRAFTサフィックスを外し `supabase/migrations/` へ移す）

## 2. rollback SQL全文

- `supabase/migrations_draft/rollback_20260728000000_ai_course_vocab_persistence.sql`
- entitlements: 草案末尾のrollback節（trigger→function→tableの順で撤去）

## 3. 追加テーブル（4）

`ai_course_vocab_item_progress`（PK: learner_id, item_id, sense_key）／
`ai_course_vocab_pack_progress`（PK: learner_id, pack_id）／
`ai_course_vocab_diagnostic_attempts`（PK: attempt_id）／
`ai_course_entitlements`（PK: learner_id）

## 4. 追加index（2）

`ai_cvip_due_idx`（learner_id, next_review_on・部分index）／
`ai_cvda_learner_idx`（learner_id, pack_id, started_at desc）

## 5. RLS policy全文（草案内・要点）

- 進捗3表: select=本人orアドミン／insert・update=本人のみ（with check）／**delete policyなし**・anon revoke
- entitlements: **select（本人orアドミン）の1本のみ**。書き込み系のgrant・policyは一切なし

## 6. 既存policyの変更差分

**なし。** 既存policyのdrop・alterは行わない。既存テーブルへの変更は
ai_learners への **trigger追加のみ**（次項）。

## 7. admin_overrides列保護（二層防御の2層目）

`ai_course_protect_admin_overrides()` trigger:
admin_overrides の変更を admin / service_role（直接接続）以外で拒否。
learner本人の他列（display_name等）の自己更新は従来どおり通る。

## 8. entitlement移行SQL

`admin_overrides ? 'labPreview'` を持つ行だけを対象に entitlements へ insert
（`on conflict do nothing`）。**admin_overrides自体は変更しない**（削除は動作確認後の別migration）。

## 9. 想定影響行数

| 対象 | 行数 |
|---|---|
| 新規4表 | 作成直後 0行 |
| entitlements移行insert | **1行想定**（labPreviewを持つのはshocchanの検証learnerのみ） |
| 既存テーブルのupdate/delete | **0行** |

## 10-11. 適用前後の row count 手順

適用前後に同じクエリを実行し記録する:
```sql
select 'ai_learners', count(*) from ai_learners
union all select 'ai_item_progress', count(*) from ai_item_progress
union all select 'ai_learning_sessions', count(*) from ai_learning_sessions;
-- 適用後は新4表の count(*)（=0, 0, 0, 1想定）も記録
```
既存3表のcountが前後で不変であることを本パケットへ追記して完了とする。

## 12. sho以外非接触の検証

- 移行insertの対象を `admin_overrides ? 'labPreview'` で限定（該当1行）
- 適用後 `select learner_id, granted_by from ai_course_entitlements;` が1行であること
- 進捗3表への書き込みテストは **shocchanのlearner_idのみ** で実施

## 13. Andyさん非接触の検証

- 適用SQLに learner行のupdate/deleteが存在しない（§6・§9）
- 適用後、Andyさんの learner_id で `ai_course_entitlements` に行が**無い**ことを確認
- current_week / masteryState / XP / 会話履歴のテーブルへは一切触れない（SQL全文で確認可能）

## 14. service role限定書き込みの検証（適用後・shocchanのJWTで実行）

```sql
-- learnerのJWTで: すべて失敗すること
insert into ai_course_entitlements (learner_id) values ('<sho-learner-id>');   -- permission denied
update ai_course_entitlements set lab_preview = true;                          -- permission denied
```

## 15. learner自己権限昇格の拒否テスト（適用後）

```sql
-- learnerのJWTで: admin_overridesの自己書き換えが拒否されること
update ai_learners set admin_overrides = '{"labPreview":true}'::jsonb where user_id = auth.uid();
-- → exception 'admin_overrides can only be changed by admin or service role'
-- 他列の自己更新は通ること
update ai_learners set display_name = 'test' where user_id = auth.uid();       -- ok
```

## 16. learner間分離テスト（適用後）

- shocchanのJWTで他learner_idの進捗行を insert → with check違反で失敗
- select で他learnerの行が返らない（RLS）

## 17. idempotency

- 全DDLが `if not exists` / `drop ... if exists`＋`create` 形式 → **同じmigrationを2回流しても安全**
- 移行insertは `on conflict do nothing`
- アプリ側: 進捗はPK upsert・診断はattempt_id upsert・row_version楽観ロック（設計パケット§3）

## 18. transaction境界

supabase CLI のmigrationは1ファイル=1トランザクション。2ファイルを**別々に**適用し、
1本目（進捗3表）成功確認後に2本目（entitlements）へ進む。同時適用しない。

## 19. failure時rollback

- 適用中エラー: そのファイルのトランザクションが自動巻き戻し（部分適用は残らない）
- 適用後に問題発見: §2のrollback SQLを実行（実行前に新4表のdumpを取得）
- クライアントは未配線のため、DB rollbackのみでアプリへの影響なし

## 20. migration checksum（sha256先頭16桁・適用時に照合）

| ファイル | checksum |
|---|---|
| 20260728000000_ai_course_vocab_persistence_DRAFT.sql | `aa41ce8e44591c08` |
| rollback_20260728000000_ai_course_vocab_persistence.sql | `e323251eca3deb18` |
| 20260728010000_ai_course_entitlements_DRAFT.sql | `cb95476835bab957`（H1修正後） |
| 20260729000000_ai_course_unit_progress_DRAFT.sql | `726c59f62e755dbe`（H1で追加） |
| rollback_20260729000000_ai_course_unit_progress.sql | `4b3ca07a070f64b1` |

適用直前に `shasum -a 256` で再計算し、この値と一致しない場合は適用を中止する。

### 20b. H1 shadow検証（2026-07-29・local実測）による更新

local Supabase（Docker/colima）で本パケットの全SQLを適用し、JWT matrix 20項目・
cross-device同期・feature/security rollbackを実測した（`production/generated/h1-local-verification.md`）。
実測に基づく草案修正2点（**適用前にCEOはこの差分を含めて承認してください**）:

1. **entitlements草案**: Supabaseの default privileges が authenticated へ ALL を自動付与するため、
   `revoke insert, update, delete ... from authenticated` を明示追加（実測M07）。
   また admin_overrides 保護triggerが service_role の Data API 経由更新まで拒否していたため、
   `role='service_role'` claim を許可条件へ追加（実測M18。旧checksum 42cdbc6d→新 cb954768）。
2. **unit_progress草案（新規追加）**: N3/N2単元進捗の正式保存
   （楽観ロック＋mutationId冪等のRPC `ai_upsert_unit_progress`・直接書き込みはrevokeで遮断・
   クライアント実装 `supabaseUnitProgressServer.ts` と実DB統合テスト済み）。
   適用順は ①進捗3表 → ②entitlements＋列保護 → ③unit_progress。

## 21. 適用に必要なCEO回答

以下をすべて明示してください:

1. **`APPLY_STAGING_MIGRATIONS`**（この文字列そのもの。無ければ適用しません）
2. 適用順の確認: ①進捗3表 → ②entitlements＋列保護（提案どおりでよいか）
3. 立ち会いの要否（推奨: 立ち会いあり。row count記録を画面共有で確認）
4. 適用後のshocchanのみ検証（§12-16）の実施タイミング

---

### 参考: 適用後のクライアント作業（別途・このパケットの範囲外）

entitlement読み込みへの切替（fallbackなし・失敗時は権限なし側へ）／内部chunkのgate／
検証モードの internal_review 紐づけ＋analytics停止／progress同期outbox。
いずれも適用と動作確認の後、stagingでCEO確認を経て進める。

---

## 22. 正式化（2026-07-30 Final Preflight・remote未適用のまま）

DRAFTを正式ファイルへ改名し、`supabase/migrations/` に配置した（**remoteへは未適用**。
localの `supabase start` では通常適用される）。旧参照パスのテスト・コードコメントは全て更新済み。

### 22a. 正式ファイルと full SHA-256（適用直前に `shasum -a 256` で全桁照合・不一致は即中止）

| 種別 | path | sha256 |
|---|---|---|
| ① vocab persistence | `supabase/migrations/20260728000000_ai_course_vocab_persistence.sql` | `50cb55ae59bc13a3999cc3ee80c6be21394c67b30ac64588a9b6270486f8b405` |
| ② entitlements | `supabase/migrations/20260728010000_ai_course_entitlements.sql` | `a4f0bcd5eebcc2a0cc714615b6b8df40c0ce81f73f221131096830ff1053d81a` |
| ③ unit progress | `supabase/migrations/20260729000000_ai_course_unit_progress.sql` | `92a5606de2efd07760e4b7fa5fe11f93b03a769c2d04666f0536c5fc383a6ee0` |
| rollback① | `supabase/rollbacks/rollback_20260728000000_ai_course_vocab_persistence.sql` | `e323251eca3deb18bf3ac0c2d2984dae3fb9d7806d764e4fd64fdc83834c1762` |
| rollback② | `supabase/rollbacks/rollback_20260728010000_ai_course_entitlements.sql` | `9c93eb980e05f3a2f2bcc564890cc3fc905225427ca28a1ed747b0fb7b59cfbf` |
| rollback③ | `supabase/rollbacks/rollback_20260729000000_ai_course_unit_progress.sql` | `4b3ca07a070f64b1c2fe9eca79ba64c5476f0fed8effbd2b6dd3a8050dff6b92` |

### 22b. 正式化で加えた差分（checksum変更の理由・全てセキュリティ強化のみ）

1. ①: 進捗3表へ `revoke insert, update, delete from authenticated` を明示（default privilegesのALL自動付与への二層目。RLSのdelete policy無しと合わせて二重遮断）
2. ①: `ai_course_vocab_touch()` に `set search_path = public`（invoker関数だがlinter準拠で固定）
3. ②: `ai_course_protect_admin_overrides()`（SECURITY DEFINER）に `set search_path = public`
   — **未固定はschema偽装による権限昇格の定番経路**のため必須修正
4. ②のrollbackを独立ファイル化（従来は草案末尾コメントのみ）

### 22c. チェックリスト確定値

- additive only: **YES**（既存テーブル変更は ai_learners への trigger 追加のみ・列変更/削除0）
- new tables 5 / functions 3（`ai_course_vocab_touch`=invoker+search_path固定、
  `ai_course_protect_admin_overrides`=DEFINER+search_path固定、`ai_upsert_unit_progress`=DEFINER+search_path固定・冒頭本人確認）
- triggers: 新規4（vocab3表touch＋ai_learners保護）／ indexes 3 ／
  grants: authenticated=select(+vocab3表はinsert/update)・service_role=all ／
  revokes: anon=all・authenticated=delete(vocab3表)/insert,update,delete(entitlements・unit_progress)
- RLS: 全新テーブルenable。select=本人orアドミン。書き込みpolicyはvocab3表の本人insert/updateのみ。
  entitlements・unit_progressに書き込みpolicyなし（unit書き込みはRPC一本化）
- privilege escalation: DEFINER 2関数とも search_path 固定＋入口ガード（H1 matrix M10/M15/M18で実測）
- duplicate migration prefix: 新3本は14桁で一意。**既存のバドミントン側に日付のみprefixの重複（20260707×4等）が
  歴史的に存在**（適用済み・今回触らない・`supabase migration list` 照合はpreflight P7で実施）
- transaction境界: 1ファイル=1トランザクション。適用順 ①→②→③・各ファイル成功確認後に次へ

### 22d. コマンド（承認後にワンセットで実行）

```bash
# 0) 事前バックアップ（対象スキーマのDDL＋既存ai_*データ）
supabase db dump --linked -f backup_pre_apply_$(date +%Y%m%d%H%M).sql
# 1) 事前SELECT（読み取りのみ・結果をパケットへ転記）
#    scripts/ai-course/preflight-remote-selects.sql を SQL Editor で実行
# 2) checksum照合（22aと全桁一致しなければ中止）
shasum -a 256 supabase/migrations/2026072{8000000,8010000,9000000}_ai_course_*.sql
# 3) 適用（順に・1本ずつ）
supabase db push --linked --include-all   # または migration up を1本ずつ
# 4) 直後検証
node scripts/ai-course/post-apply-verification.mjs <env.json>   # 18項目matrix
#    ＋ クライアント側: syncedUnitStorage統合テスト（probe→localStorage引き上げ→server保存→
#      reload→別browser context→offline outbox→reconnect→conflict解決→N3/N2進捗・aliasは
#      既存テスト群で担保。実機はPhysical Device Packetの該当行で確認）
# 5) 事前SELECT[P1]を再実行し、既存表count不変を記録
```

### 22e. stop conditions（1つでも該当したら即中止→§19 rollback判断）

1. checksum不一致 ／ 2. preflight P5/P6/P7 で衝突1件以上 ／ 3. P2の対象行数≠1
4. 適用中エラー（自動巻き戻し後、原因判明まで再適用しない）
5. post-apply matrix にFAIL ／ 6. 既存3表のcount変動 ／ 7. Andyさんのlearner_idがentitlementsに出現

### 22f. 承認文字列（どちらも有効・いずれか一方で可）

- `APPLY_SHARED_SUPABASE_MIGRATIONS`（現行の標準）
- `APPLY_STAGING_MIGRATIONS`（本パケット§21の旧表記）

いずれの文字列も無い限り、remoteへのapply・write・RLS変更は一切行わない。
