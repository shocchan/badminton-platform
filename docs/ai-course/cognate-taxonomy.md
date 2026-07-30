# Cognate二層taxonomy（正準・2026-07-30 CEO確認）

同形語の分類は**目的の異なる2層**が意図的に併存する。無理に統一しない。数値を報告するときは必ずどちらの層かを明記する。

| 層 | 分類数 | 定義場所 | 集計関数 | 用途 | HEADの件数 |
|---|---|---|---|---|---|
| エンジン層 | 4分類 | `quality/cognateProfile.ts`（明示プロファイル＋保守的推定） | `cognateProfileFor` | 出題次元のルーティング・teach画面の転移注意 | false_friend 8・partial_overlap 10・mostly_same 54・japanese_specific 68 |
| UI/図鑑層 | 7分類 | `vocabularyLevelMeta.ts` | `levelMetaOf` / `aggregateCognates` | 図鑑フィルター・バッジ・ヘッダー・正準統計 | false_friend 9・partial_overlap 46・transparent_same 54・japanese_specific 13・no_cognate 16・mostly_same 2・unreviewed 0 |

- 過去のcompletion reportの「8/10/54/68」＝エンジン層。「同形語注意9語・partial 46語」＝UI層。**矛盾ではない**（cleanup-packet-20260730.md §1で実証済み）。
- 層またぎのズレで実害があるのは「UI層で対照注意なのにエンジン層がjapanese_specificで対照問題が流れない」ケースのみ。
  → 出身・都合は `CONTRAST_ROUTED_JAPANESE_SPECIFIC`（assessQuestionEngine）で**分類を変えずに接続**（2026-07-30 CEO指示・最小override）。
- 既存分類の大量変更は禁止。個別の再分類は理由と影響範囲を添えて1語ずつ。
