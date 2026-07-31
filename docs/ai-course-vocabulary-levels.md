# 語彙レベル分類（Phase 2C++ §34）

## 原則
- JLPTレベルは**目安**（jlpt_nX_estimate）。「公式JLPT単語」「覚えれば必ず合格」等の断定表記は禁止
- Excelシート名だけを根拠にレベルを自動確定しない。N3文法シートの例文に出た語をN3語彙と断定しない
- 確信が低い語は unclassified / unreviewed のまま残し、人間レビューで確定する

## モデル（vocabularyLevelMeta.ts・Itemと分離）
levelTags（foundation/jlpt_n5〜n1_estimate/daily_life/conversation_core/business/unclassified）＋
levelConfidence（high/medium/low/unreviewed）＋levelEvidence（根拠・利用者非表示）。

## 現状（78語MVP）
明示分類24語（transparent/false friend/会話コア中心・confidence high〜medium）、残り54語=unclassified/unreviewed。
N4/N3/N2目安の本格付与は語彙拡張時に人間レビューとセットで実施。
