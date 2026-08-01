# N2／N3 Adaptive Adventure Completion — current state

更新: 2026-08-01（Phase A〜H完了・Phase I/J進行中）

- branch: `feature/ai-course-adventure-v2-completion`（base `b346edf` = V2 hotfix完了時点）
- テスト **1437 PASS** ／ tsc 0 ／ AIコース側 lint 0
- 本番・main・remote migration すべて非接触

## 完了

| Phase | 内容 | 実測 |
|---|---|---|
| A | HOLD 45件の再集計・分類 | N2 28／N3 17。REPLACE_WITH_SAFE_VARIANT 33・REPAIR_AND_RELEASE 12。**0問項目 0** |
| B | 中国語解説の日本語を3分類 | 1560件 → A正当1346／B不要19／C要判断195。learner-visibleなB **4件を中国語へ修正** |
| C | 読解bank | N2 30・N3 30セット（完全オリジナル）。根拠が本文に実在・複数正解0・漏洩0 |
| D | 聴解bank＋音声 | N2 25・N3 25セット。**実音声50件（計975秒）**・manifest失敗0 |
| E | 時間配分・中ボス・ミニ模試 | N2 105+50／N3 30+70+40分。4技能未達なら「総合」と名乗らない |
| F | 技能別準備度 | timed evidenceが無ければ総合を出さない |
| G | Today Adventure統合・言い直し | 試験技能を弱点/試験日で配分。言い直し素材0件を解消 |
| H | 先生サマリー | 試験科目別evidence・本人の相談を最優先・最大3件 |

## 残（Phase I/J）

- I-1: staging実画面のUX最終監査（Home/Map/Battle/Reading/Listening/Mock）
- J-1: staging deploy → 4 Journey実証 → fixture撤去
- J-2: 最終報告（completion-final-report.md）
- **AI会話E2E（§13）は未実施** — 実API・実learnerセッションが必要

## 生成物

- `generated/hold-audit.json` / `zh-explanation-audit.json` / `audio-manifest.json`
- `generated/listening-sets.json`（音声生成の入力）
- `public/audio/ai-course/*.m4a`（50件・8.0MB）

## コマンド

```
./node_modules/.bin/vite-node scripts/ai-course/audit-hold-questions.ts
./node_modules/.bin/vite-node scripts/ai-course/audit-zh-explanations.ts
./node_modules/.bin/vite-node scripts/ai-course/dump-listening-sets.ts
node scripts/ai-course/generate-listening-audio.mjs --verify
npm run validate:ai-course
```
