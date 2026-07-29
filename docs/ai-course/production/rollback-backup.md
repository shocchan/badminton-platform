# Rollback / Backup Runbook（AI日本語コース）

生成: 2026-07-29 / 状態: **draft（未実行）**

## 重要: 本セッションでの実行可否

`supabase` CLI は導入済み（v2.101.0）だが、**Docker が本機に未インストールのため
`supabase start`（local Postgres）を起動できず、migration適用・rollback・
grants/RLS検証を「実行」できていない**。

したがって本書は **手順書であり、実行済みの証拠ではない**。
Production GO Matrix 上でも `rollback / backup` は **fail（未実証）** のままとする。

実行に必要なもの:
- Docker Desktop（または互換ランタイム）
- `supabase start` が通ること
- 実行後に本書へ「実行日・row count・grants・RLS・schema diff」を追記

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

（未実行。Docker導入後に追記する）
