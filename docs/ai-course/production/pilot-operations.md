# Pilot Operations（3名先行提供の運用・監視・障害対応）

作成: 2026-07-30 ／ 対象: 最大3名の招待制Pilot ／ 責任者: しょっちゃん（一次・二次ともに本人）

このドキュメントは**実行して確かめた手順だけ**を書く。未検証の手順は「未検証」と明記する。
コマンドは全部このリポジトリのルートで実行する。

---

## 0. 毎日やること（所要2分）

```bash
node scripts/ai-course/remote-sql.mjs --file scripts/ai-course/daily-ops-dashboard.sql --label daily-ops
```

出力は6セクション（learners / lessons / sync / ai_usage / support / security / review）。
下の「見方」に外れる値が出たときだけ動く。全部想定内なら何もしなくてよい。

### 見方（この値を外れたら対処する）

| 指標 | 想定 | 外れたときの意味と対処 |
|---|---|---|
| `lessons.abandoned_24h` | 0〜1 | 2以上: 会話が途中で落ちている疑い。`support.issue_reports_24h` と合わせて確認 |
| `lessons.error_code_24h` | 0 | 1以上: セッションにエラーコードが記録された。§4の調査へ |
| `sync.unit_progress_updated_24h` | 学習があった日は1以上 | 学習しているのに0: 同期が落ちている。§5の同期障害へ |
| `ai_usage.cost_usd_this_month` | < 40（警告閾値） | 40超: `ai_config.usage_limits` の上限を確認。1人あたり月80回が既定 |
| `ai_usage.sessions_this_month` | 3名なら〜240 | 想定外に多い: 特定learnerの上限を絞る（§3-B） |
| `support.issue_reports_unresolved` | 0 | 1以上: 内容を確認して対応、対応後に `resolved=true` へ |
| `support.contacts_new` | 0 | 1以上: 問い合わせ未返信。**2026-07-30時点で5件・最古 2026-07-06** |
| `security.learners_with_admin_overrides` | 1（CEO検証用） | 増えていたら誰が付与したか確認。learner本人は付与できない（DB triggerで拒否・実測済み） |
| `security.login_locked_now` | 0 | 1以上: ログイン試行ロック中。本人からの連絡があれば §3-D で解除 |
| `security.invites_usable` | 1以上 | 0: 新規サインアップ不可。招待コードの `is_active` / `used_count` / `expires_at` を確認 |

> ⚠️ `max_uses is null` は**無制限**の意味（`20260720000000_ai_course_security.sql:23`）。
> `used_count < max_uses` だけで判定するとNULLで常に0件になり誤警報する。上のSQLは修正済み。

---

## 1. バックアップ

### 取得（自動＋手動）

- **自動**: macOS launchd `com.kawabado.supabase-backup` が毎日10:00に実行。
  出力 `~/ai-company/backups/kawabado/YYYY-MM-DD/`（public全表 + auth_users）
- **手動**（リリース前後・障害前に必ず）:

```bash
./scripts/backup-supabase.sh
```

**2026-07-30 実行済み**: public 38テーブル + auth_users（5行）を取得。
migration適用**前**の状態を保存してある。

### 復元（Freeプランは日次バックアップ機能が無いのでこのJSONが唯一の頼り）

特定テーブルだけ戻す手順:

```sql
-- 該当日のJSONを読み、jsonb_populate_recordset でINSERT（ドル引用符のタグにバックスラッシュを付けない）
-- ⚠️ identity列（GENERATED ALWAYS）を持つ表は overriding system value が必須
--   （2026-07-31のリハーサルで ai_session_utterances が実際に失敗して発覚）
insert into public.<table> overriding system value
select * from jsonb_populate_recordset(null::public.<table>, $tag$<JSON配列>$tag$::jsonb);
```

全量（AIコース側）は自動化済み:

```bash
node scripts/ai-course/restore-rehearsal-local.mjs 2026-07-30
```

### 全量restore rehearsal 結果（2026-07-31・隔離local DB・PASS 21/21）

- auth.users 5 → AIコース系18テーブル（learners 1 / sessions 24 / utterances 219 / 新5表含む）まで
  **実際の日次backup JSONから正準手順どおり復元**し、全テーブルでrow countがbackupと一致
- catalog（policy 11 / trigger 1 / RPC 1）健在・join整合smoke PASS
- 発見した欠陥2件は手順とスクリプトに反映済み（identity列 / backupがmigration前だった→取り直し済み）
- 制約（正直な記録）: auth.usersはbackupに含まれる範囲のみ（passwordハッシュなし＝learnerはOTPで再ログイン可能なので実害なし）。
  バドミントン側テーブルはlocalに旧スキーマchainが立たないため対象外（部分復元の実績 2026-07-09 で代替）

