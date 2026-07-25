# AI日本語コース 本番公開チェックリスト

Andyさん向け12週コース（`/:lang/ai-course`）を本番へ出す前に、上から順に確認する。
**未チェックの項目が1つでも残っている状態で本番公開しない。**

このコースは既存の kawabado 本体（決済・通常会員・既存管理画面）とは独立している。
本番公開作業で既存機能に触れないこと。

---

## 0. 前提

| 項目 | 値 |
|---|---|
| リポジトリ | `~/badminton-platform` |
| ブランチ | `feature/ai-japanese-demo` |
| Supabase プロジェクト ref | `jdkwijdphlkrcoiggfqw` |
| staging URL | https://staging.badminton-platform.pages.dev |
| 本番 URL | https://kawabado.com |

デプロイは **staging で確認 → CEO承認 → 本番** の順（直接本番へ出さない）。

---

## 1. 本番環境変数（Cloudflare Pages）

コースが増やした**フロント側の環境変数はゼロ**。招待コードはフロントに置かない設計に変更したため、
`VITE_AI_COURSE_INVITE` は**不要（設定してはいけない）**。

- [ ] `VITE_SUPABASE_URL` — 既存
- [ ] `VITE_SUPABASE_ANON_KEY` — 既存
- [ ] `VITE_STRIPE_PUBLISHABLE_KEY` — 既存（決済用。コースとは無関係）
- [ ] `VITE_AI_LESSON_DEMO_CODE` — 既存のデモページ（`/:lang/ai-lesson-demo`）用のみ
- [ ] `VITE_AI_COURSE_INVITE` が**設定されていない**ことを確認（残っていたら削除）

```bash
# 確認
npx wrangler pages project list
# ダッシュボード: Cloudflare > Pages > badminton-platform > Settings > Environment variables
```

---

## 2. Supabase Secrets（Edge Functions）

```bash
supabase secrets list --project-ref jdkwijdphlkrcoiggfqw
```

- [ ] `OPENAI_API_KEY` — 設定済み
- [ ] `AI_LESSON_DEMO_CODE` — 既存デモページ用
- [ ] `AI_LESSON_REALTIME_MODEL` — 任意（未設定なら `gpt-realtime-2.1`）
- [ ] `AI_LESSON_REPORT_MODEL` — 任意（未設定なら `gpt-4o-mini`）

`SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` は
Edge Functions ランタイムが自動で注入するため、手動設定は不要。

**招待コードは Secret ではなく DB（`ai_course_invites` 表）で管理する。**
値をこのファイルやコミットに書かないこと。

---

## 3. Migration

```bash
supabase db push --project-ref jdkwijdphlkrcoiggfqw
```

- [ ] `20260718000000_ai_course.sql` 適用済み
- [ ] `20260720000000_ai_course_security.sql` 適用済み
- [ ] 適用後、以下が存在することを確認

```sql
-- 表
select table_name from information_schema.tables
 where table_schema='public' and table_name like 'ai_%' order by 1;
-- 期待: ai_admins, ai_config, ai_course_invites, ai_course_signup_grants,
--       ai_feedback, ai_issue_reports, ai_item_progress, ai_learners,
--       ai_learning_sessions, ai_notification_queue, ai_otp_throttle,
--       ai_session_utterances, ai_usage_daily

-- 関数
select routine_name from information_schema.routines
 where routine_schema='public' and routine_name like 'ai_%' order by 1;
-- 期待: ai_admin_delete_utterances, ai_check_otp_throttle, ai_consume_signup_grant,
--       ai_delete_my_utterances, ai_delete_test_learners, ai_email_has_learner,
--       ai_is_admin, ai_my_learner_ids, ai_purge_expired_utterances,
--       ai_redeem_invite, ai_release_stale_sessions, ai_start_session
```

- [ ] 既存テーブル（`members` / `activities` / 決済系 / `blog_posts`）に変更が無いことを確認

---

## 4. 招待コードの投入

**本番の招待コードは、このリポジトリに書かない。** SQL エディタから直接入れる。

```sql
-- 本番用（Andyさん専用。メール制限つき・1回だけ使える例）
insert into public.ai_course_invites (code, label, max_uses, allowed_email, expires_at)
values ('<ここに実際のコード>', 'Andy 本番', 1, '<Andyさんのメール>', now() + interval '90 days');

-- staging受入テスト用（is_test = true。作られた learner は一括削除できる）
insert into public.ai_course_invites (code, label, max_uses, is_test)
values ('<stagingテスト用コード>', 'staging acceptance test', 20, true);
```

