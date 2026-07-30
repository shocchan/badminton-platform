# 次セッション用プロンプト（このまま貼る）

```
AI日本語コース — Release Operations Phase

前セッションで Phase B（会話文脈・Loading・横断品質・イラスト・lint）は完了し、
Content RC1 を凍結しました。やり直さないでください。

repo: /Users/shocchan/badminton-platform
branch: feature/ai-course-learning-polish
RC HEAD: ed92454（clean・origin push済）

最初に読むもの:
- docs/ai-course/autonomous-loop/current-state.md
- docs/ai-course/production/release-manifest-content-rc1.md

開始時に実値を再確認してください:
  git rev-parse HEAD / git status --short --branch / npm run build / npx vitest run

【重要】型の判定は必ず `npm run build`（tsc -b）で行うこと。
`npx tsc --noEmit` はこの環境のCLI proxy経由だと実エラーを取りこぼします。

完了済み（再実行禁止）:
- Chapters 10/10 playable
- 会話文脈 data 140/140・runtime接続 140/140
- Loading 主要20領域へ接続
- 語彙イラスト asset 140/140・learner visible 140/140（自前SVG）
- 横断品質 P0 0 / P1 0
- AIコース側 lint 0

残っている作業は次の4つだけです。優先順に:

1. 法務8ページの実装（ja/zh）
   docs/ai-course/production/legal-decision-packet.md のCEO回答が出ていれば実装する。
   まだなら、他の3つを先に進める。
   route・footerリンク・申込同意チェック・AI説明・削除請求導線・info@kawabado.com集約まで。

2. 実機FAILの修正
   docs/ai-course/production/device-check-packet.md のFAIL番号が返ってきていれば、
   その番号だけ直す。返ってきていなければ待たずに3へ。

3. P2の解消（CEO判断が要る）
   - P2-A: レッスンレポートの achievements / encouragementJa が日本語のみ。
     中国語も出すかは仕様判断（release-manifest-content-rc1.md §8）
   - P2-B: LPの学習画面スクショ。実画像が入ったら sectionsB.tsx の
     SHOW_SCREENSHOT_FRAME を true に戻す

4. バドミントン本体側 lint 29件
   release-manifest-content-rc1.md §8 に file/rule/risk/理由/安全な次手 を記載済み。
   リスクの低いものから単独PRで。TacticsBoard(13件)は先にテストを足してから。

禁止:
- main merge
- production deploy
- 招待送信・受講者個別情報の作成
- human_reviewed / approved の一括昇格
- 完成済みChapter・会話文脈・イラストの作り直し

本番リリースには別途 APPROVE_AI_COURSE_AUGUST_PILOT_RELEASE が要ります。
```
