# Secure Adventure Runtime — remote反映 承認パック

2026-08-03。branch `feature/ai-course-secure-runtime-review`。
**このドキュメントの承認までremote変更は一切実行していません。**

ローカル実証の到達点（すべて実測）:
- learner教材のpublic露出 **0 bytes**（テキスト・音声とも）
- 問題payloadに正解なし・サーバー採点（HTTP 35項目 + 実ブラウザE2E 3本 PASS）
- 購入→開始→診断→冒険→模試→使い切り→期限切れの実ブラウザ完走（remote不接触）

---

## A. Cloudflare R2（教材ストア）

| 項目 | 内容 |
|---|---|
| bucket名 | `ai-course-content-staging`（staging用）／`ai-course-content`（本番用・後日） |
| 分離方針 | **staging と本番でbucketを分ける**。同一bucket共有はしない（教材更新の試行が本番へ波及しないため） |
| binding名 | `AI_COURSE_CONTENT`（Pages プロジェクト badminton-platform の Functions binding） |
| 公開設定 | **Public Access は絶対に有効化しない**（binding経由でのみ読む） |
| 内容 | 教材シャード **1,633ファイル / 29,112,444 bytes**（pool 293target・21,652問／読解聴解set／診断／文法doc 254／会話mission 60／メタ4） + 聴解音声 **200ファイル / 44MB** |
| checksum | manifest `contentHash: e54da7541f22a0a2`（`content-dist/manifest.json`。pool索引から算出） |

**upload手順**（ローカルの `content-dist/` と `content-audio/` から）:
```bash
# 生成（決定的。何度実行しても同じ内容）
npm run build:ai-course-content
# 一括アップロード（wrangler。--remote が付くのはこの承認後の実行時だけ）
find content-dist -type f ! -name manifest.json | while read f; do
  npx wrangler r2 object put "ai-course-content-staging/${f#content-dist/}" --file "$f" --remote; done
find content-audio/ai-course -type f | while read f; do
  npx wrangler r2 object put "ai-course-content-staging/v2/audio/$(basename "$f")" --file "$f" --remote; done
```
- **更新方法**: 教材を変えたら `build:ai-course-content` → 同コマンドで上書きput（キーが同じなら置換）。versionプレフィックス `v2/` を上げれば新旧併存も可能
- **削除方法**: `npx wrangler r2 object delete <bucket>/<key> --remote`／bucket全体は dashboard から
- **rollback**: bucketを消すだけ（アプリはbinding未設定なら503を返し、教材は一切露出しない）。旧動作へ戻すにはbranchを戻すだけ（本番は未マージなので影響なし）

## B. Secrets（値はこの文書に書かない）

| Secret名 | 置き場所 | 生成方法 | 用途 |
|---|---|---|---|
| `AI_COURSE_CONTENT_TOKEN_SECRET` | Pages 環境変数（Secret） | `openssl rand -base64 48` | セッション/attempt/音声トークンのHMAC署名鍵 |
| `SUPABASE_JWT_SECRET` | Pages 環境変数（Secret） | Supabase Dashboard → Settings → API → JWT Secret をコピー | WorkerがSupabase access tokenを検証する鍵 |
| `AI_COURSE_SESSION_MODE` | Pages 環境変数（**stagingのみ** `client-asserted`） | 固定文字列 | client申告でのセッション発行を許可。**本番には設定しない**（未設定=発行503=安全側） |

- rotation: TOKEN_SECRET は再生成して差し替えるだけ（有効中のセッション/attemptは失効→再発行で復帰。教材は漏れない）。JWT Secret のrotationはSupabase側の手順に従う
- 漏えい時: TOKEN_SECRET を即rotate（署名済みトークンが全滅するだけで、教材の一括取得はrate limit + 開放集合で制限される）。JWT Secret 漏えいはSupabase全体の事故なのでSupabase手順で即rotate
- ⚠️ `AI_COURSE_DEV_SEED` は **wrangler.dev.toml（local）専用**。remoteには絶対に設定しない（設定するとbucketへの書き込み口が開く）

## C. Supabase migration（すべて未適用）

| ファイル | 内容 |
|---|---|
| `supabase/migrations/20260803000000_ai_course_sales.sql`（作成済み） | 購入・利用権・60分パス開始の台帳（purchases / entitlement_grants / trial_activations 相当） |
| （未作成・本番セルフサービスに必須） | learner進捗のサーバー台帳（開放stage・累計アクティブ秒・attempt記録）。これが入るまで発行は client-asserted（staging限定） |