- [ ] 本番用コードを投入した（値は1Password等に保管し、チャットに残さない）
- [ ] staging用テストコードは `is_test = true` で作った
- [ ] 旧 `ai_config.signup_invite_code` が削除されていることを確認
      （migration が自動で `ai_course_invites` へ移し、行を削除する）
- [ ] **移行された旧コード `andy-course-2026` を無効化する**

```sql
update public.ai_course_invites set is_active = false
 where label = 'migrated from ai_config';
```

- [ ] ビルド成果物に招待コードが含まれないことを確認

```bash
npm run build && grep -r "andy-course-2026" dist/ ; echo "exit=$? (1なら含まれていない=OK)"
```

---

## 5. Edge Functions のデプロイ

```bash
supabase functions deploy ai-course-auth  --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
supabase functions deploy ai-lesson-token --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
supabase functions deploy ai-lesson-report --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
```

`--no-verify-jwt` は必須。JWT検証は関数内で自前に行っている
（初回ログイン前の `ai-course-auth` はJWTを持たないため、プラットフォーム側の検証は使えない）。

- [ ] 3つともデプロイ成功
- [ ] `supabase functions list` でバージョンが上がったことを確認

---

## 6. セキュリティ確認（実際にAPIを叩く）

`$URL` = `https://jdkwijdphlkrcoiggfqw.supabase.co`

- [ ] **招待コードなしで登録できない**

```bash
curl -s -X POST "$URL/functions/v1/ai-course-auth" \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com"}'
# 期待: {"error":"invalid_invite"} （403）
```

- [ ] **でたらめな招待コードが通らない**

```bash
curl -s -X POST "$URL/functions/v1/ai-course-auth" \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com","code":"wrong-code"}'
# 期待: {"error":"invalid_invite"} （403）
```

- [ ] **OTPの連続送信が止まる**（同じメールで2回続けて叩く）

```bash
# 2回目は 429 {"error":"otp_cooldown","retryAfter":<秒>} になること
```

- [ ] **JWTなしでOpenAIトークンが取れない**

```bash
curl -s -X POST "$URL/functions/v1/ai-lesson-token" \
  -H 'Content-Type: application/json' \
  -d '{"sessionId":"00000000-0000-0000-0000-000000000000","plan":{}}'
# 期待: {"error":"unauthorized"} （401）
```

- [ ] **他人のセッションIDでトークンが取れない**
      （テストlearnerでログインし、別learnerのセッションIDを指定 → 403 `forbidden`）
- [ ] **一般ユーザーが管理画面を開いても拒否される**
      （`ai_admins` に無いメールでログイン → `/ja/ai-course/admin` が「権限がありません」表示）
- [ ] **停止中のlearnerがレッスンを開始できない**
      （管理画面で「利用を停止」→ 学習ホームで開始 → `learner_suspended`）
- [ ] **ログアウト後にキャッシュだけで個人情報が出ない**
      （ログアウト → 再読み込み → ログイン画面。localStorage に残る進捗キャッシュだけでホームが出ないこと）

---

## 7. 利用制限（サーバー側強制）

`ai_config.usage_limits` の値で制御する（既定: 1日5回 / 1日20分 / 1回4分）。

```sql
select value from public.ai_config where key = 'usage_limits';
```

- [ ] 1日の上限まで使うと `daily_session_limit` で開始できない
- [ ] 2つのタブで同時に開始しようとすると `session_already_active` で片方が弾かれる
- [ ] レッスン中にブラウザを強制終了 → 15分後に再度開始できる（永久ロックしない）
- [ ] ページを更新しただけでは利用回数が増えない

---

## 8. 音声レッスン（実機での確認が必要）

- [ ] ゆい先生が最初に話し始める
- [ ] 生徒の発話途中で返答してこない（`silence_duration_ms: 850`）
- [ ] 生徒の声を拾う（`threshold: 0.7`）
- [ ] AI音声が二重に再生されない
- [ ] AIの返答中でも、はっきり話せば割り込める（`interrupt_response: true`）
- [ ] 最大4分で必ず終わる
- [ ] `finish_lesson` が呼ばれてレポート画面へ自動遷移する
- [ ] 終了後にマイクが解放される（ブラウザのマイクインジケータが消える）
- [ ] 「戻る」操作の後に音声が続かない
- [ ] 接続エラー時にテキストモードへ切り替えられる

---

## 9. レポート

