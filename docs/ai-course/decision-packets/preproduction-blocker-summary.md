# 公開前ブロッカー要約（preproduction-blocker-summary）

更新: 2026-07-28（CEO判断14件反映後） ／ ブランチ: feature/ai-course-learning-polish（staging反映済み・本番未反映）
品質基線: テスト837件全パス・tsc 0・lint 45E/6W=51（増分0）・main bundle 590.30KB（増加0）

## ブロッカー一覧（公開を止めているもの）

| # | ブロッカー | 状態 | 解除に必要なもの | 資料 |
|---|---|---|---|---|
| 1 | 教材 root P0 | **解決済み（0件）** | fi-namae例文をCEO判断で確定・反映・staging確認済み | `curriculum-p0-p1-application-report.md` |
| 2 | 教材 root P1 | **解決済み（0件）** | 13件をCEO判断で確定・反映（Vocabulary Content Draft RC） | 同上 |
| 3 | 教材の human_reviewed / approved 未確定 | 人間レビュー待ち | human_reviewedへ進めるfieldのCEO指定（一括承認はしない） | `release-readiness-matrix.md` |
| 4 | 語彙進捗・復習予定の正式DB保存なし | **最終パケット完成・適用承認待ち** | CEO回答 `APPLY_STAGING_MIGRATIONS` →立ち会い適用→shocchanのみ検証 | `final-database-and-entitlement-apply-packet.md` |
| 5 | admin_overrides のRLS | **最終パケット完成・適用承認待ち**（案A＋列保護の二層防御） | 同上（同じ適用枠で実施） | 同上 |
| 6 | 実機スマートフォン確認 | CEO実施待ち | iPhone Safari＋Android Chromeでチェックリスト完了 | `mobile-device-beta-checklist.md` |

## ブロッカーではないが記録するもの

| 項目 | 状態 |
|---|---|
| focus ring（全アプリ共通） | **解決済み**（2026-07-28 CEO承認の共通修正。全計測3.5:1以上・staging反映済み） |
| ヒント使用の記録 | 今回は追加しない（CEO決定）。将来設計のみ `hint-usage-future-design.md` |
| 検証モードの公開分離 | 現在はlabPreviewで非表示・chunk非読込。**正式公開前に internal_review entitlement へ移す**（設計は#5の資料に含む） |
| 検証モード中のanalytics送信 | 現在は送信される（labPreview保持者のみなので実害は限定的）。entitlement移行時に停止する |
| 会話 generic 127語 | 品質改善候補（ブロッカーではない） |
| Step4と完了画面の棒ラベル不統一 | **解決済み**（「正しく答えた／もう一度確認」へ統一・2026-07-28） |

## 解除の順序（更新）

1. ~~P0/P1判断~~ → **完了**（14件反映・human_review_candidate）
2. **CEO回答 `APPLY_STAGING_MIGRATIONS`** → 進捗3表＋entitlements＋列保護を立ち会い適用
3. 適用後検証（shocchanのみ・§12-16）→ クライアント切替（entitlement読み込み・chunk gate・検証モード分離）
4. **実機チェックリスト**（beta判定）
5. human_reviewed へ進めるfieldのCEO指定 → approved（Release Gate準拠）

## いま公開したら何が起きるか（リスクの言語化）

- 端末のデータ消去・機種変更で**学習履歴が全消失**する（#4未解決のため）
- 一般learnerが自分で内部画面（判断キュー等）を開ける（#5未解決のため）
- ~~fi-namaeの例文問題~~ → 解決済み（「私の名前は王小明です。」へ確定・反映）
