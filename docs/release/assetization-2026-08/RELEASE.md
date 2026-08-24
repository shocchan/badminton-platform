# リリース手順 — assetization-2026-08

- ブランチ: `release/assetization-2026-08`（worktree `~/badminton-sales`）
- 分岐元: `c61150931997a2c6e7b03fdd09a5f6b3e95e4bee`
- wild-flow: `feature/assetization-2026-08`（worktree `~/wildflow-platform`）
- **本番反映は未実施。** 下の 🚨 を解消するまで出さない。

---

## 🚨 出す前に必ず解消すること（release blocker）

### BLOCKER-1: 本番に「コミットされていないコード」が入っている

本番は **2026-08-24 14:15:11** に再デプロイされている（`docs/PRODUCTION_STATE.txt`）。
commit は `c611509` のままなのに asset hash が `index-DnQ4U3dQ.js` → `index-CRKUKsq9.js` に変わった。
＝**作業ツリーの未コミット変更からビルドされた。**

本番にしか無いもの（`~/badminton-aicourse` の未コミット作業）:

```
 M src/components/ai-course/adventure/AdvShell.tsx        (+25 -2)
 M src/lib/aiLesson/course/adventure/advProfile.ts        (+7)
 M src/lib/aiLesson/course/adventure/advTypes.ts          (+8)
 M scripts/ai-course/data/protected-learners.json         (+4 -1)
?? src/components/ai-course/adventure/AdvPersonalPackRunner.tsx
?? src/components/ai-course/adventure/advPersonalPackRunner.test.tsx
?? src/lib/aiLesson/course/adventure/personal/            (advPersonalPack.ts / .test.ts)
?? scripts/ai-course/issue-personal-pack.mjs
?? scripts/ai-course/render-personal-pack-shots.tsx
```

中身は **「自分の文章で復習（個人パック）」** という新機能（先生が発行した人だけに出る、
本人の作文から作った表現・漢字の読みの復習）。

**このリリースは `c611509` 基点なので、そのまま出すとこの機能が本番から消える。**

安全な順序:

1. `~/badminton-aicourse` の作業を**先にコミットする**（作業者本人が行う。私は触っていない）
2. `release/assetization-2026-08` をその上に rebase するか、当該コミットを cherry-pick する
3. `npm run build` → 全テスト → staging → 本番

保全済みのパッチ: `docs/release/assetization-2026-08/production-only/`
（`tracked-changes.patch` ＋ 未追跡ファイルのコピー。`~/badminton-aicourse` は1バイトも変更していない）

### BLOCKER-2: 1か月プランの原価率が自ら定めたゲートを超える

`planAiBudget.test.ts` の「公開中の全プランが、上限まで使われても黒字」が**落ちている**。

```
1か月 AI自学プラン は決めた原価率の範囲に収まっている
  expected 0.483624966442953 to be less than or equal to 0.45
```

赤字ではない（原価率48.4%＝粗利51.6%）。落ちているのは**自分で決めた45%という規律**。
テストを緩めずに事実として上げる。選択肢（数字は実測）:

| 案 | 変更 | 原価率 | 商品説明への影響 |
|---|---|---|---|
| A | `textSessionsPerDay` 8 → 6 | 0.447 ✅ | 「AIテキスト会話1日8回」→6回 |
| B | `voiceSessionsTotal` 10 → 8 | 0.417 ✅ | 「音声会話 月10回」→8回 |
| C | `maxAiCostRatio` 0.45 → 0.49 | ✅ | なし（規律を緩める） |
| — | 現状維持 | 0.484 ❌ | テストが落ちたまま出荷 |

推奨は **A**。実利用の平均は上限の1/3程度（`ai_usage_daily` 実測で1人平均13.7分）なので、
上限を8→6にしても実際に届けている価値はほぼ変わらず、45%の規律が戻る。
ただし**商品説明の変更＝CEO判断**なので、私は何も変えていない。

参考: もし監査実測の `$0.069/回` が正しかった場合（＝本番が gpt-4o で走っていた場合）、
1か月プランは原価率1.37で**赤字**になる。破綻境界は `$0.0444/回`。
どちらだったかは当時の記録にモデル名が無いので確定できない。それを確定させるのが今回の `model` 列。

---

## デプロイ手順（BLOCKER 解消後）

