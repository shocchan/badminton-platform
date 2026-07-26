# 語彙パックrole（Phase 2D §3-§4・§10）

## role定義
required（学習・確認が必要）／diagnostic（短い確認で通過可）／optional（目的に応じて）／
remedial（診断・問題で誤答時のみ動的追加）／enrichment（発展・将来用）。
同一Itemは複製せず、`roleFor(packId, track, itemId)` がトラック別roleを決定的に返す。

## ルール（roleForの実装＝正）
- 基礎パック×life_basic/business: transparent_same→diagnostic、他→required
- 基礎パック×n3_prep/n2_prep: conversation_core→required、他→diagnostic（誤答時remedial）
- 基礎パック×conversation: conversation_core→required、transparent→diagnostic、他→optional
- N3パック: N3語→required（n2_prepではdiagnostic）、混入する基礎語→diagnostic

## 動的変換（§10）
診断の正解→confirmed／誤答→remedial（sessionStorage diagnostics・自己申告では変化しない）。
effectiveRole = 静的role + 診断override。

## 完了条件との接続
computePackProgressはrequired集合を分母にseen/verified(80%)/retainedで状態遷移。
self_knownのみでは seen_all より先に進まない（テスト担保）。
