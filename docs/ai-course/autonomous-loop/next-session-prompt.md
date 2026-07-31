# 次セッション用プロンプト（このまま貼る）

```
AI日本語コース — Release Operations Phase

AI側のリリース準備は完了しています。RC tag: ai-course-content-rc2
やり直さないでください。

repo: /Users/shocchan/badminton-platform
branch: feature/ai-course-learning-polish

最初に読む:
- docs/ai-course/autonomous-loop/current-state.md
- docs/ai-course/autonomous-loop/release-work-queue.json
- docs/ai-course/production/release-manifest-content-rc1.md

【重要】型判定は必ず `npm run build`（tsc -b）。
`npx tsc --noEmit` はこの環境のCLI proxy経由だと実エラーを取りこぼします。

【重要】device-check-packet.md 末尾の「A1〜A8 PASS」は回答例であって
CEOの確認結果ではありません。実結果は human-gate-evidence.md に日付つきで
記録されたものだけを有効とします。

完了済み（再実行禁止）:
- Chapters 10/10・会話文脈 140/140 runtime接続・Loading 21箇所
- イラスト 140/140 learner visible・横断品質 P0/P1 = 0・AIコース側 lint 0E0W
- 法務8ページ ja/zh（route16URL・LP/アプリ両方のfooter・同意ゲート・削除導線・
  44pxタップ標的・noindex・canonical/hreflang・tests 22件）
- 本番env検査script（P0 0 / P1 0）・a11y/mobile smoke・認証済みstaging smoke
- Gate①維持検証・production preflight・RC tag rc1/rc2

残っているAI側作業は次の3つだけで、いずれもCEOの入力が届いてから着手します。

1. 法務事実14項目が届いたら記入する
   src/lib/aiLesson/course/legal/legalFacts.ts の null を埋めるだけ。
   → npx vitest run src/pages/ai-lesson/legal/ src/components/ai-course/legalConsent.test.tsx
   → npm run build → staging deploy → ja/zh 8ページを実ブラウザで確認
   （LEGAL_PUBLISH が自動でtrueになり、同意チェックも有効になります）

2. 実機チェックのFAIL番号が届いたら、その番号だけ直す

3. 公開教材範囲の目視結果が届いたら evidence へ固定する
   ※ human_reviewed / approved への一括昇格は禁止

（別枠）バドミントン本体側 lint 29E/6W。AIコースのリリースには影響しません。
release-manifest-content-rc1.md §8 に file/rule/risk/理由/次手を記載済み。

禁止: main merge / production deploy / 招待送信 /
human_reviewed・approvedの一括昇格 / 完成済みChapter・会話文脈・イラストの作り直し

本番リリースには APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE が必要です。
それが届いても、人間ゲートの結果が記録されるまでは実行しないでください。
```
