# Rollback / Backup Runbook（AI日本語コース）

生成: 2026-07-29 / 状態: **local実証済み（2026-07-29・H1）**。remoteは未実行（CEO承認後のH2）

## H1での実行結果（2026-07-29）

colima（Docker互換・管理者権限不要）＋ `supabase start` でlocal Postgresを起動し、
本書の手順を **AIコース5 migration＋draft 3本** に対して実行した。
詳細な証拠と発見（F1〜F4）は `generated/h1-local-verification.md`。

- 失敗注入: 単一トランザクション適用で部分適用ゼロを実証
- feature rollback: unit_progress撤去→security無傷→再適用→**backup復元でrow count一致（4→4）**
- security rollback: 分離実行→保護消失を実測→再適用→拒否復帰（P0001）
- ⚠️ **F1**: 全チェーンのfresh適用は `20260629`（chain外作成のblog_posts依存）で失敗する。
  local環境は下記「local環境の作り方」の手順で構築すること

## local環境の作り方（H1確立手順）

1. `colima start --cpu 2 --memory 3 --vm-type vz`
2. `supabase/config.toml` の `[db.migrations] enabled` を一時的に `false`（歴史chainの自動適用を止める）
3. `supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime`
4. AIコース5本（20260718000000〜20260726000000）→ draft（vocab_persistence→entitlements→unit_progress）の順に
   `docker exec -i supabase_db_badminton-platform psql -U postgres -d postgres -v ON_ERROR_STOP=1 -1 < <file>`
5. 終了時: `enabled = true` に必ず戻す（H2のremote db pushがskipされる事故防止）・`supabase stop`

## 分離の原則

**security rollback と feature rollback を混ぜない。**

| 種別 | 対象 | 注意 |
|---|---|---|
| security rollback | RLS policy・grants・admin_overrides保護・trigger | 進捗のrollbackと**同時に実行しない**。保護が外れたまま残る事故を防ぐ |
| feature rollback | 進捗テーブル・単元データ・アプリのdeploy | security設定には触れない |

`admin_overrides` の保護は、進捗rollbackのついでに外さないこと。

## 手順（local・Docker導入後に実行）

```bash
# 0) 環境
supabase --version
docker --version

# 1) 起動と現状記録
supabase start
supabase migration list > docs/ai-course/production/generated/migration-list-before.txt

# 2) migration前のdump（3系統を分けて取る）
supabase db dump --local -f backup/schema-before.sql --schema public
supabase db dump --local --data-only -f backup/progress-before.sql \
  --schema public  # 進捗テーブル
supabase db dump --local --data-only -f backup/entitlements-before.sql \
  --schema public  # entitlement

# 3) 適用（トランザクション内・部分適用を残さない）
supabase migration up --local

# 4) 検証
supabase db diff --local --schema public   # 期待: 差分なし
psql "$LOCAL_DB_URL" -c "\dp"              # grants
psql "$LOCAL_DB_URL" -c "select schemaname,tablename,rowsecurity from pg_tables where schemaname='public';"
psql "$LOCAL_DB_URL" -c "select tablename,policyname,cmd,roles from pg_policies where schemaname='public';"
psql "$LOCAL_DB_URL" -c "select count(*) from ai_course_vocab_item_progress;"

# 5) rollback（feature側のみ）
supabase db reset --local              # clean DBへ
supabase migration up --local --to <直前のversion>
# 再度 4) の検証を行い、row count / grants / RLS / trigger が期待どおりか確認

# 6) backupからの復元確認
psql "$LOCAL_DB_URL" -f backup/progress-before.sql
psql "$LOCAL_DB_URL" -c "select count(*) from ai_course_vocab_item_progress;"  # 2)と一致すること
```

## 実行時に必ず記録する

| 項目 | 記録先 |
|---|---|
| 実行者 / 日時 | 本書の末尾 |
| CLI version | `supabase --version` の出力 |
| 適用前後の row count | テーブルごと |
| grants（`\dp`） | before / after |
| RLS 有効状態・policy一覧 | before / after |
| trigger 一覧 | before / after |
| schema diff | `supabase db diff` の出力（空であること） |
| 各SQLの SHA-256 | `shasum -a 256 supabase/migrations/*.sql` |

## 停止条件（実行を中断する）

- schema diff が空にならない
- rollback後に RLS が無効化されている、または policy が消えている
- `admin_overrides` の保護（trigger/policy）が失われている
- backupからの復元で row count が一致しない
- 対象が共有Supabase（`APPLY_SHARED_SUPABASE_MIGRATIONS` なしでは実行しない）

## 実行記録

### 2026-07-29（H1・local）

- 実行者: autonomous-session-12（Claude Code）／ CLI: supabase 2.101.0・Docker 29.5.2 (colima)
- 適用: AIコース5 migration＋draft3本 全成功（各 `-1` 単一トランザクション）
- row count: ai_course_unit_progress backup前 4 → rollback → 再適用＋復元後 **4（一致）**
- RLS: 19表すべて rowsecurity=t／policies 40（rollback中も対象外は不変）
- trigger: ai_learners_protect_admin_overrides はfeature rollback中も維持・security rollbackで消え再適用で復帰
- 失敗注入: exit=3・probe表残存なし・表数19不変
- schema diff: `supabase db diff` はmigration履歴管理をCLIに載せていないため未使用（psql直接適用のため）。
  代替として表数・policy数・trigger有無のbefore/after比較で検証（generated/h1-local-verification.md）
- SHA-256: generated/h1-local-verification.md に記載（vocab_persistence=パケット一致 aa41ce8e…・
  entitlements=H1修正後 cb954768…・unit_progress=新規 726c59f6…）
- 対象: **localのみ**。共有Supabaseへは一切未接触（`APPLY_SHARED_SUPABASE_MIGRATIONS` 待ち）
