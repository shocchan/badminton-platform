# N2／N3 Adaptive Adventure — 次セッション開始プロンプト

**FINAL CLOSEOUT は完了している。** 残りをゼロにする作業は終わり、Pilot Complete = YES。

~/badminton-platform の `feature/ai-course-adventure-v2-final-completion` で継続する。

## 最初に読む

1. `docs/ai-course/adventure-v2/final-closeout-report.md`（最終判定と実測値）
2. `docs/ai-course/adventure-v2/final-completion-work-queue.json`（全task complete）
3. `docs/ai-course/adventure-v2/decision-log.md`（D-020〜D-026 が今回の判断）

## 完了済み（再作成しないこと）

- **CORE語彙 pending 0**：層C 2,454語 → active_beta 2,167 / excluded_from_core 287
  （`needs_human_review` は0件。外した語には `exclusionReason` と理由文がある）
- **選択問題 10,112問**・question coverage 100%（2問未満0語）・4形式以上 89.5%
- **先生別音声 実走PASS**：shoko→marin / yuto→cedar を実音声つきで確認済み。
  注意書きは削除済み。`voiceSwitchAvailable` は両者 true
- **AI会話E2E 実走PASS**（12ステップ）
- 読解 N3 100 / N2 120・聴解 N3 100 / N2 100・音声200件
- vitest 1,541 PASS / tsc 0 / lint 0

## 残っているのは P2 / P3 だけ

| # | 内容 |
|---|---|
| P2-1 | 初回転送量。出題プールを動的importにすれば冒険の初回表示が軽くなる（AdvShell・AdvMockRunner・クエスト生成へ波及） |
| P2-2 | `validate-legal.mts` が ESLint の `.mts` パーサ設定に無い（既存事象） |
| P3-1 | 悠斗先生の `cheer`（笑顔）画像が無く base で代用 |

## acceptance command

```bash
rtk proxy npx vitest run                                    # rtk proxy 必須（付けないと失敗が見えない）
rtk proxy npx tsc --noEmit -p tsconfig.json
npm run validate:ai-course
./node_modules/.bin/vite-node scripts/ai-course/skill-coverage-report.ts
./node_modules/.bin/vite-node scripts/ai-course/select-core-batch.ts 11   # pending=0 を確認
node scripts/ai-course/generate-listening-audio.mjs --verify
```

先生別音声・AI会話E2Eを再確認するとき:

```bash
node scripts/ai-course/stage-verify-session.mjs --create --out <path>
node scripts/ai-course/verify-teacher-voice.mjs --fixture <path>
node scripts/ai-course/verify-conversation-e2e.mjs --fixture <path> --teacher yuto
node scripts/ai-course/stage-verify-session.mjs --cleanup <userId>   # **必ず撤去する**
```

## 安全制約（不変）

- **production frontend deploy / main merge / remote migration は禁止**
- staging と production は同じ Supabase プロジェクト `jdkwijdphlkrcoiggfqw` を共有している。
  `ai-lesson-token` は 2026-08-01 に CEO の明示許可でデプロイ済み。
  **再デプロイするときも後方互換（teacherId 未送信 → marin）を実APIで確認すること。**
  切り戻し手順は `docs/ai-course/adventure-v2/rollback/README.md`
- 既存learnerデータ非破壊 / learner invite 禁止 / Stripe 禁止 / 既存RC tag の強制更新禁止
- secrets・APIキーをログ・成果物へ出さない
- 一時QA learnerは `.invalid` ドメインで作り、**必ず撤去して前後件数を照合する**
- 誤問よりHOLD。音声の無い聴解を active にしない。問題数だけの水増しをしない

## staging 確認の注意

deploy 直後はチャンクが数十秒 404 になる（エッジ伝播待ち）。
古い画面が出るときは URL に `&cb=<現在の秒>` を付け、`dist/assets/` のハッシュと配信ハッシュを照合する。
