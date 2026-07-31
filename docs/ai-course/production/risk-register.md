# Risk Register（攻略型・完全版 v1.0）

| # | リスク | 状態 | 対処 |
|---|---|---|---|
| 1 | 文字列一致だけの誤reuse/誤exclude | 対処済 | reuseは全件requiresHumanDecision。excludeは明示規則のみ（3P-2は0件） |
| 2 | 拼音ローマ字readingと既存かなの誤conflict | 修正済 | かな含有時のみreading比較（3P-2で検出・修正） |
| 3 | かな語のlemma=reading二重登録による誤conflict | 修正済 | ID集合で重複排除 |
| 4 | rights行がdedupで状態を失い行数が減る | 修正済 | awaiting_rights_rewriteはdedup対象外 |
| 5 | 分類済み=採用可という誤認 | 常時 | manifest冒頭のprincipleとテストで「自動追加なし」を固定 |
| 6 | 3A集計（4,417行・重複113）との数値差 | 説明済 | 行定義の違いをmanifest/backlogに明記。単一情報源はgenerated/ |
| 7 | 新規draft追加で「未完成品」が逆に増える | 3P-3で注意 | 全field揃った完成draftのみ教材へ。揃わない候補はintake側に留める |
| 8 | 監督ChatGPTの応答不能・BLOCKED | 運用 | §31.13: 制限時は状態保存し正常停止。抽出はURL/クエリ除去で回避 |
| 9 | 承認4,720fieldのレビュー渋滞 | 未解決 | 3P-9で8分割パケット。human_reviewed指定はCEO待ち（Decision Queue） |
| 10 | イラスト大量生成の品質ばらつき | 3P-3以降 | バッチ＋contact sheet＋人間承認前approved禁止（§35） |
