# N2／N3 Adaptive Adventure — 次セッション開始プロンプト

~/badminton-platform の `feature/ai-course-adventure-v2-final-completion` で継続してください。

## 最初に読む

1. `docs/ai-course/adventure-v2/final-completion-report.md`（判定と残課題）
2. `docs/ai-course/adventure-v2/final-completion-work-queue.json`
3. `docs/ai-course/adventure-v2/final-completion-current-state.md`

## 完了済み（再作成しないこと）

- **読解 N3 100/100・N2 120/120**（10形式すべて saturated）
- **聴解 N3 100/100・N2 100/100・実音声200件**（manifest失敗0）
- 先生別realtime音声ルーティング（Edge Function allowlist・teacherIdのみ受信）
- 準備度gateの条件別テスト・先生表示の全画面整合
- CORE語彙 層C **686語 / 2,647**・選択式問題 2,999問
- vitest **1,536 PASS** / tsc 0 / lint 0 / staging deploy `55ed015e`

## 残数

| task | 残り |
|---|---|
| D-1 CORE語彙 層C | **1,703語**（約7バッチ） |
| C-1 cedar実走確認 | 1（CEO承認待ち） |
| C-2 AI会話E2E | 1（learner認証情報待ち） |
| P2-2 AdvShellチャンク肥大 | 1 |

## 次のtask: D-1 batch04

対象リストは切り出し済み: `docs/ai-course/adventure-v2/generated/core-batch-04.json`（250語）

作り方は `src/lib/aiLesson/course/adventure/vocab/content/coreBatch03.ts` と**同じ構造**。
`vocabContentBank.ts` に import を足す。多義語には必ず `senseNoteZh` を付ける。
動詞連用形の見出し・機能語・読みが確認できない語は `NEEDS_HUMAN_REVIEW` に落とす（でっち上げない）。

次バッチのリストを作るとき:
```bash
./node_modules/.bin/vite-node scripts/ai-course/select-core-batch.ts 5
# 完了済みは covered で除外されるので、常に pending の先頭が次バッチ。--offset= は先行切り出し用
```

## acceptance command

```bash
rtk proxy npx vitest run                                    # rtk proxy 必須（付けないと失敗が見えない）
rtk proxy npx tsc --noEmit -p tsconfig.json
npm run validate:ai-course                                  # 全バッチ検査
./node_modules/.bin/vite-node scripts/ai-course/skill-coverage-report.ts
node scripts/ai-course/generate-listening-audio.mjs --verify
node scripts/ai-course/verify-teacher-voice.mjs             # 現状は BLOCKED を出力
```

聴解を足したら音声も作る:
```bash
./node_modules/.bin/vite-node scripts/ai-course/dump-listening-sets.ts
node scripts/ai-course/generate-listening-audio.mjs
```

## 安全制約（不変）

- **production deploy / production Edge Function deploy / main merge / remote migration 禁止**
- **staging と production は同じ Supabase プロジェクト `jdkwijdphlkrcoiggfqw` を共有している。**
  `ai-lesson-token` のデプロイは production Edge Function deploy に等しい。CEO承認なしに行わない
- 既存learnerデータ非破壊 / learner invite 禁止 / Stripe 禁止 / 既存RC tag の強制更新禁止
- secrets・APIキーをログ・成果物へ出さない
- **実音声を確認する前に `voiceSwitchAvailable` を true にしない**（注意書きを消さない）
- 誤問よりHOLD。音声の無い聴解を active にしない。問題数だけの水増しをしない

## staging 確認の注意

deploy 直後は `AdvShell-*.js` が数十秒 404 になる（エッジ伝播待ち）。
古い画面が出るときは URL に `&cb=<現在の秒>` を付け、`dist/assets/` のハッシュと配信ハッシュを照合する。
