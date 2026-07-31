# Phase 2E-1.7 完了報告書（Human Decision Console & Proposal Triage）

日付: 2026-07-27 ／ ブランチ: feature/ai-course-learning-polish ／ staging反映済み
依頼元: 自律ループ#1のChatGPT設計（prompts/2e1-7-prompt.md・decision=CONTINUE）

## 実装（コミット3件）

1. 028854e — データ層: `buildDecisionQueue()`（判断事項単位の決定的導出）＋判断ドラフトストアv3
2. 13cbb7a — 自律ループ状態docs
3. （UI）— Decision Console UI・vview=decisions・i18n（ja/zh）・テスト

## 実数（コードから導出・decisionQueueSummary）

- **decision item総数: 91 ／ 対象語数: 72**（語数と判断事項数を分離表示）
- 内訳: example 1（fi-namae）・cognate 11（AI不一致）・**meaning_zh 20・role 57**・sense 2（taihen/tsugou）
  ※ 訂正（2E-1.8完全性監査で検出）: 本報告の初版は meaning_zh 17・role 60 と誤集計していた。
  実数は auditDecisionQueue() が正（候補218=採用91+採用済み除外108+対象外19・テストで固定）
- 優先度: P0=3（fi-namaeの例文・中国語訳・role）・P1系はキュー先頭に決定的ソート
- 採用済み提案はキューへ乗せない（fi-jouhou:cognate等は判断不要としてテストで担保）

## 完了条件の充足

- 判断事項単位の統合 ✅（同一語複数判断: fi-namae×3等）／fi-namae P0先頭表示 ✅
- localStorage v3（`ai_course_vocab_decision_draft_v3`）: v2非接触・履歴・reopen・不正データ耐性 ✅
- 「教材未反映・正式承認ではない・正式なCEO権限制御ではない」バナー常時表示 ✅
- 2段階確定（状態選択→保存・誤クリック防止）・CEOメモ・aria-live通知・fieldset/radio・label関連付け ✅
- export/import: プレビュー→merge/replace（replaceは確認）・schema/重複/実在ID/statusバリデーション ✅
- 教材本体・human_reviewed/approved・Supabase/migration/RLS/認証/learnerデータ: 変更なし ✅
- テスト589件全パス（+12: データ層8＋UI4）／tsc 0／lint 51=ベースライン一致（増分0）／build成功 ✅
- bundle: main 590.30KB増加0・Decision Consoleは専用lazy chunk 13.72KB（gzip 4.39KB） ✅
- staging実機（sho認証済み）: 表示・件数・バナー・fi-namae P0確認・console error 0・4xxリソース0 ✅

## 未完成・制約（正直な報告）

- モバイル実表示（320-768px）の目視: Chromeフルスクリーンでviewport変更不可（2E-1.5と同じ制約）。
  UIはflex-wrap・縦積み設計＋jsdomテストでカバー。次回非フルスクリーン時に確認
- superseded状態はデータモデルにあるがUI選択肢からは除外（別判断置換の自動設定は未実装）
- 判断ドラフトの語彙詳細画面への逆リンクは未実装（次Phase候補）

## 人間判断待ち（Decision Consoleで確認可能になったもの）

fi-namae例文（P0）・cognate不一致11語・meaningZh提案17件・role提案60件・Sense未レビュー2件
→ すべて staging の ことば図鑑→「判断キュー」から確認・判断ドラフト化可能（CEOのみが選択する）
