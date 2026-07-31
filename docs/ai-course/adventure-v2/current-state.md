# Adventure V2 — current state

更新: 2026-07-31（session 1完了時点）

- **V2 Technical Complete: YES ／ Staging Ready: YES ／ Production: NOT_EXECUTED**
- branch: `feature/ai-course-adaptive-adventure-v2`（origin push済・RC tag `ai-course-adventure-v2-rc1`）
- staging: deploy `b7f82110` → https://staging.badminton-platform.pages.dev
  - CEO確認URL: `/ja/ai-course?v2=1`（従来Homeに戻すボタンあり・既存learnerは非影響）
- テスト: **1360全PASS**／build PASS／AIコース側lint 0
- 検証fixture: 撤去済み（auth_users=5 / learners=1 原状一致）
- 正準ドキュメント: final-report.md（§33形式）／ evidence/staging-smoke.md ／ work-queue.json（全complete）
- resumeFrom: **CEO staging確認待ち** → フィードバック反映。次セッションは next-session-prompt.md 参照
- 制約維持: main非接触・本番非接触・remote migration 0・learnerデータ非破壊・教材昇格なし
