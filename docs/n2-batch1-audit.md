# N2文法 Batch 1（n2g-001〜010）内部監査＋Batch 2〜10計画（Phase N2-B2）

> Batch 1 の教材品質を人間確定できる状態に整えるための監査。**全項目 draft・approved=0・learner非公開**。
> 本番デプロイ・main マージ・DB/Edge 変更・原本Excel変更なし。

## 1. Batch 1 再監査（内容整合性）で修正した点
| 項目 | 発見した問題 | 対応 |
|---|---|---|
| n2g-001 あげく | similarに 006「上で」を誤リンク（本来は「〜末に」だが原本Batch1外） | リンク削除。reviewFlags で similar_pending 相当を注記（要人間追加） |
| n2g-006 上で | 多義（観点／順序／名詞修飾）を1項目に混在 | **senses[] に3用法を構造分離**（下記5） |
| n2g-006 上で | similarに 007「上は」を弱リンク | 別義のため削除 |
| 全10項目 | AI作成のため正確性未確定 | reviewFlags に verify_zh / verify_examples / verify_quiz を付与、全て draft |

- 問題（30問）: 正解index範囲内・選択肢重複なし・説明ja/zhあり・questionId一意を自動検査で担保（`n2GrammarContent.test.ts`）。ただし**正解の一意性・distractorの妥当性は人間確認必須**（quiz CSV の ambiguityRisk 欄）。

## 2. 特別監査: n2g-003「以上は」 vs n2g-007「上は」
| 観点 | 003 以上は | 007 上は |
|---|---|---|
| 意味 | 既然…就（理应/必须） | 既然…（下定决心）… |
| 接続 | 動詞普通形＋以上は／名詞＋である＋以上は | 動詞た形／辞書形＋上は |
| 使用場面 | 決意・義務・当然（やや硬め） | 決意・覚悟（より書き言葉・硬い） |
| 文体 | 会話でも可 | 書き言葉寄り |
| 類義 | からには | からには／以上は |
| 原本メモ | — | 「3と同じ」 |

**推奨方針（人間判断まで実施しない）**: 意味はほぼ同じ。**独立項目として維持しつつ相互 similarGrammarIds でリンク**し、詳細で差（文体・硬さ）を明示するのが無難。完全統合するなら 007 を 003 の `variants` に寄せる案もある。→ **finalDecision は人間**（grammar CSV）。

## 3. n2g-006「上で」の sense 分離（多義構造）
`senses[]` に3用法を構造化（UIでも分離表示）:
1. **ue-de-aspect**（観点・場面）: 動詞辞書形／名詞＋の＋上で ／「会話力を上げる上で…」
2. **ta-ue-de-order**（順序・前提）: 動詞た形＋上で ／「確認した上で返事します」
3. **ue-de-no-noun**（名詞修飾）: 〜上での＋名詞 ／「生活する上での注意点」

## 4. レビュー成果物（改善済み）
- `docs/n2-grammar-review.csv`（**26列**・180行）: sourceExpression/expression/variants/reading/meaningJa/meaningZh/connection/nuanceJa/nuanceZh/conversationExamples/listeningExample/readingExample/similarGrammarIds/differencesJa/differencesZh/commonMistakes/chineseSpeakerNotes/substitutionTemplate/reviewStatus/reviewFlags/reviewerNotes/approvalChecklist/finalDecision。Batch1の10項目は本文入り、他は原本のみ。
- `docs/n2-quiz-review.csv`（**12列**・30行）: questionId/grammarId/questionType/prompt/choices/correctIndex/explanationJa/explanationZh/wrongAnswerReasons/**ambiguityRisk**/reviewerNotes/finalDecision。
- `docs/n2-unit-structure.csv`（180行）: unit12/grammarId/originalNo/sourceUnit/role/linkedMissionIds/orderingReason。
- **承認チェックリスト**（各行 approvalChecklist 欄）: 意味／中国語／接続／ニュアンス／例文／類似差分／問題正解／誤答理由／会話自然さ／N2レベル。

## 5. dynamic import 分割（chunk）
| チャンク | 変更前 | 変更後 | 読み込み |
|---|---|---|---|
| AiCoursePage（初期） | 145KB | **145KB（不変）** | AIコース初期表示 |
| CourseN2Grammar（一覧＋index） | 108KB | **41KB** | N2トラックを開いた時 |
| n2GrammarData（本文・例文） | （同梱） | **72KB** | 文法詳細を開いた時 |
| n2GrammarContent（教材＋問題） | （同梱） | **27KB** | 文法詳細を開いた時 |

- 一覧は軽量インデックス（`n2GrammarIndex.ts`）のみ。**一覧を開いても例文・問題本文を読み込まない**（検証: 一覧チャンクに例文 `試験前日`＝0・問題説明 `既然`＝0）。
- 詳細を開いた時に `loadFullGrammar()` が data＋content を dynamic import（ローディング／失敗時再試行・ja/zh）。将来180教材＋540問が入っても一覧チャンクは肥大化しない。

## 6. Batch 2〜10 計画（原則20項目、意味群で±5調整可）
| Batch | 範囲 | 備考 |
|---|---|---|
| 2 | 011〜030 | 得る/得ない・かねる系など |
| 3 | 031〜050 | |
| 4 | 051〜070 | |
| 5 | 071〜090 | |
| 6 | 091〜110 | |
| 7 | 111〜130 | |
| 8 | 131〜150 | |
| 9 | 151〜170 | |
| 10 | 171〜180 | 10項目 |

各バッチ後に: 内容監査 → 品質テスト → review CSV → chunkサイズ → 人間確認対象 を報告。意味の近い文法群は分断しない（件数15〜25で調整）。

## 7. 人間が判断する項目（Batch 1 優先）
1. 001〜010 の中国語訳・接続・ニュアンスの正確性。
2. 30問の正解一意性・distractor妥当性（ambiguityRisk）。
3. 003/007 の統合 or 独立維持（finalDecision）。
4. 006 の3 sense の妥当性。
5. 会話Mission への対応付け（linkedMissionIds・未設定）。
6. 承認する項目の reviewStatus を approved にして learner 公開。

## 8. Batch 2 開始条件
Batch 1 の10項目が**人間レビューで確定（approved 化 or 修正指示）**され、上記の finalDecision（003/007・quiz ambiguity）が入った後に Batch 2（011〜030）へ着手する。
