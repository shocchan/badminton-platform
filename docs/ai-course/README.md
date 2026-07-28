# docs/ai-course 索引

最終更新: 2026-07-28 ／ 迷ったらまずここ。

## 🔴 いま見るもの（CEOの判断・確認待ち）

| ファイル | 内容 |
|---|---|
| **`decision-packets/preproduction-blocker-summary.md`** | **公開前ブロッカーの最新状況と解除順序（入口）** |
| `decision-packets/reuse-existing-63-decision-packet.md` | Excel候補63件のsense統合判断（3P-3・awaiting） |
| `decision-packets/final-database-and-entitlement-apply-packet.md` | DB保存＋entitlementの適用前パケット（`APPLY_STAGING_MIGRATIONS` 待ち） |
| `mobile-device-beta-checklist.md` | 実機スマートフォンのチェックリスト（CEO記入式・未実施） |
| `completion-reports/curriculum-p0-p1-application-report.md` | 教材14件の反映報告（root P0/P1=0） |

## 完全版v1.0（Phase 3P・production/）

- `production/full-production-roadmap.md` — **v1.0までのPhase計画と未完成数の基準値**
- `production/full-production-surface-inventory.md` — 画面と作成中表示の全件
- `production/unfinished-content-inventory.md` — 教材・機能の欠損一覧
- `production/illustration-coverage-inventory.md` — イラスト欠損115語
- `production/grammar-completion-inventory.md` — N2 180/N3 120の完成状況
- `production/excel-integration-backlog.md` — Excel 40シートの統合Backlog
- `production/generated/n3-grammar-source-audit.json` — N3文法120行の監査（重複・N2重なり・粒度）
- `production/generated/*.json` — 機械可読manifest（単一集計から生成）

## Phase 3（教材Release完成・N2問題演習）

- `phase-3-roadmap.md` — **Phase 3A〜3Fの計画と3Bへ進む条件**
- `current-content-release-audit.md` — 現教材のRelease監査（読込済み≠公開可能）
- `excel-source-inventory.md` — Excel 40シートの分類・重複・権利
- `n2-question-source-inventory.md` — N2問題Source（現在0件・登録手順）
- `copyright-and-rights-gate.md` — 著作権・権利ゲート（全教材に適用）
- `n2-question-schema.md` — 問題スキーマ設計（実装は3C）
- `content-release-matrix.json` — 機械可読の完成度集計（単一集計から生成）

## 判断の記録

- `decision-packets/curriculum-p0-p1-ceo-review.md` — P0/P1判断シート（判断済み・記録）
- `decision-packets/curriculum-p0-p1-review.json` — 同JSON版
- `decision-packets/internal-entitlement-rls-decision-packet.md` — entitlement 3案比較（案A採用）
- `decision-packets/formal-vocabulary-persistence-implementation-packet.md` — DB保存の設計詳細
- `decision-packets/premium-progress-visual-audit.md` — 進捗表示の情報過多監査
- `CEO-DECISION-PACKET.md` — 旧パケット（判断完了・履歴）

## 仕様・設計（実装の根拠）

- `release-readiness-matrix.md` — **Release Gate・教材の承認状態モデル・severity定義**
- `learner-journey.md` — 初回Journey・結果の3軸・schema分類・検証のしかた
- `journey-state-transitions.md` — 診断・練習の保存順序と再開地点
- `vocabulary-spaced-review.md` — 間隔反復の規則
- `learning-connection-quality.md` — 学習接続の品質軸
- `hint-usage-future-design.md` — ヒント記録の将来設計（未実装・CEO決定）
- `vocabulary-relations.md` ／ `mobile-navigation.md` ／ `authenticated-ux-audit.md`

## 完了報告（時系列）

`completion-reports/` — phase-2e1-*-completion-report.md（各Phase詳細）、
overnight-*-report.md（夜間セッション総括）

## 自律ループの記録（停止済み・再開しない）

`autonomous-loop/` — 監督ChatGPTの指示文（prompts/）とレビュー（reviews/）

## migration草案（未適用）

`../../supabase/migrations_draft/20260728*` — 適用はCEOの明示文字列
`APPLY_STAGING_MIGRATIONS` が無い限り行わない。
