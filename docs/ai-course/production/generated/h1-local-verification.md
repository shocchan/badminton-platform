# H1 Local DB実証記録（2026-07-29・session-12続き）

実行環境: macOS 15.7 (Intel・8GB) / colima v(zzvm 2CPU/3GB) / Docker 29.5.2 /
supabase CLI 2.101.0 / stack: db+kong+auth(gotrue)+rest(postgrest)+storage+mailpit+pg_meta
（studio/imgproxy/edge-runtime/logflare/vector/realtime は除外起動）

## 結果サマリ

| 項目 | 結果 |
|---|---|
| Docker環境 | ✅ colima導入（管理者パスワード不要経路）・`supabase start` 成功 |
| migration適用（AIコース5本） | ✅ 各ファイル単一トランザクションで全成功（public 0→19表・全表RLS有効） |
| 最終パケットdraft適用 | ✅ vocab_persistence＋entitlements＋unit_progress（新規）全成功 |
| チェーンfresh適用 | ❌ **実測失敗**: `20260629_blog_unlisted_status.sql` が chain外作成の `blog_posts` に依存（下記F1） |
| 失敗注入 | ✅ 2文目が失敗するSQLを `-1` 適用 → **部分適用ゼロ**（probe表が残らない・表数不変） |
| RLS/entitlement JWT matrix | ✅ **20/20 PASS**（anon/本人/他人/service_roleの全ロール・Data API実測） |
| cross-device同期 | ✅ 実Repository×実DBで conflict→決定的merge→実績の和集合維持・冪等再送・他人denied（vitest 3件） |
| feature rollback | ✅ unit_progressのみ撤去→policy/trigger無傷→再適用→**backup復元で4行→4行一致** |
| security rollback | ✅ 分離実行→保護消失を実測（learnerのadmin_overrides変更がHTTP 204で通る）→再適用→HTTP 400 P0001で拒否復帰 |

## 発見と対応（shadow検証の成果）

- **F1: migration chainがfresh環境で自己完結しない。** `supabase db reset`/fresh `start` は
  20260629で停止する（blog_posts等の初期テーブルはManagement API直接適用の歴史があり
  chain外）。→ local検証は `[db.migrations] enabled=false` で起動し、AIコース5本＋draftを
  psqlで適用する手順を確立（rollback-backup.md参照）。バドミントン側のbaseline化はコース外のP2。
- **F2: Supabaseのdefault privilegesが新テーブルへ authenticated/anon にALLを自動付与する。**
  entitlements草案は「grantを与えない」意図だったが、実測（M07/M10）で PATCH/INSERT が
  権限層を通過（RLS policy欠如が実防御になっていた）。→ **両draftに明示revokeを追加**し、
  unit_progressは「書き込みはRPCのみ」をgrant層でも強制（修正後 M07/M10 = 42501）。
- **F3: admin_overrides保護triggerが service_role の Data API 経由更新まで拒否**（M18実測・
  草案の検証注記どおり）。→ trigger条件に `role='service_role'` claim を追加（修正後 ok）。
- **F4: PostgRESTはカスタムSQLSTATE(P0409)をHTTP 500で返す。** クライアントは
  HTTPステータスではなく error.code で conflict 判定する（supabaseUnitProgressServer.tsで実装）。

## 適用済みSQLのSHA-256（local適用時点）

```
14913ddf…  20260721000000_ai_course_growth.sql
947a8a38…  20260722000000_ai_course_monthly_cap.sql
721ce50a…  20260726000000_ai_course_avatars_storage.sql
c557d77d…  20260720000000_ai_course_security.sql
（20260718000000_ai_course.sql は 00-checksums.txt 参照）
aa41ce8e44591c085395572274655ad0b7f6e1f3c085349a00857138c54ac39a  20260728000000_ai_course_vocab_persistence_DRAFT.sql（パケット記載値と一致）
cb95476835bab957ce4539082dc54b785ac90d9a260017f978864e3f45effdf3  20260728010000_ai_course_entitlements_DRAFT.sql（H1修正後・パケット更新済み）
726c59f62e755dbe08f1845d00eaef7b63d0b0e212245cfb5ed434373d712291  20260729000000_ai_course_unit_progress_DRAFT.sql（新規・H1で追加）
```

## RLS Matrix（修正後・20/20 PASS）

M01 anon ai_learners→0行（旧表はanon select grantが残存・RLSで遮断。※F2の明示revokeは新表のみ。旧表の整理はH2で提案）
M02/M21 anon 新表→42501 ／ M03-M04 本人1行・他人0行 ／ M05-M07 entitlements: 本人select可・insert/update 42501
M08 display_name自己更新ok ／ M09 admin_overrides自己更新 P0001拒否 ／ M10 unit_progress直接insert 42501
M11-M16 RPC: 本人ok・他人42501・stale P0409・冪等再送ok ／ M17 service全読 ／ M18 service admin_overrides更新ok
M19-M20 vocab表の本人/他人分離

## cross-device実証（vitest・実DB）

`src/lib/aiLesson/course/persistence/supabaseUnitProgressServer.local.test.ts`（H1_LOCAL_STATUS環境変数がある時のみ実行・リモートURL拒否ガードつき）
1. 端末A保存(v1)→端末B取得→B保存(v2)→stale端末A保存→conflict→決定的merge→v3・clearedQuestionIds和集合維持・serverProgress提示
2. 同一mutationId再送はrow_versionを進めない
3. 他人learnerへのsaveは denied・persisted=false（「保存しました」と偽らない）

## local環境の再現手順

```bash
colima start --cpu 2 --memory 3 --vm-type vz
# supabase/config.toml の [db.migrations] enabled を一時的に false へ
supabase start -x studio,imgproxy,edge-runtime,logflare,vector,realtime
# AIコース5本＋draft3本を docker exec psql -1 で順に適用（詳細: rollback-backup.md）
# 終了時: enabled=true へ戻す・supabase stop（volumeは保持される）
```

生の証拠ログ: session scratchpad `h1-evidence/`（00-checksums / 02-after-schema /
03-injection / 05-rls-matrix-after-fix / 07-feature-rollback / 08-security-rollback）