- RLS: learnerは**自分の行だけ**読める。教材そのものはDBに置かない（R2のみ）ので、DB経由の教材露出は構造的に無い
- service role使用箇所: Edge Function（checkout / auth）だけ。フロントには渡さない
- 既存データへの影響: additive（新規テーブルのみ）。既存の ai_learners / バドミントン系テーブルには触れない
- lock時間: 新規CREATEのみなので実質ゼロ
- rollback SQL: `supabase/rollbacks/rollback_20260803000000_ai_course_sales.sql`（作成済み）
- backup: 適用前に Dashboard → Database → Backups で手動スナップショット（無料枠はPITRが無いため必須）

## D. Edge Functions（すべて未デプロイ）

| Function | 変更 | 順番 |
|---|---|---|
| `ai-course-checkout`（作成済み） | Stripe test決済→利用権付与 | migration後 |
| `ai-course-auth` | **招待コード必須を外す**改修（購入者だけOTP登録可にする。checkout intentと紐付け） | checkout後 |

- env: `STRIPE_SECRET_KEY`（Supabase Secrets・test鍵から）
- authentication: 既存のSupabase JWT検証を踏襲。rate limitはFunction内の既存実装
- rollback: `supabase functions deploy` で旧版を再デプロイ（gitに旧版があるため即戻せる）

## E. staging／production分離（Supabase共有問題）

現状: staging と本番が **同一Supabaseプロジェクト `jdkwijdphlkrcoiggfqw` を共有**。

| | 案1: 共有のままadditive migration | 案2: staging専用プロジェクトを先に作る |
|---|---|---|
| リスク | 中（additiveでも本番DBへの書き込み実験が混ざる。7/7のblog消失の教訓に反する） | **低**（本番に一切触れない） |
| 費用 | 0円 | 0円（Freeプランをもう1つ。2プロジェクトまで無料） |
| 作業量 | 小 | 中（プロジェクト作成・env切替・auth設定の複製 約半日） |
| 本番影響 | 検証トラフィック・テストデータが本番DBに残る | なし |
| rollback | DROP TABLEで戻すが、事故時は本番を巻き込む | プロジェクト削除で完全消滅 |
| 今後の運用 | 毎回この判断を繰り返す | 以後の全検証が安全になる |

**推奨: 案2。** staging専用Supabaseを作り、`.env.staging` の
`VITE_SUPABASE_URL` / `ANON_KEY` / `SUPABASE_JWT_SECRET` をそこへ向けてから
migration・Edge Function・実環境E2Eを実証する。本番プロジェクトへは
staging実証がすべてPASSした後に同じ手順を適用する。
（destructive-test-safety の教訓: 本番での検証は本番相当の別環境で。）

## F. 実行順（1ステップずつ・失敗したら即停止）

| # | 実行 | 成功確認 | 失敗時 |
|---|---|---|---|
| 1 | staging Supabaseプロジェクト作成（案2） | dashboardでプロジェクトが見える | 作り直し（影響なし） |
| 2 | R2 bucket `ai-course-content-staging` 作成 + Pages(staging) へ binding | `wrangler r2 bucket list` に出る | bucket削除 |
| 3 | Secrets設定（B表の3つ。stagingのみSESSION_MODE） | Pages設定画面で確認 | 値を消す |
| 4 | 教材アップロード（A手順） | `wrangler r2 object get .../manifest.json --remote` がhash一致 | bucket内を削除 |
| 5 | staging deploy（`npm run build:staging` → `wrangler pages deploy dist --branch=staging`） | staging URLで `/api/ai-course/activity/start` 未認証が401 | 直前デプロイへrollback（Pagesの履歴から1クリック） |
| 6 | **実環境E2E**: `WORKER_URL=<staging URL>` で verify-content-endpoint 35項目 + Playwright E2E | 全PASS | 5をrollback・原因調査 |
| 7 | migration適用（staging Supabase） | `select * from <table>` が空で通る | rollback SQL実行 |
| 8 | Edge Functions deploy（staging） | curlで200/401が仕様どおり | 旧版再デプロイ |
| 9 | CEO確認（staging URL・review page・実購入フロー） | CEOのOK | — |
| 10 | 本番: 2〜8を本番向けに再実行（SESSION_MODEは**設定しない**） | 同上 | 同上 |
| 11 | main merge → production deploy | 本番実測（教材401/403・課金なし確認） | Pages rollback + revert |

**このパックの承認後も、実行はステップ単位でCEOの「進めて」を待って行います。**
