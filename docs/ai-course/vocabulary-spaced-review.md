# 語彙の間隔反復（Phase 2E-1.10 §3-§5）

「間違えたことばが翌日・3日後・7日後にもう一度出る」ための仕組み。
**preview Repositoryのみ**で、正式なDB保存ではない（本番前ブロッカーとして §29 に記録）。

## スケジュール規則

| 出題結果 | 次回 | 段階 |
|---|---|---|
| 誤答（wrong） | 翌日 | day1 |
| 補助あり正解（supported） | 3日後 | day3 |
| 自力正解（independent） | 7日後 | day7 |
| **別の日に**2回目の自力正解 | 14日後 | retention_candidate |

絶対条件（`vocabSpacedReview.test.ts` で担保）:

- 同じ日に何度正解しても段階を進めない（`consecutiveIndependent` は同日加算しない）
- 本人が「覚えたと思う」を押しても**予定は消えない**（`markSelfKnown` は状態と日付を変えない）
- 本人が「まだ不安」を押すと予定を作り優先度を上げる（`markUncertain`）
- 誤答すれば段階は翌日へ戻る（retention_candidateからでも）
- 同一Itemでも Sense が異なれば別管理（`itemId#senseId`）

## retained_previewは「習得」ではない

`retention_candidate` / `retained_preview` は内部の段階名であり、
利用者向けには「翌日もう一度／3日後に確認／7日後に定着確認／定着を確認中」とだけ表示する。
「完全習得」「マスター」は使わない。UI表示テスト（`learningLoop.test.tsx`）で内部名の非表示を担保。

## 日付・タイムゾーン（§5）

`learningClock.ts` が唯一の日付判定元。

- `localDateKey()` はローカル日付（`toISOString().slice(0,10)` を使わない＝UTC変換で日付がずれない）
- `addDays` はローカル日付での加算（月跨ぎ・年跨ぎ・DSTでも日付が正しい）
- テストは `createLearningClock(fixedDate)` で固定時刻を注入する
- ブラウザ時刻を各所で直接呼ばない（`VocabularyHub` の `dateKey()` も Clock 経由）

## 保存先

- キー: `ai_course_vocab_schedule_preview_v1`（sessionStorage）
- 学習進捗（`ai_course_vocab_preview_v1`）・教材レビュー・判断ドラフトとは**別キー**
- 壊れたデータは空として扱い、画面を落とさない

## 正式化に必要なこと（本番前・自動適用しない）

1. 語彙進捗と復習スケジュールの正式DB保存（learner単位・RLS付き）
2. 端末間同期（現在は端末内のみ）
3. 通知（今回は実装しない）
