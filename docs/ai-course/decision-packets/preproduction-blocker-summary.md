# 公開前ブロッカー要約（preproduction-blocker-summary）

作成: 2026-07-28 04:50 ／ ブランチ: feature/ai-course-learning-polish（staging反映済み・本番未反映）
品質基線: テスト804件全パス・tsc 0・lint 45E/6W=51（増分0）・main bundle 590.30KB（増加0）

## ブロッカー一覧（公開を止めているもの）

| # | ブロッカー | 状態 | 解除に必要なもの | 資料 |
|---|---|---|---|---|
| 1 | 教材 root P0=1（fi-namae例文） | CEO判断待ち | 判断シートへの記入 | `curriculum-p0-p1-ceo-review.md` |
| 2 | 教材 root P1=13（訳語2・同源語分類11） | CEO判断待ち | 同上（AI間で提案が割れる4件に注目） | 同上＋JSON |
| 3 | 教材の human_reviewed / approved 未確定 | 人間レビュー待ち | P0/P1解決後、状態モデルに沿って昇格（一括承認はしない） | `release-readiness-matrix.md` |
| 4 | 語彙進捗・復習予定の正式DB保存なし | **設計完了・適用承認待ち** | 3表モデルの承認→立ち会い適用→shocchanのみで検証 | `formal-vocabulary-persistence-implementation-packet.md` |
| 5 | admin_overrides のRLS（learnerが内部権限を自己書換え可能） | **設計完了・案の選択待ち** | 案A（entitlementテーブル）の承認→適用 | `internal-entitlement-rls-decision-packet.md` |
| 6 | 実機スマートフォン確認 | CEO実施待ち | iPhone Safari＋Android Chromeでチェックリスト完了 | `mobile-device-beta-checklist.md` |

## ブロッカーではないが記録するもの

| 項目 | 状態 |
|---|---|
| focus ring（全アプリ共通） | **解決済み**（2026-07-28 CEO承認の共通修正。全計測3.5:1以上・staging反映済み） |
| ヒント使用の記録 | 今回は追加しない（CEO決定）。将来設計のみ `hint-usage-future-design.md` |
| 検証モードの公開分離 | 現在はlabPreviewで非表示・chunk非読込。**正式公開前に internal_review entitlement へ移す**（設計は#5の資料に含む） |
| 検証モード中のanalytics送信 | 現在は送信される（labPreview保持者のみなので実害は限定的）。entitlement移行時に停止する |
| 会話 generic 127語 | 品質改善候補（ブロッカーではない） |
| Step4と完了画面の棒ラベル不統一 | 軽微・文言のみ（`premium-progress-visual-audit.md` #4） |

## 解除の順序（提案）

1. **P0/P1判断**（15分・シート記入のみ）→ 反映→staging確認→human_review_candidate
2. **entitlement案Aの承認**（RLS穴の閉鎖が正式公開の前提）
3. **DB保存モデルの承認**（複数端末・データ消失リスクの解消）
4. 2と3のmigrationを同じ立ち会い枠で適用 → shocchanのみで検証
5. **実機チェックリスト**（beta判定）
6. 教材の human_reviewed / approved（Release Gate: P0/P1未解決パックは不可）

## いま公開したら何が起きるか（リスクの言語化）

- 端末のデータ消去・機種変更で**学習履歴が全消失**する（#4未解決のため）
- 一般learnerが自分で内部画面（判断キュー等）を開ける（#5未解決のため）
- fi-namaeの例文で「名前＝姓」という誤解をそのまま教える（#1未解決のため）
