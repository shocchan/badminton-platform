# Next Production Hardening Plan（Whole Product Complete後の次Phase）

前提: Whole Product Complete on Staging = YES（whole-product-completion-matrix.md）。
このPhaseの目的は「全体を壊さずに、正式運用に耐える土台へ差し替える」こと。
Production GO Matrix（generated/production-go-matrix.md）のfail/human_requiredを閉じる。

## Phase H1: 環境（AI実行可能・Docker導入後）

1. Docker Desktop導入 → `supabase start`（local Postgres）
2. local migration適用＋失敗注入（rollback-backup.mdの手順を実行し証拠を残す）
3. RLS/entitlement JWT matrix（rls-entitlement-matrix.md計画に沿ってData API実測）
4. cross-device同期の実DB実証（unitProgressRepositoryを実Supabase local向きに接続）
5. rollback/backup実証（security rollbackとfeature rollbackを別々に実行・復元確認）

## Phase H2: 進捗の正式同期（remote適用はCEO文字列が必要）

1. n3unit/n2quest進捗テーブルのmigration設計（既存learnerテーブルへの影響なし）
2. `APPLY_SHARED_SUPABASE_MIGRATIONS` 承認後にremote適用
3. StoragePort/RepositoryをSupabase実装へ切替（localはoutbox化）
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
