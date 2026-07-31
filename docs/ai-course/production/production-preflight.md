# Production preflight（2026-07-31）

**秘密の値は一切載せない。** 名前・存在・スコープ・確認日だけを記録する。

## 1. 配信（Cloudflare Pages）

| 項目 | 値 |
|---|---|
| project | `badminton-platform` |
| production domain | `kawabado.com` |
| preview/staging alias | `staging.badminton-platform.pages.dev` |
| Git連携 | あり |
| 今回のstaging deploy | `--branch staging`（preview扱い・本番に影響しない） |

**重要（構成上の事実）**: production と staging は**同一のPagesプロジェクト**。
本番は production branch、stagingは同プロジェクトのpreview branch。
つまり `--branch staging` 以外で deploy すると本番へ出る。deployコマンドのbranch指定を必ず確認する。

## 2. 環境変数（名前と存在のみ）

| 名前 | 存在 | scope | 備考 |
|---|---|---|---|
| `VITE_SUPABASE_URL` | あり | client | `.env.production` に上書きなし |
| `VITE_SUPABASE_ANON_KEY` | あり | client | anon（RLS前提）。service_roleではない |
| `VITE_GA4_ID` | あり | client（本番ビルド） | 計測 |
| `VITE_META_PIXEL_ID` | あり | client（本番ビルド） | 計測 |
| `VITE_STRIPE_PUBLISHABLE_KEY` | あり | client（本番ビルド） | publishable（secretではない） |

`VITE_` 接頭辞でクライアントへ露出する秘密（OpenAI鍵・service_role・各種SECRET）は
**0件**であることを確認した（`grep -rn "VITE_OPENAI|VITE_.*SECRET|VITE_SERVICE_ROLE"` → なし）。

## 3. Edge Function secrets（server-side・名前のみ）

存在を確認: `AI_LESSON_DEMO_CODE` / `OPENAI_API_KEY` / `REMINDER_CRON_SECRET` /
`REMINDER_DRY_RUN` / `RESEND_API_KEY` / `STRIPE_SECRET_KEY` / `SUPABASE_ANON_KEY` /
`SUPABASE_DB_URL` / `SUPABASE_JWKS` / `SUPABASE_PUBLISHABLE_KEYS`

**`OPENAI_API_KEY` は Edge Function 側にのみ存在**し、クライアントバンドルには入らない。

## 4. staging と production の「混線」について

| 項目 | 状態 | 判定 |
|---|---|---|
| フロントの配信 | 同一プロジェクトの別branch | 分離されている |
| **Supabase** | **staging と production が同一プロジェクトを共有** | **既知・意図的**（GATE①が "shared Supabase" 前提で設計・適用済み） |

これはP0の新規欠陥ではなく、既存の設計方針。ただし
**stagingでの検証は本番DBに書き込む**ため、以下の作法を必須とする（今回も遵守した）:

1. 検証用アカウントは `.invalid` ドメインの合成fixtureのみ
2. 作成前・撤去後の行数を必ず突き合わせる
3. 撤去は正確なUUID指定
4. 既存learner・実受講者のデータには触れない

今回の実測: 作成前 auth_users 5 / learners 1 / item_progress 12 / sessions 24 →
撤去後まったく同一。`%.invalid` 残存 0。

## 5. 本番デプロイ手順（承認後にのみ実行）

```bash
# 0. 承認文字列を受領していることを確認する
# 1. RC tag の位置で作業する
git checkout ai-course-content-rc1

# 2. 本番ビルド
npm run build

# 3. 本番へ（branch指定に注意。staging以外は本番へ出る）
npx wrangler pages deploy dist --project-name badminton-platform --branch main
```

DBの変更を含まないため、migration適用は不要。

## 6. post-deploy smoke（kawabado.com で5分）

1. `/ja/ai-course` が開く
2. `/zh/ai-course` が中国語で開く
3. ログイン後、ことば図鑑で語のカードに**絵が出ている**
4. 語の会話練習で、その語固有の質問が出る
5. 章を1つ開いてQuestが進む
6. 「こまったとき」を中国語表示で開き、日本語が出ていない
7. DevTools console に error 0

## 7. rollback

Cloudflare Pages の deployment 一覧から直前の production deployment を Rollback。
**DB変更を含まないため、ロールバックにDB操作は不要**。
直前deployのIDはデプロイ実行時に控えること。
