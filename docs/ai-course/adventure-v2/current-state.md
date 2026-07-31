# Adventure V2 — current state

更新: 2026-07-31（UX CLARITY ＋ JLPT ASSESSMENT INTEGRITY hotfix 完了時点）

- **UX Hotfix Ready: YES ／ Staging Ready: YES ／ Production: NOT_EXECUTED**
- branch: `feature/ai-course-adaptive-adventure-v2`（origin push済）
- staging: deploy `ea4318a4` → https://staging.badminton-platform.pages.dev
  - **CEO確認URL**: `/ja/ai-course?v2=1`（zh: `/zh/ai-course?v2=1`）
  - ⚠️ 旧画面が出たら末尾に `&cb=1`（Cloudflare edgeキャッシュ。検証で実際に踏んだ）
- テスト **1390 PASS** ／ tsc 0 ／ AIコース側 lint 0
- validator: `npm run validate:ai-course`（言語整合性＋正解位置分布）。言語整合性は **build前に自動実行**
  - 言語: checked 29,112・blocking **0**・warning 974（教材の表記様式・人間の翻訳作業へ）
  - 位置: 10,000battle 37,890問・24.99/25.02/24.97/25.01%・χ²=0.02・PASS
- 検証fixture: 撤去済み（auth_users=5 / learners=1 前後一致）
- 正準ドキュメント:
  - `ux-clarity-hotfix-report.md`（§15形式）
  - `jlpt-assessment-integrity-report.md`（§19形式）
  - `final-report.md`（V2 Technical Complete・前回）
  - `generated/language-integrity.json` / `answer-distribution.json` / `distractor-validity-audit.json`
- resumeFrom: **CEO staging確認待ち**。残P2/P3は各レポート末尾
- 制約維持: main非接触・本番非接触・remote migration 0・learnerデータ非破壊・教材の全面再生成なし
