# 語彙教材の品質レビュー基盤（Phase 2E-1 §2・§14-§16）

作成: 2026-07-27。対象: 基礎78語＋N3準備62語＝**140語**（全draft・labPreview限定）。

## 1. 単一監査インデックス

基礎とN3を別々の監査処理で管理しない。全140語は
`src/lib/aiLesson/course/vocabularyReview.ts` の `buildVocabularyReviewRecords()` が返す
`VocabularyReviewRecord`（itemId / senseIds / packs / rolesByTrack / meaningZhShort /
learningFocusJa・Zh / exampleType / levelMeta / cognateDefault / cognateSenseOverrides /
furiganaSegments / imageAsset / contentReviewStatus / outstandingIssues）で表現する。

**集計値はすべて `auditSummary()` から生成する。UI・docs・テスト・完了報告で手計算の数字を使わない。**

現在の実測（auditSummary・2026-07-27）:

| 項目 | 値 |
|---|---|
| 総語数 | 140（基礎78＋N3 62） |
| cognate分類済み | 40（transparent 17／mostly 9／partial 6／false friend 4／japanese 2／no 2） |
| cognate未レビュー | 100（基礎55＋N3 45） |
| Sense上書き | 4語8Sense（うち未レビュー2Sense） |
| learningFocusZh | 37語 |
| usageNoteZh | 53語 |
| 例文ふりがな | 140/140語・667セグメント |
| 語彙接続の実画像 | 13語（asset全体では15枚。パックカバー2枚はItem非接続） |

## 2. AI draft と human reviewed の区別

- 全教材 `review: 'draft'`。**AIが修正しただけでは human_reviewed / approved にしない。**
- `contentReviewStatus`: cognate または level が unreviewed の語は `unreviewed`、それ以外は `draft`。
- ブラウザ上のレビュー「問題なし」も教材の状態を変えない（下記ワークフロー参照）。

## 3. 教材レビュー画面（labPreview限定）

- 入口: ことばトップ最下部の「内部レビュー（教材確認・管理用）」テキストリンクのみ。
  利用者向けナビには出さない。URL: `?app=1&vocab=1&vview=review（&vitem=<位置>）`。
- 表示: 語・読み・品詞・Sense・中心意味・学習ポイント・例文（ruby切替可）・中国語例文・
  cognate（Sense上書き含む）・level・track別role・role根拠・出典・画像・要確認フラグ。
- 操作: 問題なし(A)／修正が必要(R・issue分類つき)／保留(H)／J・→=次へ／K・←=前へ／次の未レビューへ。
  入力欄フォーカス中はショートカット無効。
- フィルター: 全て／未レビュー／同源語未分類／false friend／部分一致／中国語要確認／
  ふりがな要確認／画像要確認／出典external／N3パック／基礎78語。
- 文言は `vocabReviewI18n.ts`（レビュー画面のlazy chunk内。メイン辞書へ入れない）。

## 4. レビュー結果の保存とワークフロー（§16）

- 保存先: `sessionStorage['ai_course_vocab_review_preview_v1']`（schemaVersion 1）。
  学習者進捗（`ai_course_vocab_preview_v1`）とは完全分離。PIIなし。
- entry: itemId / decision(ok|fix|hold) / issueTypes / note（この端末のみ・analyticsへ送らない）/
  reviewedAt / reviewerMode / dataVersion(`phase-2e-1`)。
- **ワークフロー**: しょっちゃんがレビュー → JSONエクスポート → Claude Codeへ渡す →
  Claude Codeが静的教材データを修正 → テスト → reviewStatus更新（このときだけ状態が変わる）。
  ブラウザの「問題なし」は提案・確認記録であり、approvedへの自動昇格は仕組み上存在しない。
- インポートは schemaVersion / decision を検証し、不正JSONでは何も変更しない。

## 5. Analytics（§30）

`view_ai_course_vocabulary_review` / `set_ai_course_vocabulary_review_decision`（decisionのみ） /
`export_ai_course_vocabulary_review`。訳文・例文・メモ本文・出典セル・learner IDは送らない。
