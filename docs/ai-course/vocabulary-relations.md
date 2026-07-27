# 語彙の関連（VocabularyRelation・Phase 2E-1.5 §24）

「ことば図鑑」詳細画面に、高確信の関連語（自他ペア・類義）を最大2件のリンク付きノートとして表示する。

## データ

- `src/lib/aiLesson/course/vocabRelations.ts` — 14件（自他ペア5＋類義9）・全draft
- 自他ペア例: 変わる/変える・決まる/決める・続く/続ける・始める/終わる（対比）
- `relationsForItem(itemId)` は対称に解決（A→BがあればB→Aも返る）

## 方針

- 高確信・教育的に有用なもののみ。網羅目的で増やさない
- 診断の3分復習では誤答語の関連Itemを候補の後方へ追加（結果はでっち上げない・`pickQuickReviewItems`）
- テスト: `vocab2e15.test.ts`（関連の整合性・対称性・実在ID）
