# docs/ai-course 索引

最終更新: 2026-07-28 ／ 迷ったらまずここ。

## 🔴 いま見るもの（CEOの判断・確認待ち）

| ファイル | 内容 |
|---|---|
| **`decision-packets/preproduction-blocker-summary.md`** | **公開前ブロッカーの最新状況と解除順序（入口）** |
| `decision-packets/final-database-and-entitlement-apply-packet.md` | DB保存＋entitlementの適用前パケット（`APPLY_STAGING_MIGRATIONS` 待ち） |
| `mobile-device-beta-checklist.md` | 実機スマートフォンのチェックリスト（CEO記入式・未実施） |
| `completion-reports/curriculum-p0-p1-application-report.md` | 教材14件の反映報告（root P0/P1=0） |

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
