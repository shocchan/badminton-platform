# Phase 3P-2 指示文（監督ChatGPT発行・2026-07-28）

decision: CONTINUE
phase_name: Phase 3P-2 Unified Content Candidate Model & Deterministic Excel Intake

## 監督による修正点（私の3P-2案への差分）

- 「全1,242候補行の意味分類完了」を完了条件にしない。第一弾4シートのみ意味分類まで、
  残りは**理由付きintakeStatus**（deferred_to_phase等）で全行登録する
- 「未分類0」の定義=全行が終端状態を持つこと（教材採否が決まることではない）
- 判断できない行をexcludeへ自動分類して数だけ減らすことを禁止
- 既存重複113件は旧報告値を固定せず、新分類モデルで再導出して差異を報告
- conflictは専用manifestへ。無理にreuse/newへ解決しない
- 中国語訳の言い換え違いだけでnew_senseにしない

## 指示文の要点（全文はChatGPTスレッド参照）

- 目的A: 統合候補データモデル確定（word/sense/expression/collocation/compound_verb/onomatopoeia/grammar/unknown）
- 目的B: 全シート・全候補行のInventory登録（provenance・rights state・intakeStatus付き）
- 目的C: 権利クリア第一弾4シート（オノマトペ100完成版・複合動詞一覧・頻出表現・最初に覚える最低限表現）の決定的分類
- intakeStatus: classified / awaiting_rights_rewrite / awaiting_source_review /
  awaiting_human_semantic_review / deferred_to_phase / invalid_source_row /
  duplicate_source_row / excluded_by_explicit_rule
- ID: sourceCandidateId（元位置ベース・決定的）と contentFingerprint（内容ベース）を分離。
  行順依存ID禁止・分割候補は親子関係保持
- rights_unknown 3シート（慣用句110・ビジネスメッセージ67・営業用語200）:
  非採用・非削除・awaiting_rights_rewriteで登録・learner-facingへ出さない・置換追跡可能に
- 恒等式: raw rows = registered + structural(理由別) ／ candidates = classified+awaiting+invalid+duplicate ／
  rights合計一致 ／ 第一弾primary分類合計一致 ／ provenance error 0 ／ unclassified 0
- 同期ガード: workbook fingerprint・sheet増減・row count・candidateId重複・参照切れでテスト失敗
- 禁止: 教材本体への自動追加・既存値上書き・既存140語削除・human_reviewed/approved昇格・
  権利最終判断・共有Supabase・migration・RLS・本番・main・learner bundle増加
- parser/generatorはscript側（learner-facing bundleに含めない）
- コミット2〜6件（推奨4件）。報告は§25形式（機械集計値のみ）

## AUTONOMOUS_REVIEWの要点

- problems: 承認field 4,720が推定値のまま／113重複の定義未提示／26シートの内訳不明／
  N2 source品質未監査／N3行数と独立文型数の一致未保証／作成中9件の原因区別なし
- risks: 文字列一致だけの誤reuse・誤exclude／別senseの誤統合／複合動詞・慣用表現の単語型への押し込み／
  provenance喪失／rights_unknown混入／重複二重計上／分類=採用の誤認／Phase肥大化