---

## 2. リリース資産（戻し先）

| 資産 | 値 |
|---|---|
| release branch | `feature/ai-course-learning-polish`（origin へ push 済み＝手元が壊れても復元可） |
| release manifest | `docs/ai-course/production/release-manifest-august-pilot.md` |
| migration checksums | `src/lib/aiLesson/course/persistence/migrationIntegrity.test.ts` に凍結（変更で落ちる） |
| baseline row counts | 同manifest §3（適用前の実測値） |
| 直前のCloudflare deploy | Cloudflare Pages → badminton-platform → Deployments から任意のdeployを **Rollback** |
| 本番の現在 | このコースは**本番未反映**。本番は `main`(ca3b865)相当のまま |

### Cloudflare を前のdeployへ戻す

Pages のダッシュボードで対象deployの「Rollback to this deployment」を押す。
コマンド版（`wrangler pages deployment` の rollback）は**未検証**なのでダッシュボードを使う。

> ⚠️ GitHub連携の自動デプロイは 2026-07-17 に無効化済み（`production_deployments_enabled=false`）。
> deployは `scripts/deploy-staging.sh` / `scripts/deploy-production.sh` のみ。

---

## 3. 止め方（影響範囲の小さい順）

**いずれも「3名だけ」を止められる。全体を落とす必要はない。**

### A. 特定learnerの利用を止める（最小・サーバ側で強制）

```bash
# <learner-id> のみ停止。他のlearnerとバドミントン側には影響しない
node scripts/ai-course/remote-sql.mjs --write --label "suspend learner" \
  --sql "update public.ai_learners set is_active = false where id = '<learner-id>'::uuid"
```

**enforcementの実測根拠（3箇所で独立にブロックされる）**:
- `20260720000000_ai_course_security.sql:193` セッション開始RPCが拒否
- `20260722000000_ai_course_monthly_cap.sql:59` 使用量チェックが拒否
- `supabase/functions/ai-lesson-token/index.ts:155` 音声トークン発行が `learner_suspended` を返す

解除は `is_active = true` に戻すだけ。学習データは消えない。

### B. AI会話だけ止める（学習教材は使えるまま）

```bash
# 特定learnerの月次上限を0にする（admin_overrides優先ロジックを使う）
node scripts/ai-course/remote-sql.mjs --write --label "cap learner to zero" \
  --sql "update public.ai_learners set admin_overrides = admin_overrides || '{\"monthlyMaxSessions\":0}'::jsonb where id = '<learner-id>'::uuid"
```

全員のAI会話を止める場合は `ai_config.usage_limits` の `monthly_max_sessions` を 0 にする。

### C. 新規サインアップだけ止める

```bash
node scripts/ai-course/remote-sql.mjs --write --label "disable invites" \
  --sql "update public.ai_course_invites set is_active = false"
```

### D. ログイン試行ロックの解除（本人から「入れない」と連絡が来たとき）

```bash
node scripts/ai-course/remote-sql.mjs --write --label "clear login lock" \
  --sql "delete from public.login_attempts where email = '<email>'"
```

### E. 端末内保存のみへフォールバック（同期を止める）

サーバ側で `ai_course_unit_progress` が読めなくなると、クライアントのprobeが自動で
`local_only` に落ちて**端末内保存だけで学習が続く**（学習は止まらない）。
意図的に落とす場合は select 権限を外す:

```bash
node scripts/ai-course/remote-sql.mjs --write --label "sync off (fallback to local)" \
  --sql "revoke select on public.ai_course_unit_progress from authenticated"
```

戻すときは `grant select on public.ai_course_unit_progress to authenticated;`。
**probeのfail-safe動作はテスト済み**（`syncedUnitStorage.test.ts` の9件）。
この revoke 自体の本番実行は未検証（テストとlocalでの等価動作で担保）。

---

## 4. Rollback（DB）

feature rollbackで失うデータは実測済み（2026-07-30時点）:

| rollback | 失う行 | 備考 |
|---|---|---|
| `rollback_20260729000000_ai_course_unit_progress.sql` | unit_progress 0行 | 学習が進んでいれば増える。実行前に必ずbackup |
| `rollback_20260728010000_ai_course_entitlements.sql` | entitlements 1行 | `ai_learners.admin_overrides` から再生成できる |
| `rollback_20260728000000_ai_course_vocab_persistence.sql` | vocab関連 0行 | 同上 |
| `..._entitlements_SECURITY_ONLY.sql` | — | **admin_overrides保護を外す**。明示決定時のみ |

