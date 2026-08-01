# `ai-lesson-token` Edge Function — deploy 前の状態と切り戻し手順

2026-08-01 の FINAL CLOSEOUT で、共有Supabaseプロジェクト `jdkwijdphlkrcoiggfqw` の
`ai-lesson-token` を更新した。**このプロジェクトは production（kawabado.com）と共有**のため、
切り戻せる状態を先に作ってからデプロイした。

## deploy 前に動いていたコード（＝切り戻し先）

`main`（production frontend が指している commit）の版。実体をここに保存してある。

| ファイル | sha256 |
|---|---|
| `ai-lesson-token.index.ts.predeploy` | `4346970472...8626540f` |
| `ai-lesson-token.voiceTutorPrompt.ts.predeploy` | `05d802e071...2d5665045` |

差分の本質は1点だけ：`const VOICE = "marin"` の固定 → `teacherId` からの allowlist 変換。

## 切り戻し手順

```bash
cd ~/badminton-platform
git checkout main -- supabase/functions/ai-lesson-token
SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) \
  npx supabase functions deploy ai-lesson-token --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
git checkout HEAD -- supabase/functions/ai-lesson-token   # 作業ツリーを戻す
```

保存してある `.predeploy` ファイルと `git show main:...` の内容が一致することは
`shasum -a 256` で確認できる（上表）。

## 後方互換のために守ったこと

| 条件 | 実装 |
|---|---|
| `teacherId` は optional | 未指定・不正値・型違いはすべて `shoko` へ倒れる（`resolveTeacherId`） |
| 旧クライアントは従来どおり `marin` | `TEACHER_VOICE.shoko === "marin"` |
| **旧クライアントの instructions が変わらない** | 話し方の方針（`teacherStyle`）は `teacherId` を明示送信したリクエストにだけ足す。先生名の既定値は従来と同じ「翔子先生」 |
| DB変更なし | SQL・migration は一切触っていない |
| API response 破壊なし | 既存キー（`clientSecret` / `expiresAt` / `model` / `voice` / `wrapUpInstructions`）はそのまま。`teacherId` を**追加**しただけ |
| secret 変更なし | Supabase Secrets は読み取りのみ |
| 任意 voice 文字列を受け付けない | `body.voice` / `plan.voice` を読む箇所が無いことをテストで固定 |

## deploy 前後の互換確認

`scripts/ai-course/verify-teacher-voice.mjs` が、同じ関数に対して

1. `teacherId` を**送らない**リクエスト（＝旧クライアント相当）
2. `teacherId: 'shoko'`
3. `teacherId: 'yuto'`
4. 不正値 `teacherId: '../etc/passwd'` 等

を投げ、1と2が `marin`、3が `cedar`、4が `marin` になることを実APIで確認する。
