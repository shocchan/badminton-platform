# Excel統合 Backlog（Phase 3P-1）

生成: 2026-07-28 ／ 機械可読版: `generated/excel-integration-manifest.json`

## 集計

| 指標 | 値 |
|---|---|
| 全シート | 40（非空4,417行） |
| 統合済み行 | **0**（sourceRefs参照は12シート・182refのみ） |
| 未統合シート（重複除く） | 26 |
| 語彙候補行 | 1,242 |
| 既存140語との競合候補 | 113 |
| 権利対応必要 | 3シート（原文転載せず独自教材へ作り直し・§5） |
| 統合先内訳 | {"metadata_only": 7, "example_integration": 5, "vocab_integration": 10, "duplicate_skip": 3, "grammar_integration": 6, "rights_hold": 3, "exercise_candidates": 2, "frequency_metadata": 4} |

## rights_unknown 3シートの扱い（§5・機能は削らない）

慣用句110集・ビジネスメッセージ67選・営業用語200集は、
**原文をruntimeへ使わず**、学習論点だけ抽出→新しい例文・場面・中文を独自作成→
originality review→人間確認→正式教材登録。カテゴリ自体は残す。

## シート別Backlog

| シート | 統合先 | 非空行 | 語彙候補 | 競合 | 人間判断 | 権利 |
|---|---|---|---|---|---|---|
| 基礎日本語計画 | metadata_only | 22 |  |  |  |  |
| 注文・買い物表現 | example_integration | 34 |  |  |  |  |
| 道案内・店名一覧 | vocab_integration | 34 | 1 |  | 要 |  |
| 性格（動画1） | vocab_integration | 25 | 21 | 1 | 要 |  |
| 3単語例文 | example_integration | 31 |  |  |  |  |
| 50音（平仮名・片仮名） | metadata_only | 45 |  |  |  |  |
| 最初に覚える最低限表現 | vocab_integration | 418 | 400 | 76 | 要 |  |
| 原：オノマトペ100集 | duplicate_skip | 101 |  |  |  |  |
| 複合動詞一覧 | vocab_integration | 30 | 27 | 4 | 要 |  |
| 原：N2の文法180例文集 | grammar_integration | 182 |  |  |  |  |
| N3の文法120例文集 | grammar_integration | 121 |  |  |  |  |
| 原：N2の文法180例文集（王さん） | duplicate_skip | 182 |  |  |  |  |
| 現状把握・目標設計 | metadata_only | 0 |  |  |  |  |
| 営業・ビジネス用語集200集 | rights_hold | 200 | 128 |  | 要 | ⚠️ |
| 原：ビジネス敬語 | example_integration | 27 |  |  |  |  |
| 原：PREP特訓 | exercise_candidates | 244 |  |  |  |  |
| 原：慣用句110集  | rights_hold | 111 | 91 |  | 要 | ⚠️ |
| 原：接続詞使用頻度順（話し言葉） | frequency_metadata | 101 | 49 | 2 | 要 |  |
| 原：接続詞使用頻度順（書き言葉） | frequency_metadata | 101 | 50 | 2 | 要 |  |
| 原：副詞使用頻度順 | frequency_metadata | 103 | 76 | 3 | 要 |  |
| 原：動詞使用頻度順 | duplicate_skip | 101 |  |  | 要 |  |
| しりとり・連想ゲーム | exercise_candidates | 1001 |  |  | 要 |  |
| 雑談（リアクション会話のコツ） | metadata_only | 12 |  |  |  |  |
| 動詞使用頻度順 | frequency_metadata | 101 | 22 | 8 | 要 |  |
| ファシリテーション | metadata_only | 64 |  |  | 要 |  |
| 日本の29歳以下のビジネスメッセージ67選 | rights_hold | 68 |  |  | 要 | ⚠️ |
| 原：接続詞（種類順） | vocab_integration | 98 | 75 | 7 | 要 |  |
| オノマトペ100集（完成版） | vocab_integration | 102 | 101 |  |  |  |
| 会話力UPネタ17集 | metadata_only | 19 |  |  | 要 |  |
| 自動詞・他動詞46選 | vocab_integration | 54 | 47 | 9 | 要 |  |
| 頻出表現 | example_integration | 102 |  |  |  |  |
| 疑問詞（ぎもんし） | vocab_integration | 52 | 3 |  |  |  |
| 指示語 | vocab_integration | 14 | 7 | 1 | 要 |  |
| 数字表現 | vocab_integration | 184 | 144 |  |  |  |
| 基礎会話練習GW のコピー | example_integration | 51 |  |  |  |  |
| 基礎計画表（全24回） | metadata_only | 25 |  |  |  |  |
| 助詞① | grammar_integration | 14 |  |  |  |  |
| 助詞② | grammar_integration | 11 |  |  |  |  |
| 「です・ます」文（敬语句型） のコピー | grammar_integration | 44 |  |  | 要 |  |
| 動詞活用形 | grammar_integration | 188 |  |  |  |  |


---

## Phase 3P-2 実績（Deterministic Excel Intake・2026-07-28）

このBacklogの「未統合」定義は3P-2で細分化された。以後の単一情報源は
`generated/excel-intake-inventory.json` ほか5 manifest（生成:
`scripts/ai-course/generate-excel-intake-manifests.py`・workbook sha16 8b365e6186b9189d）。

| 指標 | before（3P-1） | after（3P-2） |
|---|---|---|
| Inventory未登録シート | 26 | **0**（40/40が理由付きsheetState） |
| intakeStatus未分類行 | 全行 | **0**（登録2,089候補すべて終端状態） |
| 第一弾4シートの意味未分類 | 614 | **0** |
| provenance欠損 | 未計測 | **0** |

- sheetState内訳: first_wave_classified 4 / deferred_to_phase 16 / already_integrated 11 /
  awaiting_rights_rewrite 3 / duplicate_source_sheet 2 / excluded_by_explicit_rule 7（メタデータ）
- intakeStatus内訳: classified 493 / deferred_to_phase 662 / duplicate_source_row 555 /
  awaiting_rights_rewrite 379
- 第一弾分類: new_item 411（オノマトペ100含む）/ expression 120 / reuse_existing 64（sense統合は人間判断）/
  new_grammar_pattern 19（複合動詞第二要素）/ conflict 0（かな語の二重登録バグ修正後）
- 旧「既存重複113行」の再導出: 既存140語との表記一致は**64件**（第一弾のみ。旧113はセル単位の
  概算だったため過大。全シートの意味分類完了時に再集計する）
- rights 3シート（営業200・慣用句111・ビジネスメッセージ68=379行）: 全行awaiting_rights_rewriteで
  登録・非採用・非削除。独自教材への置換は3P-5、置換関係はsourceCandidateIdで追跡
- 教材本体への変更・自動追加は一切なし。全候補reviewStatus=draft
