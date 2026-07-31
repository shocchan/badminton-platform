# 現教材 Release監査（Phase 3A §1）

生成: 2026-07-28 ／ 集計元: `contentReleaseAudit.ts`（単一集計・手計算なし）
機械可読版: `content-release-matrix.json`

> 原則: **「ファイルを読み込んだ」と「公開教材として利用可能」は別物。**
> 公開可能= approved（人間のみ付与）＋Release Gate通過。現時点の公開可能は語彙0・文法0が**正しい状態**。

## 語彙（140語 = 基礎78 + N3準備62）

| 指標 | 件数 | 備考 |
|---|---|---|
| total | 140 | |
| draft | 140 | item全体は全件draft |
| human_review_candidate（field単位） | 14 | CEO判断14件（2026-07-28） |
| human_reviewed / approved | 0 / 0 | 人間レビュー未実施 |
| required / diagnostic / optional / enrichment | 95 / 37 / 7 / 1 | 生活基礎トラックのrole |
| source verified（Excel等の出典あり） | 93 | external_scope（標準範囲補完）のみ=47語は出典が弱く要人間確認 |
| Chinese verified | 140 | zh未確認issueなし |
| example verified | 140 | 日中例文あり |
| furigana verified | 140 | 例文ふりがな登録済み |
| image verified（実画像draft） | 25 | 残115語はplaceholder |
| conversation connected | 13 | **残127語はgeneric導線のみ**（既知の品質課題） |
| review connected | 140 | 間隔反復へ全接続 |
| **公開可能（approved+Gate）** | **0** | |

## 文法（N2 180項目）

| 指標 | 件数 | 備考 |
|---|---|---|
| total | 180 | 原本「N2の文法180例文集」から自動転記 |
| content complete（読み/訳/接続等の補完済み） | 10 | **170項目が骨組みのみ** |
| example complete | 180 | 原本例文あり |
| Chinese complete | 0 | **中国語訳ゼロ**（needs_meaningZh 180） |
| diagnostic complete | 0 | 出題データなし |
| conversation connected | 0 | なし |
| review connected | 0 | 復習体系へ未接続 |
| human reviewed / approved | 0 / 0 | learner非公開のまま（正しい） |

**結論**: 文法180は「取り込み済み」であって「教材として提供可能」からは遠い。
N2演習を作る前に、文法の中文訳・接続・出題化が土台として必要（Phase 3E以降の主作業）。

## 判断キュー・field状態

- 判断キュー残: 77件（root P0 0・root P1 0）
- CEO field判断: 14件すべて human_review_candidate

## N3の文法120例文集について

Excelに存在するがデータ化されていない（grammar_sourceとして未取込）。N4相当の体系的データは**存在しない**。
「N4/N3/N2の語彙・文法を目標別に提供」には、N4層の教材源の確保が別途必要（現Excelは基礎〜N2で、N4を明示した層がない）。
