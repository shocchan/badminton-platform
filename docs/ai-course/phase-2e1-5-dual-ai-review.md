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
ログ: `docs/ai-course/phase-2e1-5-auto-fix-log.json`＋`AUTO_FIXED_ITEM_IDS`。

ChatGPTがhuman:true指定した語（fi-namae）は提案があっても自動修正しない（P0で人間へ）。
採用済み提案は `resolveAdopted()` で「解決済み」として比較する（未採用の提案・不一致はそのまま残す）。

## 収集結果（2026-07-27・7バッチ/140語完了）

- ChatGPTレビュー取得: **140/140語**（batch01=JSON全形式、batch02-07=圧縮pipe形式）
- 集計（`dualReviewSummary()`）: consensus 52 / disagreement 73 / human_review_required 15
- 優先度: **P0=1（fi-namae 例文と王姓の読み）** / **P1=4（fi-komaru・fi-tsugou・fi-kyoumi・fi-taihen）** / P2=83 / P3=52
- P2の主因は3系統: ①基礎パック会話トラックのrole提案（optional→diagnostic・カリキュラム判断のため未適用）
  ②かな語のふりがなマーカー指摘（バッチ出力形式の artifact・教材データ自体は正しい）
  ③部分採用（例文は採用・意味範囲提案は人間確認待ち）

## AI不一致→人間レビュー行き（cognate分類・10語+3語）

| 語 | ChatGPT提案 | Claude見解 |
|---|---|---|
| fi-nihongo / fi-kaishain / fi-nanji / fi-tomodachi | japanese_specific | 字面から意味推測可でpartial寄り |
| fi-yasui | partial_overlap | 「安」は中文で「便宜」を意味せず疑問 |
| fi-genki | false_friend | 「元气满满」等 現代中文で近接 |
| fi-kibun | false_friend | 「气氛」とは字形が異なる |
| fi-soudan | false_friend | 商谈・相谈は現代中文に存在 |
| fi-zenzen | false_friend | 全然は中文書面語に存在 |
| fi-yakusoku | mostly_same | 中文「约束」=束縛で むしろ同形異義寄り |
| fi-kyoumi | false_friend（major） | 現分類mostly_same維持で人間判断へ（P1） |
| fi-taihen / fi-tsugou | — | Sense未レビュー（Claude側uncertain維持） |
