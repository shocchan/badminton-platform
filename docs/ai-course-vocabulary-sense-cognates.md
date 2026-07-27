# Sense別の中国語同源語分類（Phase 2E-1 §7-§8）

作成: 2026-07-27。実装: `vocabContentMeta.ts`。全draft。

## 1. 方針

- Item全体の代表分類（`vocabularyLevelMeta.ts` の cognate）は維持する。
- **Item分類だけでは誤解が出る多義語に限定して** Sense別に上書きする。全語へ無理に付けない。
- 未レビューSenseの学習ポイントは利用者へ表示しない（draftのみ表示）。

## 2. 現在の登録（4語8Sense・うち未レビュー2Sense）

| 語 | Sense | 分類 | 学習ポイント（要旨） | 状態 |
|---|---|---|---|---|
| 高い | takai-price | partial_overlap | 价格贵→「高い」（中文说「贵」） | draft |
| 高い | takai-height | mostly_same | 高度は中文「高」と一致 | draft |
| 聞く | kiku-listen | partial_overlap | 听。中文「闻」是闻气味 | draft |
| 聞く | kiku-ask | japanese_specific | 问も「聞く」: 先生に聞きます | draft |
| 大変 | taihen-hard | false_friend | 辛苦。不是「大变」 | draft |
| 大変 | taihen-serious | false_friend | 「大変だ！」=不得了 | unreviewed |
| 都合 | tsugou-convenience | false_friend | 都合がいい/悪い=时间方便与否 | draft |
| 都合 | tsugou-arrangement | false_friend | 都合により=因故（书面） | unreviewed |

senses追加: 大変・都合はPhase 2E-1でItemへsenseを追加（高い・聞くは既存）。

## 3. 集計の分離（§7）

`aggregateSenseCognates()`（同一Senseを重複カウントしない）:
- Item代表分類: `aggregateCognates()`（140語=分類済み40＋unreviewed 100）
- Sense上書き: 4語・8Sense・未レビューSense2

報告・docs・UIはこの2関数のみ使用。手計算禁止。

## 4. 中心意味と学習ポイントの分離（§8）

- `meaningZhShort`: 明示指定（例: 都合=「情况是否方便；时间安排是否合适」）または
  meaningZh第1義の決定的切り出し。詳細画面は中心意味を先に表示し、
  学習ポイント（learningFocusZh・37語）は展開表示。全文の羅列をしない。
- usageNoteZh（53語）は例文カード内の注意として継続表示。

## 5. 今後の候補（未実施・人間レビューと合わせて判断）

見る（看/看病等）・必要・状況・経験・意見・変わる・決まる。
現時点ではItem分類＋learningFocusZhで誤解が出ない範囲と判断し、Sense上書きは追加していない。
