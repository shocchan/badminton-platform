# しくみラボ 情報源の優先順位（Phase 1）
## 5層構造
| 層 | 情報源 | 用途 | sourceKind |
|---|---|---|---|
| 1 | JF日本語教育スタンダード／JF生活日本語Can-do（CEFR A1-B1） | **学習目標の骨格**（何ができるか） | official_framework |
| 2 | いろどり生活の日本語（公開目次・学習領域のみ）・標準初級教材の学習領域 | 生活場面・学習順序の参考（**本文・例文・音声はコピーしない**） | official_course / reviewed_textbook_scope |
| 3 | JLPT公式のN4/N3/N2レベル説明・公式問題例（構成参考のみ） | 試験軸（会話全体をJLPTで設計しない） | jlpt_official |
| 4 | きそ〜詞.xlsx（40シート）・既存N2/N3教材・PREP・指導経験 | **候補抽出・講師優先・中国語話者向け原案**（正式カリキュラムではない） | teacher_workbook |
| 5 | 実利用データ（AI会話で使えなかった語・言い直し・レッスン所見） | 個人化・優先度更新 | learner_need / coach_observation |
## 頻度の扱い
Excelの「使用頻度順」「頻出度」「no.」は**外部コーパス根拠が未確認**→ `corpus_frequency`を付けず **teacher_priority** として保持。利用者向け表示は「会話優先語彙」「講師推奨」までとし、**根拠のない順位番号は非表示**。優先度タグ: corpus_frequency / textbook_core / life_utility / conversation_utility / teacher_priority / learner_need / jlpt_relevance（複数付与可・priorityReasonsに理由を残す）。
## 採用基準（§6）
生活/会話での使用可能性・複数場面再利用・初級文法/活用/助詞練習への適性・JLPT関連・中国語話者の誤りやすさ・本人目標・24週内必要性・レッスン頻出 → **Core A（全員必須・N4/N3土台）/ Core B（多くに有用）/ Goal（本人目標）/ JLPT / Extended（オノマトペ・慣用句・複合動詞・ビジネス）**。総数は決め打ちせず監査から提案（→coverage-audit）。
## 禁止事項（再掲）
タブ=カテゴリ化／行順=学習順序／チェック欄=approved／中国語訳の無審査確定／Excel外の語の除外／全行公開／自動approved。
