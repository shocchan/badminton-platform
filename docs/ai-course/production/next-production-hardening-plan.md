# Next Production Hardening Plan（Whole Product Complete後の次Phase）

前提: Whole Product Complete on Staging = YES（whole-product-completion-matrix.md）。
このPhaseの目的は「全体を壊さずに、正式運用に耐える土台へ差し替える」こと。
Production GO Matrix（generated/production-go-matrix.md）のfail/human_requiredを閉じる。

## Phase H1: 環境（✅ 完了 2026-07-29・証拠: generated/h1-local-verification.md）

1. ✅ Docker導入（colima・管理者権限不要）→ `supabase start` 成功
2. ✅ local migration適用（AIコース5本＋draft3本・単一トランザクション）＋失敗注入（部分適用ゼロ実証）。
   発見F1: 歴史chainはfresh適用不能（20260629）→ local構築手順をrollback-backup.mdに確立
3. ✅ RLS/entitlement JWT matrix 20/20 PASS（scripts/ai-course/h1-local-rls-matrix.mjs・再実行可能）。
   発見F2/F3をdraftへ反映（default privilegesの明示revoke・service_role claim許可）→ パケット§20b更新
4. ✅ cross-device実DB実証（supabaseUnitProgressServer.ts＋local統合テスト3件。conflict→決定的merge→実績和集合）
5. ✅ rollback/backup実証（feature: 復元row count一致／security: 分離・保護消失→復帰を実測）

## Phase H2: 進捗の正式同期（remote適用はCEO文字列が必要）

1. ✅ n3unit/n2quest進捗テーブルのmigration設計（20260729000000_ai_course_unit_progress_DRAFT・
   H1でlocal実証済み。既存learnerテーブルへの影響なし）
2. `APPLY_SHARED_SUPABASE_MIGRATIONS` 承認後にremote適用
   （パケット§20bのH1修正差分込みで承認を得る。適用時は config.toml [db.migrations] enabled=true を確認）
3. StoragePort/RepositoryをSupabase実装へ切替（supabaseUnitProgressServer.ts は実装・実証済み。
   アプリ配線＝N3AreaPanelのcreateLocalUnitStorage差し替え＋outbox化が残り）
4. 「この端末に保存」表示を「保存しました（同期済み）」へ、実挙動と一致させて更新

## Phase H3: 人間ゲート（CEO/法務/実機）

- CEO: 教材承認（review packet）・ビジュアル承認（contact sheet）・世界名/エリア名の確定
- CEO: support送信先・incident owner・費用閾値
- 法務: 利用規約/プライバシー（AI送信範囲・保存期間・削除）
- 実機: iPhone/Android・VoiceOver/TalkBack・音声品質
- LP: ベータ表記の最終文言

## Phase H4: 品質の深掘り（FOREST FIRSTで後回しにした木）

- G2: 478問の意味品質監査（Question Review Packet）
- deferred-polish-backlog.md のP2群（命名統一・会話中の世界文脈・N2誤答後UX 等）
- question-quality-backlog.json の消化

## 本番反映

すべて閉じたうえで `APPROVE_AI_COURSE_PRODUCTION_RELEASE`（CEO明示）→ main反映→本番。
部分的なGO・虚偽のProduction Readyは出さない。
