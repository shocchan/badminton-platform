# Adventure V2 — current state

更新: 2026-07-31（session 1・Phase 1完了時点）

- branch: `feature/ai-course-adaptive-adventure-v2`（base = hotfix tip 2795685 = origin/main + UX修正2commits）
- テストベースライン: **1306全PASS**（V2開始時点）
- 本番: kawabado.com = August Pilot（deploy f7b401b6）。**非接触を維持**
- 完了: P1-1〜P1-3（監査・reuse map・decision log・work queue）
- resumeFrom: **P2-1**（advTypes.ts + advProfile.ts から実装開始）
- 正準ドキュメント: current-inventory.md / content-reuse-map.md / decision-log.md / work-queue.json
- 再集計: `./node_modules/.bin/vite-node scripts/ai-course/adventure-v2-inventory.ts`
