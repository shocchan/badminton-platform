# 認証済み実機UX監査（Phase 2E-1.5 §14-§15・2026-07-27）

環境: CEO実Chrome（claude-in-chrome）・shoアカウントでstagingへログイン済みのセッションを使用。
他learnerへの切替なし・Andyさんアカウント非接触・DB更新系の操作（レッスン開始・診断回答・続きから）は回避。

## 確認結果（stagingデプロイ後・実ビルド）

| 項目 | 結果 |
|---|---|
| ホーム（Hero・続きから・今日のおすすめ・会話の旅・成長カード） | ✅ 表示・console error 0 |
| 語彙詳細 fi-sumu / fi-komaru / fi-ikutsu | ✅ ふりがなruby・修正後例文が反映（因为不会读汉字，我很为难。／りんごはいくつありますか。） |
| 教材レビュー画面（vview=review） | ✅ デフォルト「重要項目（P0/P1）」= 1/5件・AI比較カード（Claude/ChatGPT別status・rationale・推奨）表示 |
| レビュー永続化 | ✅ 判定→localStorage v2保存→リロード後も保持（確認後にテスト判定は消去済み） |
| フィルター件数 | ✅ AI不一致73・人間確認必須15・自動修正済み43・P0 1（`dualReviewSummary()`と完全一致） |
| モバイルナビ案A（labPreview） | ✅ 実ビルドDOM: モバイル用nav=ホーム/AI会話/ことば/しくみ/その他。その他→成長・設定、aria-expanded切替・Escapeで閉じる |
| デスクトップナビ | ✅ 6項目（ホーム/AI会話/ことば/しくみ/成長/設定） |
| 診断UI | ✅ 基礎パック13問カウンター表示（回答はしない）。N3の16問構成はvitestで担保 |
| 画像404 | ✅ 0件（performance entriesで確認） |
| console error | ✅ 0件 |

## 制約・未実施（正直な記録）

- **モバイル実表示（390px等）のスクリーンショットは取得不可**: CEOのChromeウィンドウがフルスクリーンで
  resize_windowが効かず、viewportを縮小できなかった。モバイル表示の挙動はjsdomテスト
  （courseHeader.test.tsx）＋実ビルドDOM検証（breakpoint classとメニュー配線）でカバー。
  次回ウィンドウ非フルスクリーン時に320/375/390/768/1024pxと200%ズームの目視確認を推奨。
- スクリーンショットのディスク保存が拡張経由で取得できず、`scratchpad/visual-audit/phase-2e1-5/` は空。
  視覚確認はセッション内スクリーンショット（デスクトップ1440・レビュー画面/ホーム）で実施済み。
- N3診断・クイック復習の実回答はshoアカウントの学習進捗を汚すため実施していない。