### 1. DB migration（本番＝staging と同一プロジェクト。適用は production への変更）

**この順序で。**

| # | ファイル | 何をするか | 既存データへの影響 |
|---|---|---|---|
| 1 | `20260824100000_entries_source.sql` | `entries.source` 追加（nullable） | なし（既存22行は NULL） |
| 2 | `20260824110000_activity_entries_contact.sql` | `activity_entries.email` / `user_id` 追加＋列単位GRANT＋user_id束縛トリガ | なし（既存166行は NULL。バックフィルしない） |
| 3 | `20260824120000_admin_ops_payment_and_contacts.sql` | `admin_set_entry_payment` / `admin_list_contacts` / `admin_set_contact_status`＋contacts の RLS 締め | contacts の読み取り権限が authenticated 全員 → 管理者のみに変わる |
| 4 | `20260824130000_mail_delivery_state.sql` | `ai_course_mail_log` に状態列追加＋`mail_job_runs`＋`ai_mail_health()` | `ai_course_mail_log` は0行なので影響なし。**一意制約は触っていない** |
| 5 | `20260824131000_event_reminder_cron.sql` | `event-reminder-daily` を 09:00 UTC（18:00 JST）に登録 | なし |
| 6 | `20260824140000_ai_course_access_extend.sql` | `ai_course_access_grants`＋`ai_plan_rank()`＋`ai_grant_purchase_access()`＋status の CHECK 拡張 | `ai_course_access` の既存11行を**1行も更新しない** |
| 7 | `20260824150000_ai_usage_events.sql` | `ai_model_prices` / `ai_usage_events` / 記録RPC / `ai_cost_summary()` | 既存 `ai_record_usage` は無改変 |

各ファイルに `.rollback.sql` が併設されている。
**適用前に `scripts/backup-supabase.sh` を1回走らせる**（1日2回の自動バックアップとは別に、直前の状態を取る）。

⚠️ migration は**一度もローカル実行していない**（Docker が無く、本番適用は禁止のため）。
構文は精査済みだが、実行検証は未了。**staging（＝同一プロジェクト）で1本ずつ適用し、
各ファイル末尾のコメントにある確認SQLを実行すること。**

### 2. Edge Function のデプロイ

```
supabase functions deploy ai-course-lifecycle-mails
supabase functions deploy event-reminder --no-verify-jwt
supabase functions deploy ai-course-stripe-webhook
supabase functions deploy ai-course-checkout
supabase functions deploy ai-course-purchase-status
supabase functions deploy ai-lesson-chat
supabase functions deploy ai-lesson-report
supabase functions deploy ai-lesson-translate
supabase functions deploy ai-lesson-token
```

**メールは先に dry-run で目視する。**

```
supabase secrets set MAIL_DRY_RUN=true
curl -X POST "$SUPABASE_URL/functions/v1/event-reminder" -H "x-cron-secret: $SECRET" -d '{"dryRun":true}'
```

`detail[]` に「誰に・どの開催回が・いつ」が出る。確認後に `MAIL_DRY_RUN` を外す。

⏰ **期限あり**: 購入後フォローメールの唯一の対象は 2026-08-19 に体験終了済み。
`MAX_EVENT_AGE_DAYS = 14` のガードがあるため、**2026-09-02 を過ぎると「古すぎる」として送られなくなる**。

### 3. フロントの本番デプロイ

```
./scripts/deploy-staging.sh     # まず staging
# → 目視確認（下記）
./scripts/deploy-production.sh  # 本番
```

staging で必ず見ること:

1. トップと大会詳細で**一瞬の文字のちらつきが無いか**（プリレンダ本文を React が置き換える瞬間）
2. `/zh/` が中国語で表示されるか
3. `/ja/tokushoho` `/ja/privacy` `/ja/terms` が開くか
4. 通常活動の申込が**メール未入力でも通るか**（これが最重要）
5. 大会の申込が通るか（`entries.source` の migration 適用前でも通る保険が入っているが、両方確認）
6. 管理画面に「特典登録」「問い合わせ」タブが出て、入金列が見えるか

---

## ロールバック手順

### フロント
```
cd ~/badminton-aicourse            # 本番デプロイ元
git checkout c611509               # ただし BLOCKER-1 の未コミット作業が消える点に注意
npm run build && ./scripts/deploy-production.sh
```
より安全なのは Cloudflare Pages のダッシュボードから**直前のデプロイへ Rollback** すること
（未コミット作業を含んだビルドがそのまま戻る）。