- [ ] 生徒が言っていない文が「言えた」と書かれていない
- [ ] ゆい先生のお手本が生徒の発話として扱われていない
- [ ] 訂正が最大1〜2個に収まっている
- [ ] 同じセッションでレポート画面を開き直しても内容が変わらない・消えない
- [ ] Edge Function を止めた状態でもローカル版レポートが表示される

---

## 10. 復習

- [ ] 新規完了の翌日にホームで復習が出る
- [ ] 復習成功で次回が3日後 → 7日後 → 30日後と伸びる
- [ ] 復習失敗で状態が下がらず、追加復習が入る
- [ ] 期限超過の復習が最優先で出る
- [ ] 週の5回目が「週間総合実践」になる

自動テストで検証済み: `npm test`（56件）。実機では上の表示側を確認する。

---

## 11. 中国語版

- [ ] `/zh/ai-course` の全画面が自然な簡体字（直訳調でない）
- [ ] 学習対象の日本語表現は日本語のまま表示されている
- [ ] エラーメッセージ・上限メッセージも中国語になっている

---

## 12. PWA・iPhone実機

- [ ] `/zh/ai-course` をSafariで開き、ホーム画面に追加できる
- [ ] ホーム画面から起動すると standalone（アドレスバーなし）で開く
- [ ] 起動時のURLが `/zh/ai-course` になっている
- [ ] **ホーム画面版で改めてログインが必要になる場合がある**（iOSはSafariと保存領域が分かれることがある）
      → Andyさんへ事前に伝えるか、ホーム画面追加後にログインしてもらう
- [ ] ホーム画面版でマイク許可が出る／音声レッスンが動く
- [ ] レッスン終了後にマイクが解放される
- [ ] 375px幅で崩れがない

---

## 13. デプロイ

```bash
npm run build:staging   # staging
npm run build           # 本番
```

- [ ] TypeScript成功（`npm run build` が通ること。`tsc --noEmit` だけでは不十分）
- [ ] ESLint成功
- [ ] `npm test` 全件成功
- [ ] staging へ反映しCEOが確認済み
- [ ] 本番へデプロイ

---

## 14. 公開後

- [ ] 受入テストで作ったテストlearnerを削除
      （管理画面 →「テスト用生徒データを一括削除」、または `select public.ai_delete_test_learners();`）
- [ ] staging用テスト招待コードを無効化

```sql
update public.ai_course_invites set is_active = false where is_test;
```

- [ ] Andyさんへ渡すURL: `https://kawabado.com/zh/ai-course`
- [ ] 招待コードは別経路（WeChat等）で伝える。URLと同じメッセージに書かない

---

## 15. コスト監視

- [ ] OpenAI の残高・使用量を確認 https://platform.openai.com/usage
- [ ] 想定コスト: 1レッスン約3分 ≒ $0.2〜0.3、1日5回上限 ≒ $1.5/日、月 ≒ $45 が理論上の最大
      （実際は週5回想定なので月 $10〜15 程度）
- [ ] `ai_config.usage_limits.monthly_cost_warn_usd`（既定15）を超えていないか、
      月1回 `ai_usage_daily` を確認

```sql
select sum(estimated_cost_usd) as usd, date_trunc('month', usage_date) as month
  from public.ai_usage_daily group by 2 order by 2 desc;
```

- [ ] OpenAI ダッシュボードで使用量上限（Usage limits）を設定しておく

---

## 16. ロールバック

問題が起きたときの戻し方。

**フロントを戻す**

```bash
# Cloudflare Pages のダッシュボードで直前のデプロイを Rollback
# もしくは直前のコミットで再ビルド・再デプロイ
git log --oneline -5
git checkout <直前のコミット> && npm run build
```

**コースだけ止める（既存サイトは動かしたまま）**

```sql
-- 全learnerを停止 → レッスン開始が learner_suspended で止まる
update public.ai_learners set is_active = false;
-- 新規登録も止める
update public.ai_course_invites set is_active = false;
```

**Edge Function を戻す**

```bash
# 直前バージョンのソースへ戻して再デプロイ
supabase functions deploy ai-lesson-token --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
```

**migration を戻す**
`20260720000000_ai_course_security.sql` は追加のみで既存テーブルを壊さないが、
`ai_learning_sessions` の INSERT ポリシーを変更している。戻す場合:

```sql
drop policy if exists ai_learning_sessions_insert on public.ai_learning_sessions;
create policy ai_learning_sessions_insert on public.ai_learning_sessions for insert to authenticated
  with check (learner_id in (select public.ai_my_learner_ids()) or public.ai_is_admin());
```

- [ ] ロールバック手順を実行できる状態か確認した（本番作業前に読んでおく）
