# N2／N3 Adaptive Adventure — FINAL COMPLETION current state

更新: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-final-completion`
base: `feature/ai-course-adventure-v2-completion` の tip `9475207`

**production・main・remote migration・Edge Function deploy はいずれも非接触。**

---

## いちばん重要な制約（このセッションで判明）

**staging と production は同じ Supabase プロジェクト（`jdkwijdphlkrcoiggfqw`）を共有している。**

- `.env` の `VITE_SUPABASE_URL` も `supabase/.temp/project-ref` も1つだけ
- `main`（＝production）にも `supabase/functions/ai-lesson-token` と AIコース画面が入っている
- したがって **`ai-lesson-token` のデプロイは production Edge Function deploy に等しく、禁止事項に当たる**
- `OPENAI_API_KEY` は Supabase Secret にのみ存在し、ローカルには無い（OpenAIへの直接実走もできない）

→ **cedar の実走確認（C-1）は blocked_external。** よって
`advTeacher.ts` の `voiceSwitchAvailable` は **false のまま**、注意書きも ja/zh とも残している。
実際に切り替わることを確認する前に「切り替わります」と表示しない、という順番を守っている。

---

## 完了

| Phase | 内容 | 実測 |
|---|---|---|
| A | 環境・実数・安全監査 | baseline vitest 1,509 PASS / tsc 0 / lint 0 |
| B | 先生別realtime音声ルーティング | Edge Function に allowlist。teacherId のみ受信。テスト16件 |
| F（一部） | N3読解 30 → **100セット**（5形式×20） | 全形式 saturated（本文重複0・構造重複0） |
| H | 準備度gateの条件別テスト | §17の欠落条件6パターンを個別に固定（計25件） |

## 実測値（`generated/skill-coverage.json`）

| | 現在 | 目標 |
|---|---|---|
| N3読解 | 100 | 100 |
| N2読解 | 進行中 | 120 |
| N3聴解 | 25（音声25） | 100 |
| N2聴解 | 25（音声25） | 100 |
| CORE語彙 層C | 249 active_beta | 2,647 |

## 検証コマンド

```bash
rtk proxy npx vitest run                     # rtk proxy を付けないと失敗が見えない
rtk proxy npx tsc --noEmit -p tsconfig.json
npm run validate:ai-course
./node_modules/.bin/vite-node scripts/ai-course/skill-coverage-report.ts
node scripts/ai-course/generate-listening-audio.mjs --verify
node scripts/ai-course/verify-teacher-voice.mjs        # 現状は BLOCKED を出力する
```

## 音声の作り直し手順（聴解を追加したら必ず）

```bash
./node_modules/.bin/vite-node scripts/ai-course/dump-listening-sets.ts
node scripts/ai-course/generate-listening-audio.mjs        # 未生成分だけ作る
node scripts/ai-course/generate-listening-audio.mjs --verify
```

音声が無い set は `playableSets()` から外れ、**出題されない**（存在するふりをしない）。
