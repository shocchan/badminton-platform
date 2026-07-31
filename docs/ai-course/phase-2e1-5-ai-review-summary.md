# Phase 2E-1.5 第二校正サマリー（自動生成数値・2026-07-27）

数値の出所: `dualReviewSummary()` / `buildReviewComparisons()`（単一導出関数）。
プロセスと不一致の詳細は `phase-2e1-5-dual-ai-review.md`、個別修正は `phase-2e1-5-auto-fix-log.json`。

## 集計

| 指標 | 値 |
|---|---|
| 対象語 | 140（基礎78＋N3 62・全draft） |
| ChatGPT独立レビュー取得 | 140/140 |
| ai_consensus | 52 |
| ai_disagreement | 73 |
| human_review_required | 15 |
| P0 / P1 / P2 / P3 | 1 / 4 / 83 / 52 |

## 自動修正（§8・両AI high confidence一致のみ）

| 区分 | 件数 | 例 |
|---|---|---|
| 中国語例文の自然化（主語・量詞補完等） | 31 | 买水。→我买水。／有猫。→有一只猫。 |
| 明白な誤訳・不整合の修正 | 4語 | fi-komaru（不认识→不会读）・fi-ikutsu（要几个？→有几个苹果？＋例文再設計）・fi-houhou・fi-sorede（結束性） |
| 意味範囲の軽微拡張（meaningZh） | 9 | 预约→预约；预订 等 |
| 既存cognate分類の訂正 | 8 | fi-jouhou mostly_same→false_friend（情报=谍报）等 |
| learningFocusZh注記追加 | 10 | fi-densha（電車の範囲）等 |
| ふりがな同期 | 2 | fi-ikutsu・fi-sorede |
| unreviewed→合意draft分類 | 90 | 基礎49＋N3 41（すべてdraft・人間確認待ち） |

## 適用しなかったもの（人間レビューへ）

- fi-namae: ChatGPT自身がhuman:true（P0）。例文「名前は王です。」は人間確認まで維持
- cognate不一致10語（nihongo・kaishain・nanji・tomodachi・yasui・genki・kibun・soudan・zenzen・yakusoku）＋kyoumi（P1）
- role提案（基礎会話トラック optional→diagnostic 約40語）: カリキュラム判断のため未適用
- fi-jiyuu例文訳: 「自由时间」は対象語との対応維持を優先

## 状態の上限

AIレビュー・自動修正後も全教材は **draft** のまま。human_reviewed / approved はCEOまたは
人間レビュアーの明示操作でのみ付与（`vocab2e15.test.ts` で担保）。
