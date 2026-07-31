# 次セッション用プロンプト（このまま貼る）

```
AI日本語コース — Release Operations Phase

Phase B と Release Closure は完了済みです。やり直さないでください。

repo: /Users/shocchan/badminton-platform
branch: feature/ai-course-learning-polish
RC tag: ai-course-content-rc1（push済）

最初に読む:
- docs/ai-course/autonomous-loop/current-state.md
- docs/ai-course/autonomous-loop/release-work-queue.json
- docs/ai-course/production/human-gate-evidence.md

【重要】型判定は必ず `npm run build`（tsc -b）。`npx tsc --noEmit` は
この環境のCLI proxy経由だと実エラーを取りこぼします。

【重要】docs/ai-course/production/device-check-packet.md 末尾の
「A1〜A8 PASS / A9 FAIL / C3 FAIL」は回答例であってCEOの確認結果ではありません。
実結果は human-gate-evidence.md の表に日付つきで記録されたものだけを有効とします。

完了済み（再実行禁止）:
- Chapters 10/10・会話文脈 140/140 runtime接続・Loading 21箇所・
  イラスト 140/140 learner visible・横断品質 P0/P1 = 0・AIコース側lint 0
- 法務8ページ実装（route・i18n・LP footer 8リンク・公開ガード・test 17件）
- 認証済み staging smoke（fixture撤去済み・行数完全一致）
- Gate① 維持検証（read-only）・production preflight・RC tag発行

残っているのは次の4つだけです。

1. 法務の事実14項目が届いたら記入する（AI作業は記入のみ）
   src/lib/aiLesson/course/legal/legalFacts.ts の null を埋める。
   14項目すべて埋まると LEGAL_PUBLISH が自動でtrueになり8ページが公開される。
   埋めたら: npx vitest run src/pages/ai-lesson/legal/ && npm run build
   → staging deploy → /ja と /zh の8ページを実ブラウザで確認

2. 実機チェックのFAIL番号が届いたら、その番号だけ直す
   docs/ai-course/production/device-check-packet.md

3. 公開教材範囲の目視結果が届いたら evidence へ固定する
   docs/ai-course/production/human-gate-evidence.md
   ※ human_reviewed / approved への一括昇格は禁止。確認された範囲だけを記録する

4. バドミントン本体側 lint 29件（AIコースのリリースには影響しない）
   release-manifest-content-rc1.md §8 に file/rule/risk/理由/次手を記載済み。
   TacticsBoard(13件)は先にcanvas描画のテストを足してから。

禁止: main merge / production deploy / 招待送信 / human_reviewed・approvedの一括昇格 /
完成済みChapter・会話文脈・イラストの作り直し

本番リリースには APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE が必要です。
それが届いても、Gate②③④がCOMPLETEでなければ実行しないでください。
```
