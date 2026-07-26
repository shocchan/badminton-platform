# しくみラボ 復習候補の仕様（Phase 2B §12）

## 間隔ルール（決定的・LLM不使用）
| 結果 | 候補 | 間隔 | candidateState |
|---|---|---|---|
| 誤答 | 翌日復習 | day1 | due_day1 |
| ヒント使用で正解 | 3日後復習 | day3 | due_day3 |
| 自力正解 | 7日後の定着確認 | day7 | confirm_day7 |
| 別の日の確認でも自力正解 | 定着候補（再出題不要） | — | retained |

- **1回の自力正解ではretainedにしない。** retainedは「最新が自力正解」かつ「それより前の別の暦日に自力正解がある」場合のみ（deriveMasteryState）。
- dueAt は最後の回答の attemptedAt＋間隔から算出。日付偽装をしない（渡された時刻のみから導出・テストではattemptedAtを明示）。
- 対象キー: targetId×dimension（読み/意味/形/接続/助詞/文中使用を別々に管理）。

## 状態遷移（Item×次元）
not_seen → familiar（誤答経験）→ guided（ヒント正解）→ independent（自力正解）→ retained（別日再確認も自力正解）
※後日誤答すれば familiar へ戻る。

## 会話復習との分離
しくみラボの復習候補は sessionStorage（試作）のみで管理し、会話レッスンの
masteryState・practiceAgainIds・XP・current_week とは相互に読み書きしない。
UI文言も「正式な復習予定として保存済み」とは表示しない（試作セッション内の候補と明示）。
