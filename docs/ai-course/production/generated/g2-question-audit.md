# G2 問題品質監査（2026-07-29・session-12続き / H4）

対象と方法: `scripts/ai-course/g2-question-inventory.ts`（単一集計）と
`scripts/ai-course/g2-dump-questions.ts`（監査用ダンプ）で全問題を抽出し、
機械検査（漏洩・同一プロンプト複数正解・対象語重複distractor）＋全数人手レビューを実施。

## 対象数（機械集計）

| 種別 | 数 | レビュー方法 |
|---|---|---|
| N2 recognition（4択） | 173 draft＋7 pre-draft＝**180** | 全数人手レビュー |
| N3 生成問題（unique questionId） | **477** | context/collocation/conjugation/core_meaning/transfer/scope=全数人手、reading=機械検査、order=例文完走テスト |

## 結果サマリ

| 判定 | N2 | N3 |
|---|---|---|
| P0（正解なし・データ破壊） | 0 | 0 |
| **P1（複数正解・誤答・漏洩）** | **0** | **20 → 全て修正済み** |
| P2（設計・文面の粗） | 2 → 修正済み | クラスとして記録（下記） |

機械検査: 答え漏洩 0／修正後の同一プロンプト複数正解グループ 0／対象語を含むdistractor 0。
修正後もテスト 1070 全pass・恒等式 173+7=180 不変・reviewStatusは全件draftのまま。

## 修正内容

### N2（2件・draft内の修正）
1. `n2g-012 〜得ない`: 設問が敬語緩衝を問い、パターン使用選択肢「あり得ません」が誤答扱いになる紛らわしい設計
   → 例文の意味を問う設問へ差し替え（敬語注意はexplanationへ移設）
2. `n2g-125 〜に沿って`: 選択肢文に英字「plan」混入 → 「プラン」へ

### N3 P1: 複数正解クラス（20件）

原因は2クラス:

**A. 文脈穴埋めのフレームが開きすぎ（18件）** — 「＿＿です。」「＿＿店です。」等の短いフレームでは
同品詞distractor（大きい/小さい/好き 等）も自然な文になる。
→ 該当24語の `exampleJa/exampleZh` を「distractorが文法・意味的に成立しないフレーム」へ改稿
（例: 会社は少し遠い→**家から**少し遠い／この店は高い→**値段が**高い／音楽が好き→音楽を**聞くのが**好き／
＿＿な部屋です→**赤ちゃんが寝ているので、静かに話します**／有名な店です→**この歌手は世界中で**有名です）。
`vocabFurigana.ts` のsegmentsも全て同期（連結一致テストでpass）。
対象: 遠い・高い・好き・元気・便利・上手・多い・難しい・簡単・複雑・学生・会社員・学校・病院・これ・水・
大きい・小さい・安い・新しい・古い・静か・有名・いくら

**B. collocation問題のdistractorが対象語を含む（2件・engine修正で恒久解消）** —
「状況」を使う言い方の誤答に「状況が変わる」が出る等。
→ `assessQuestionEngine.collocationQuestion` に対象語（lemma/displayForm）を含むdistractorの除外を追加。
既存の正常問題のdistractorは不変（決定的順序を維持）。

## P2/P3（backlogへ・今回は修正しない）

- **QP-1 distractorの単調さ**: core_meaning/contextの誤答がpool先頭（姓名/出身地）に固定されがち。
  seeded rotationの導入はエンジン変更＋既出題との整合検討が必要（P2）
- **QP-2 動詞穴埋めの形の手がかり**: 「＿＿ました」枠に辞書形distractor（住む/働く）が出るため
  意味を知らなくても形で解ける（P2。単一正解性は損なわない）
- **QP-3 連体修飾フレームの脆さ**: 「＿＿＋名詞」枠は本質的に多義。今回は例文改稿で回避したが、
  新語追加時は同クラスの再発に注意（データ作成ガイドとして記録）
- **QP-4 「全然＋肯定」**: 口語では許容が広がっているが、教材は標準の「全然〜ない」を正とする（現状維持・P3）

## 再実行方法

```bash
./node_modules/.bin/vite-node scripts/ai-course/g2-dump-questions.ts /tmp/g2
# → n2-recognition.tsv / n3-questions.tsv を目視＋機械検査
```
