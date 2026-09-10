# Phase 3 — Knowledge Graph × Learning OS（2026-09-10）

教材を増やして終わらせない。既存の記録を**知識項目ID単位**で読み直し、
「選択問題では分かる」「自分で言える」「会話で使えた」を別々の習熟として持ち、次の一手を出せるようにした。

## 3-1 Mastery — 既存 `AdvMasteryLedger` をそのまま正準IDの台帳として使う

- 台帳のキー（targetId）は既存の grammarId／unitId／stage束ID。**parseKnowledgeId が読める形なので、そのまま正準 Knowledge ID**。
  番号を振り直していない。
- 台帳の中の問題キーから知識項目へ戻す adapter を足した（`knowledge/learnerKnowledgeState.ts`）:
  `rec:/cloze:/meaning:/form:<grammarId>` → 文法、`vocab:表記:読み:観点` → wordId（`vocabIdIndex`）、
  `listen:/read:<setId>` → 教材。読めないキー（kanji: など）は繋がない。
- **台帳は読むだけ。1件も書き換えない。** 攻略判定（advMastery）・錯題本（advMistakeNotebook）は無変更。

## 3-2 Review — 既存の復習へ戻す

- `dueKnowledgeItems(state, dateKey)` → `{ wrongYesterday, fading }`（項目ID）。
  忘れかけの間隔は教室の看板と同じ **1・3・7・30 日**（連続正解数で段階が上がる）。
- `reviewKeysForItems(notebookEntries, itemIds)` で**既存の錯題本の問題キー**へ戻す（未克服のみ）。
  新しい復習エンジンは作っていない。復習バトルには今までどおり問題キーが渡る。

## 3-3 Retry — 言い直しの成否を知識項目へ

- profile に `knowledgeLog`（append-only・上限400）を追加。ここに書くのは**台帳が持てない出来事だけ**
  ＝言い直し・再挑戦の成否。選択問題の正誤は台帳から毎回導出し、書き写さない（二重管理にしない）。
- 配線: 言い直し（AdvShell `finishRestate`）で、素材が「バトルで落とした文法」なら
  `{ itemId: grammarId, channel: 'production', kind: 'restate', ok }` を記録する。
  会話レポートの直し（ID無し）は記録しない＝当てずっぽうで項目に繋がない。
- これで「問題では間違えたが、言い直しでは成功した」が区別できる（テストで固定）。

## 3-4 Recognition / Production / Conversation の分離

`KnowledgeItemState = { recognition, production, conversation }`。各経路は
`untested / failing / shaky / solid`（直近の結果と連続正解数で決める）。
- recognition: 台帳（選択問題）
- production: knowledgeLog（言い直し・再挑戦）
- conversation: AI会話ミッション（`advconv-<grammarId>`）の完了セッション。**「自分で使えた」（targetUsage=self）だけを成功**にし、ヒント付きは成功にしない。
- `knownButCannotProduce(state)` ＝「選択では分かるが自分では言えない」項目。

## 3-5 Next Best Action

`nextBestActions(state, { dateKey, edges?, candidateIds? })` が優先順に返す:

| 順 | action | 条件 |
|---|---|---|
| 1 | production_retry | 選択 solid/shaky × 産出（または会話）failing。昨日の失敗は更に前へ |
| 2 | prerequisite_review | 選択 failing で、知識グラフの隣（similarPatterns の辺）も failing → 隣を先に |
| 3 | review_recognition | 選択 failing（昨日間違えたものが先） |
| 4 | production_first | 選択 solid・産出も会話も未確認 → 一度言ってみる |
| 5 | refresh | 忘れかけ（1・3・7・30日） |
| 6 | conversation_apply | 選択 solid・産出 solid/shaky・会話 未 → AI会話で使う |

仕様の例「昨日 n3g-xxx：recognition成功・production失敗 → 翌日は同じ文法の production を優先」をテストで固定した。

**配線した範囲**（推薦AIの完成ではなく、データ接続）:
- AdvShell の弱点文法（`weakGrammarIds`）を、**級で絞らず全文法**から取り、`rankWeakGrammarIds` で並べ替える
  （産出で失敗しているものが先）。以前は N2/N3 の文法しか弱点にならなかった＝N1・N5/N4 の文法は何度落としても弱点扱いされなかった。
- 「今日の冒険」の生成（advQuest）は無変更。渡す配列の中身と順序が良くなった。

## ついでに直した級の忠実性（同じ commit）

- `VOCAB_BANDS_IN_SCOPE.N1` に **`vocab-n1` が無く**、N1 目標の語彙バトルが N2 語までしか出ていなかった
  （N1 語彙 513 語がバトルに一度も出ない）。帯を足し、`n1_grammar` ステージは N1 語と N2 語を日替わりに、
  N1 の模擬ボスは N1 語にした。テスト `advQuestN1Vocab.test.ts`。

## 実在生徒データ
- 本番の学習履歴は読んでいない・変えていない。全て単体テストと合成データ。
- `knowledgeLog` は旧データに無いフィールドで、restore が `[]` を入れる（既存プロフィールはそのまま読める）。

## ファイル
| ファイル | 変更 |
|---|---|
| `knowledge/learnerKnowledgeState.ts` | 新規。adapter・状態・due・review 接続・Next Best Action |
| `knowledge/vocabIdIndex.ts` | 新規。`表記|読み` → wordId |
| `adventure/advTypes.ts` / `advProfile.ts` | `knowledgeLog` の型・既定値・restore |
| `adventure/advQuest.ts` | `vocab-n1` の帯 |
| `components/.../AdvShell.tsx` | 弱点文法の全級化と並べ替え／言い直し成否の記録 |
| テスト | `learnerKnowledgeState.test.ts`（16）・`advQuestN1Vocab.test.ts`（4） |