- 対象オブジェクトが本番に実在することを確認済み（table 5 / function 2 / trigger 1）
- 新5表を参照する **view は0件** → DROPが予期せぬ連鎖をしない
- feature rollbackは保護trigger/functionを落とさない（`migrationIntegrity.test.ts` で恒久化）

### rollback drill 結果（2026-07-30・localクリーンDBで実測・PASS）

| 手順 | 結果 |
|---|---|
| 1. 3本を適用 | 5テーブル作成・保護trigger 1 |
| 2. feature rollback ×3 | 5テーブル削除・**admin_overrides保護のtriggerとfunctionは残存**・`ai_learners`健在 |
| 3. 再適用 | 5テーブル・11policy・RPC すべて復旧 |
| 4. SECURITY_ONLY rollback | 設計どおり保護triggerが外れる（=明示決定時のみ使う経路） |

drill後に `supabase/config.toml` を復元済み（`git diff` 空）。

> **本番に対するDROPの実行リハーサルは行っていない**（トランザクションで包む形であっても
> 本番へDROPを流すのは避けた）。本番向けの担保は「上のlocal drill（同一checksumのファイル）」＋
> 「本番での対象実在・依存view 0 の確認」の2点。

---

## 5. 障害対応（Incident Runbook）

1. **検知** — 本人からの連絡 / `daily-ops-dashboard` の異常値 / `ai_issue_reports`
2. **重大度**
   - S1: 全員が学習できない・データ消失の疑い
   - S2: 1人が学習できない・AI会話が失敗し続ける
   - S3: 表示崩れ・軽微な誤り（当日対応でよい）
3. **影響learnerの特定** — `select id, is_active from public.ai_learners`（IDのみ扱う）
4. **新規ログインを止める** — §3-C（招待無効化）
5. **AI会話を止める** — §3-B
6. **該当learnerを止める** — §3-A
7. **端末内保存へフォールバック** — §3-E（学習は続けられる状態を保つ）
8. **DB rollback** — §4（**必ず先に `./scripts/backup-supabase.sh`**）
9. **learnerへ連絡** — §6のテンプレ
10. **復旧確認** — `daily-ops-dashboard` を再実行し、該当指標が想定内へ戻ったことを確認
11. **記録** — `docs/ai-course/production/incident-response.md` へ日時・原因・対処を追記
12. **振り返り** — 同じことが起きない手当て（テスト追加 or 手順修正）をその日のうちに1つ入れる

---

## 6. learnerへの連絡テンプレ（ja / zh）

**障害のお知らせ（ja）**

> ご不便をおかけしています。現在、学習画面の一部で不具合が発生しています。
> 学習の記録は失われていません。復旧までは（前の画面／別の端末）でご利用ください。
> 復旧しましたら、このメールアドレスからご連絡します。 — info@kawabado.com

**故障通知（zh）**

> 非常抱歉给您带来不便。目前学习页面的部分功能出现故障。
> 您的学习记录没有丢失。修复前请使用（上一个页面／其他设备）。
> 修复完成后我们会通过这个邮箱通知您。 — info@kawabado.com

問い合わせ窓口は学習アプリ内では **info@kawabado.com のみ**（WeChatは購入前LPだけ）。

---

## 7. まだ埋まっていないもの（正直な記録）

| 項目 | 状態 |
|---|---|
| ~~バックアップの全量復元リハーサル~~ | **完了（2026-07-31）**: AIコース側全テーブル 21/21 PASS（§1参照） |
| 本番へのDROP実行リハーサル | 意図的に未実施（§4の理由。localクリーンDBでのdrillはPASS） |
| Cloudflare rollbackのコマンド実行 | 未検証（ダッシュボード操作で代替） |
| アラート（能動通知） | **半自動**: `daily-ops-check.mjs` が閾値を機械判定し、異常時はmacOS通知＋log。synthetic eventで検出実測済み（挿入→検出→厳密ID撤去）。launchd定義は `com.kawabado.daily-ops-check.plist`（**導入はCEOの1コマンド・未導入**）。メール通知は未実装 |
| 手動監視の運用値 | 確認: 毎朝10:05（backup 10:00の直後）／未確認時: 翌朝まとめて確認（Pilot 3名なら許容）／異常基準: §0の表／対応目標: S1=当日・S2=24h・S3=72h |
| token | `~/.supabase_backup_token` 600・git外・log露出0を実測確認。personal access tokenのため無期限＝**四半期ごとにダッシュボードでrotate推奨**（次回: 2026-10-01） |
| 二次対応者 | 不在（しょっちゃん1人が単一障害点） |
