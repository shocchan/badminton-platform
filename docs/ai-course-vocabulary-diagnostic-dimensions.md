# 語彙診断の次元モデル（Phase 2E-1 §4-§6）

作成: 2026-07-27。実装: `vocabProgress.ts`（schemaVersion 2）／`vocabDiagnostic.ts`／`vocabDiagnosticPool.ts`。

## 1. 「確認済み」の意味を次元別に分ける

旧（Phase 2D）: 1問正解で `confirmed`（何を確認したか不明瞭）。

新: Item×次元で記録する。次元 = `reading / meaning / usage / collocation / particle / conjugation`。
各次元の状態:

| 状態 | 意味 |
|---|---|
| not_tested | 未出題（エントリ不存在で表現） |
| supported | 補助あり正解（カード直後の確認など） |
| confirmed | 自力正解 |
| needs_review | 誤答 |

利用者向け表示は「読みを確認しました」「助詞をもう一度確認しましょう」等。
**「習得済み」「マスターしました」という表現は使わない**（UIには `outcomeNote` を常設）。

## 2. Item全体の結果（DiagnosticOutcome）

`deriveDiagnosticOutcome()` が導出（Repository外で二重管理しない）:

- いずれかの次元が needs_review → **remedial**
- reading と meaning が confirmed → **basic_confirmed**（基礎確認済み）
- それ以外で何か確認済み → **partially_confirmed**（残り次元は引き続き確認対象）
- 未出題 → **diagnostic**

「使い方確認済み」= usage/collocation の確認、「定着確認済み」= 別日・別問題の自力正解
（従来どおり deriveMasteryState の retained 判定。診断1回では到達しない）。

basic_confirmed でも永久除外しない: 本人が「まだ不安」・後日の誤答・別次元未確認・
関連単元での必要時には再表示される（3分復習・pickDailyWords が復習候補を優先）。
診断結果と自己評価（self_known）は別管理で、self_known にしても outcome は変わらない（テストで強制）。

## 3. v1→v2移行（§29）

v1の診断は `'confirmed' | 'remedial'` の文字列。移行時は `legacy` フィールドへ保持し、
**どの次元を確認したかをでっち上げない**: legacy confirmed → partially_confirmed / legacy remedial → remedial。
entries（自己評価・テスト履歴）は無傷。不正JSON・未知バージョンはクラッシュせず初期化。

## 4. 診断問題プール（§5）

固定比率をハードコードせず、プール＋生成問題から決定的に構成（`buildDiagnosticSet`）:

- 対象: diagnostic role の未診断Item。1Item最大2問。重複問題なし。全タップ式。
- 基礎: 10〜15問（78語→実測13問: 読み4・意味2・組み合わせ1・用法2・助詞2・活用2）
- N3: 12〜18問（62語→実測12問: 読み3・意味4・コロケーション3・用法2）
- transparent語は読み・用法優先（例: 中国の1問目は読み）。false friendは意味・使用場面優先
  （都合=用法問題・大変=意味問題）。
- 助詞・活用・自他・類義の問題はプールに存在し（基礎13問中4問が助詞/活用）、
  N3ではrequired語（慣れる・相談する・決まる・変わる・考える等）を対象とするため
  診断セットではなく3分復習・通常確認で使用される。
- 誤答時は関連Item（自他ペア等 `RELATED_ITEM_PAIRS`）を**復習候補にのみ**追加。
  未出題の語へ結果は書かない。

## 5. Phase 2E-2への持ち越し

- 診断次元の正式保存（migration適用後のDB設計）
- 用法次元をLLM会話練習の使用実績と接続する設計（practice session種別が前提）
