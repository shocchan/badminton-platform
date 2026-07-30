# Release Manifest — August 3-Learner Pilot（release candidate）

作成: 2026-07-30 ／ 状態: **release candidate（本番未反映・main未merge）**

この文書は「何を、どの状態で出そうとしているか」を1枚に固定するためのもの。
戻すときはここに書いてある値へ戻す。

---

## 1. コード

| 項目 | 値 |
|---|---|
| release branch | `feature/ai-course-learning-polish` |
| origin push | 済（`git ls-remote --heads origin` で確認可能。手元が壊れても復元できる） |
| HEAD | 下の「§7 適用ログ」の最終commitを参照 |
| main | `ca3b865`（このコースは未merge。本番はこの系統のまま） |
| mainとの差 | main から 212commits 先行（572ファイル・+141,772行） |
| release tag | `v-august-pilot-rc1`（候補。本番反映の承認時に確定させる） |

## 2. デプロイ

| 環境 | 状態 |
|---|---|
| staging | `https://staging.badminton-platform.pages.dev` — deploy `22de888b`（2026-07-30） |
| production（kawabado.com） | **未反映**。`APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE` 受領まで反映しない |
| Cloudflare自動デプロイ | 無効化済み（2026-07-17・`production_deployments_enabled=false`） |
| bundle | main `index-*.js` 590.63KB / gzip 170.08KB |

## 3. データベース（本番 project ref `jdkwijdphlkrcoiggfqw`）

### 適用したmigration（2026-07-30）

| version | name | sha256 |
|---|---|---|
| 20260728000000 | ai_course_vocab_persistence | `50cb55ae59bc13a3999cc3ee80c6be21394c67b30ac64588a9b6270486f8b405` |
| 20260728010000 | ai_course_entitlements | `e8d2f37c0cd292b948f2be079f169e55854c037e6ccac41ac184078ec7fb5e79` |
| 20260729000000 | ai_course_unit_progress | `92a5606de2efd07760e4b7fa5fe11f93b03a769c2d04666f0536c5fc383a6ee0` |

`supabase_migrations.schema_migrations`: 14 → **17**行。重複version 0。latest `20260729000000`。

### baseline row counts（migration適用**前**＝戻す目標値）

| table | rows |
|---|---|
| ai_learners | 1 |
| ai_item_progress | 12 |
| ai_learning_sessions | 24 |
| ai_session_utterances | 219 |
| ai_growth_snapshots | 4 |
| ai_usage_daily | 6 |
| ai_config | 2 |
| ai_course_invites | 1 |
| auth.users | 5 |

適用後も上記は**すべて不変**（実測で確認）。新規に増えたのは
`ai_course_entitlements` 1行（`admin_overrides.labPreview` を持つCEO検証learnerのみ）。

### 未適用のmigration（意図的にスコープ外）

- `20260726000000_ai_course_avatars_storage` — 今回の承認対象外。アバター画像用ストレージ。未適用でもコースは動く。

### rollback資産（checksum凍結・`migrationIntegrity.test.ts` が変更を検知）

| file | sha256 |
|---|---|
| rollback_20260728000000_ai_course_vocab_persistence.sql | `e323251eca3deb18bf3ac0c2d2984dae3fb9d7806d764e4fd64fdc83834c1762` |
| rollback_20260728010000_ai_course_entitlements.sql | `b68d11cf5bc6cba39c500dc6625e7785bc11bfb5aa5b0d809e1c6324ffa8a720` |
| rollback_20260729000000_ai_course_unit_progress.sql | `4b3ca07a070f64b1c2fe9eca79ba64c5476f0fed8effbd2b6dd3a8050dff6b92` |
| rollback_20260728010000_..._SECURITY_ONLY.sql | `e200274f2a12b8867dded98d62f746ee4ad3b18567836442758347875d29bcbe` |

## 4. バックアップ

- 取得: 2026-07-30 `~/ai-company/backups/kawabado/2026-07-30/`（public 38テーブル + auth_users）
- 自動: launchd `com.kawabado.supabase-backup` 毎日10:00
- 復元手順: `docs/ai-course/production/pilot-operations.md` §1

## 5. 環境変数・秘密情報の所在（値は書かない）

| 種別 | 名前 | 置き場所 |
|---|---|---|
| クライアント | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_AI_LESSON_DEMO_CODE` / `VITE_GA4_ID` / `VITE_META_PIXEL_ID` | `.env`（＋Cloudflare Pages env_vars） |
| 本番のみ | `VITE_STRIPE_PUBLISHABLE_KEY` | `.env.production` / Pages env_vars |
| サーバ | `RESEND_API_KEY` 他 | Supabase secrets（Edge Function） |
| 運用 | Supabase personal access token | `~/.supabase_backup_token`（chmod 600・表示しない） |

新しい `VITE_*` を足すときは **ローカル`.env` と Pages env_vars の両方**に入れる
（2026-07-17にCIで欠落してStripe選択肢が本番から消えた事故あり）。

## 6. 品質ゲート（2026-07-30 実測）

| 項目 | 結果 |
|---|---|
| tests | 1190 passed / 3 skipped（102ファイル中101 passed・1 skipped） |
| tsc | 0 error |
| lint | 35（29 error / 6 warning）＝既存バドミントン側由来のベースライン。AIコース領域の増分0 |
| build | 成功 |
| remote RLS matrix | R01–R27 **27/27 PASS**（本番DB・合成fixtureは撤去済み） |
| remote sync E2E | S01–S19 **19/19 PASS**（本番DB） |
| migration integrity | 14/14 PASS（checksum凍結一致） |

## 7. 適用ログ

`docs/ai-course/production/remote-apply-audit.log` に、書き込み系SQLの
時刻・結果・label・sha256 が追記される（`remote-sql.mjs` が自動記録）。

## 8. このリリースに**含まれない**もの

- main への merge
- production（kawabado.com）への deploy
- 3名への招待送信
- Stripe本番課金の開始
- `20260726000000_ai_course_avatars_storage` の適用
- 教材・ビジュアルの `human_reviewed` / `approved` 一括昇格
