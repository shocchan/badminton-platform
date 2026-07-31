# Adventure V2 — 次セッション開始プロンプト

~/badminton-platform の `feature/ai-course-adaptive-adventure-v2` で ADAPTIVE ADVENTURE V2 sprint を継続してください。

1. `docs/ai-course/adventure-v2/current-state.md` と `work-queue.json` を読む
2. resumeFrom のタスクから再開（pending の最小ID）
3. 制約: 本番/main/remote migration/learner invite 禁止。既存learnerデータ非破壊。
   canonical教材の大量書き換え禁止。human_reviewed/approved昇格禁止
4. 各Phase完了時: tests → commit → work-queue/current-state/next-session-prompt 更新
5. 仕様の正準は CEO指示（ONE-WEEK ADAPTIVE ADVENTURE V2 SPRINT §0〜§34）＋ decision-log.md
