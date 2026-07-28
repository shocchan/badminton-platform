# N2問題 Source Inventory（Phase 3A §5・§10）

生成: 2026-07-28 ／ 状態: **登録Source 0件**

## 現状の正直な記載

| 指標 | 値 |
|---|---|
| 登録済みSource | **0** |
| 年数（過去問カバレッジ） | **0年分** |
| legacy_pre_2010 / current_2010_plus | 0 / 0 |
| original / licensed / official_permission_confirmed / public_domain | 0 / 0 / 0 / 0 |
| private_reference_only / rights_unknown / blocked | 0 / 0 / 0 |
| 公開可能問題数 | **0** |
| answer確認済み / human reviewed / approved | 0 / 0 / 0 |

ローカル環境（リポジトリ・scratchpad）に過去問PDF・問題画像・問題集スキャンは**存在しない**。
「20年分」の実体ファイルはまだAI側に渡っていない。

## Sourceが増える起点（CEOの作業）

1. 問題ファイル（PDF/画像/テキスト）を所定の場所へ置く（例: `scratchpad/source-data/n2-questions/<sourceId>/`）
2. 各Sourceについて次を申告する（**これが無い限り登録しない**）:
   - どこから入手したか（出版社・公式・自作・不明）
   - 権利状態の認識（購入書籍＝private_reference_only想定／自作＝original／許諾あり＝その証跡）
3. AIはrights preflight（§9 pipeline）を通し、`rights_unknown` は**内部分析にも本文を使わず**登録のみ

## 年別インベントリのテンプレート（Sourceが届き次第、この形で埋める）

| 年 | ファイル | 問題数 | 答え | 解説 | rightsStatus | formatEra | 画質 | 抽出可否 | 第三者コンテンツ | release可否 |
|---|---|---|---|---|---|---|---|---|---|---|
| （例）2018 | 未提供 | — | — | — | — | current_2010_plus | — | — | — | 不可 |

## 方針の再確認（CEO指示 §0・§10・§11）

- **rights_unknown / blocked のSourceから公開Question Itemを生成しない**（bundle・staging一般画面にも載せない）
- 権利未確認の過去問は、問題本文をruntimeへ取り込まず「形式・論点・頻度」の内部分析に限定
- legacy_pre_2010 は旧形式参考のみ。現行模試スコアへ混入しない
- 公開の主力は**独自問題（original）**: 過去問からは形式・論点・難易度傾向・誤答パターンの一般化のみを
  抽出し、新しい場面・文章・人名・数値・選択肢で作成。originalityReview（sourceSimilarityRisk /
  phraseOverlapRisk / structureSimilarityRisk / originalityReviewStatus）を必須とし高リスクは非公開
- 著作権の最終法的判断はAIが行わない

## N2QuestionSource スキーマ（registry・3Cで実装）

```
sourceId / title / publisher / owner / year / session / formatEra / sourceType /
rightsStatus / permissionEvidence / permittedUses / prohibitedUses / expiresAt /
attribution / originalFileHash / importedAt / reviewStatus
```

- formatEra: legacy_pre_2010 | current_2010_plus | original_current_style
- sourceType: official_sample | official_workbook | licensed_past_exam | commercial_book |
  teacher_created | ai_draft | user_private_reference | unknown
- rightsStatus: original | licensed | official_permission_confirmed | public_domain |
  private_reference_only | rights_unknown | blocked
