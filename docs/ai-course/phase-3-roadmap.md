# Phase 3 ロードマップ（教材Release完成・Excel全量統合・N2問題演習）

作成: 2026-07-28（Phase 3A完了時点） ／ 各PhaseごとにSTOP/CONTINUEをCEOが判断

## 前提となる実態（3A監査の結論）

- 語彙140語は接続・品質は高いが**公開可能（approved）は0**（人間レビュー待ち）
- N2文法180は**骨組みのみ**（中文0・出題0・接続0）— N2演習の土台として大工事が必要
- Excel未取込は28シート・語彙候補約1,242行（既存と重なる約113行は統合判断が必要）
- **N2問題Sourceは0件**。過去問はローカルに存在せず、権利確認が全ての起点
- N4層の教材源が現Excelに無い（「N4/N3/N2提供」には別途調達が必要）

## Phase 3B: Excel統合・重複・Sense・provenance

- 目的: ①権利クリアなシートの行レベル取込基盤（provenance必須・行順ID禁止）
  ②既存140語との統合判定（reuse_existing_item / add_new_sense / add_new_item /
  add_expression / relation_only / conflict / exclude）③自動統合は高confidence完全一致のみ
- 人間判断: Sense統合・中心意味変更・品詞変更・例文競合・レベル断定・required判定
- 前提: 権利要確認3シートのCEO判断／取込優先シートの指定
- 規模目安: オノマトペ100・慣用句110（権利次第）・複合動詞30・頻出表現100・最低限表現418 ほか

## Phase 3C: Question Source Registry・Question schema・内部取込preview

- N2QuestionSource registry実装（rightsStatus必須・rights_unknown/blockedのexport構造的除外）
- N2QuestionItem schema実装（n2-question-schema.md準拠）＋labPreview限定の内部preview
- 取り込みPipeline（§9）の内部版（human review queueまで）
- 前提: CEOからの問題Source提供＋権利申告（無ければ独自問題のみで3Dへ）

## Phase 3D: 初期50〜100問（権利確認済み or 独自）

- 独自問題を主力に、語彙・文法セクションから開始（読解・聴解は後続）
- §12二重確認（正解の source一致 or 人間確認）を通過した問題のみ公開候補
- 選択式問題UI（§8）実装。既存Journeyの冪等・再開原則を踏襲

## Phase 3E: 既存教材・復習・弱点との接続

- 誤答→vocabularyLinks/grammarLinks→既存needs_review→翌日/3日後/7日後Repository
- **N2文法180の中文訳・出題化・接続の本格作業はここが主戦場**（180項目の中文はCEOレビュー前提）
- 学習モード: 5問ミニ演習・分野別・弱点別・間違えた問題・復習期限

## Phase 3F: 模試・Coverage・Release Gate・物理端末QA

- 模試（現行形式のみ・未完成セクションがあれば「総合N2模試」と呼ばない）
- 結果表示は正答数・正答率・分野別・弱点・次の教材のみ（JLPT換算点・合格確率は出さない）
- Coverage Dashboard（内部）・Release Gate判定・実機QA

## 各Phaseの共通ルール

目的1〜3個／論理コミット2〜6件／テスト・docs・staging・completion report／
権利ゲート（copyright-and-rights-gate.md）常時適用／human_reviewed・approvedの自動昇格禁止／
共有Supabase・本番・mainは引き続き承認制。

## 3Bへ進む条件（CEOの判断待ち）

1. 権利要確認3シート（慣用句110・ビジネスメッセージ67・営業用語200）の扱い決定
2. 3Bで優先する取込シートの指定（推奨: オノマトペ完成版→複合動詞→頻出表現→最低限表現）
3. N4層の方針（現Excelに無い。調達するか、N5-N3+N2構成と正直に表示するか）
4. N2問題Sourceの提供有無（無ければ3C/3Dは独自問題のみで設計）