### DB
`supabase/migrations/*.rollback.sql` を**適用の逆順**で実行する（7 → 1）。
`20260824120000` の rollback は contacts の RLS を元の `TO authenticated USING (true)` に戻すので、
**戻すと一般ログインユーザーが問い合わせ全文を読める状態に戻る**ことを承知の上で行う。

### Edge Function
`supabase functions deploy <name>` を `c611509` のソースで再実行する。
`event-reminder` は新規なので `supabase functions delete event-reminder`。
cron は `20260824131000_event_reminder_cron.rollback.sql` で外す。

### 教材の門
環境変数 `AI_COURSE_ASSET_GATE` を消すだけで即座に無効化される（コード変更不要・再デプロイ不要）。

---

## CEO しかできない作業

| # | 作業 | どこで | なぜ |
|---|---|---|---|
| 1 | `~/badminton-aicourse` の未コミット作業をコミット | ローカル | BLOCKER-1。これが最優先 |
| 2 | 1か月プランの原価率の判断（A/B/C） | — | BLOCKER-2 |
| 3 | **Stripe で Alipay / WeChat Pay を有効化** | Stripe ダッシュボード → 設定 → 支払い方法 → Alipay / WeChat Pay を「有効」に申請（本人確認が必要） | 軸1のターゲットが中国語話者なのに決済がカードのみ。**コード変更は不要**（`payment_method_types` を固定していない）。非同期決済への対応は今回入れた |
| 4 | `AI_COURSE_STRIPE_SECRET_KEY` を設定 | Supabase secrets | 未設定だと大会決済のキーにフォールバックし、片方をローテートすると両方止まる |
| 5 | **有効な招待コードを発行** | AIコース管理画面 | 復旧した日次点検が `invites_usable=0` を検知。**いま誰も新規アカウントを作れない** |
| 6 | 教材の門を ON にする | Cloudflare Pages → Settings → Environment variables → `AI_COURSE_ASSET_GATE=on` / `AI_COURSE_ASSET_GATE_SECRET=<長いランダム文字列>` → 再デプロイ | 露出3,291,989バイトを閉じる。**先に staging で学習が普通にできることを確認** |
| 7 | wild-flow の GA4 測定IDを投入 | GitHub → Settings → Secrets → `VITE_GA4_ID` | 現在 空文字で何も測れていない。kawabado と同じIDにするか新規プロパティかは判断が必要 |
| 8 | OpenAI Admin key を発行 | OpenAI → Organization → Admin keys | AI原価の実請求突合に必須（通常の API キーでは 401） |
| 9 | 滞留している問い合わせ5件に返信 | Gmail / 管理画面の新タブ | 2026-07-06 から未返信。**AIからは一切送っていない** |

---

## 検証結果（このブランチの実測）

```
npx tsc -b                          → No errors found
npm run build                       → exit 0（language-integrity: 28,191 strings / violations 0）
npx vitest run                      → PASS 3,719 / FAIL 1
                                       （落ちているのは BLOCKER-2 の原価率だけ）
npx eslint .                        → 73 problems（本番HEED baseline 69 → +4）
                                       新規ファイルは0件。増分は既存ファイルへの追記に伴う
                                       react-hooks 系で、CIも lint を通していない（従来どおり）
node scripts/ai-course/measure-content-exposure.mjs
                                    → 🚨 3,291,989 bytes が認証なしで取得できる（exit 1）
node scripts/ai-course/render-ops-board.mjs /tmp/x.html
                                    → 生成成功（手を打つこと11件・生徒12人）
```

監査で「タイムアウトで落ちていた」品質ゲート4本
（`advIntegrity` ×2 / `advClozeChoiceIntegrity` / `vocabContent`）は、今回の実行では**完走してパス**した。

### 途中で見つけた既存テストのバグ（修正済み）

`migrationIntegrity.test.ts` の SECURITY DEFINER 検査 `/set\s+search_path\s*=/` に `i` フラグが無く、
SQL を大文字で書いた migration を「search_path 未固定＝権限昇格しうる」と**誤判定**していた。
SQL のキーワードは大文字小文字を区別しない。`search_path` を実際に外すと落ちることを
ミューテーションで確認したうえで `/i` を付けた。
