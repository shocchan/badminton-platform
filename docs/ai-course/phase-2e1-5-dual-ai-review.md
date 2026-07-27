# Phase 2E-1.5 二重AIレビュー（Claude×ChatGPT独立監査）

作成: 2026-07-27。対象: 140語（基礎78＋N3 62）・全draft。

## 仕組み

1. `scratchpad/content-review/batch-compact-01..07.json`（20語×7バッチ・PII/Excelセルなし）を生成
2. Claude in Chrome→ChatGPT専用チャット「AI日本語教材 第二校正」で独立監査
   （観点: 日本語/中国語/ふりがな/cognate/curriculum。schema回答・JSON以外は再試行）
3. Claude側評価は `vocabDualReview.ts` の `claudeReviewOf()`（系統的監査＋明示フラグ。
   cognate未レビュー語はuncertainのまま断定しない）
4. 突き合わせ: `buildReviewComparisons()` → agreement/disagreement/priority(P0-P3)
5. 状態: claude_reviewed / chatgpt_reviewed / ai_consensus / ai_disagreement / human_review_required。
   **AIの「問題なし」はhuman_reviewed/approvedにしない**（テストで担保）

## 自動修正の範囲（§8）

適用可: 双方high confidence一致の軽微修正（中国語の自然化・明確な不整合・
unreviewed cognateへの合意draft分類）。適用不可: レベル確定・JLPT断定・required最終承認・
Sense統合削除・低確信false friend確定・意図が変わる例文変更。適用後もdraft維持。
ログ: `scratchpad/content-review/auto-fix-log.json`＋`AUTO_FIXED_ITEM_IDS`。

## 集計・結果

サマリーは `dualReviewSummary()`（単一関数）とai-review-summaryを参照。
