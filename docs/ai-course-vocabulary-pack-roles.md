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

## Phase 2E-1 更新（2026-07-27）

- N3パック62語の目標別role再監査を実施（`vocabularyRoleMeta.ts`・全語に根拠rationaleJa）。
  全件requiredを解消: n3_prep = required 43 / diagnostic 11 / optional 7 / enrichment 1、
  conversation = required 40 / diagnostic 3 / optional 18 / enrichment 1、
  n2_prep = required 2（都合・大変=false friend中核のみ）/ diagnostic 60。
- remedialは静的roleとして使わない（診断・問題結果からの動的付与のみ）。
- enrichmentの初出: つまり（書き言葉寄り接続・現段階は発展）。
- 件数はroleCounts()からのみ算出（手計算禁止）。詳細な確認次元は
  ai-course-vocabulary-diagnostic-dimensions.md を参照。
