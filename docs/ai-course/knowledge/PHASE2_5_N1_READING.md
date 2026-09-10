# Phase 2-5 — N1 読解の coverage 監査と補完（2026-09-10）

## 監査

N1 読解は 30 セット（主題6・統合6・中文6・長文6・情報検索6）で、指示にある観点と照らすと:

| 観点 | 既存 | 判定 |
|---|---|---|
| abstract argument / abstract opinion | 主題6・中文6・長文6 | あり |
| comparison（二つの意見の比較） | 統合6 | あり |
| information integration | 統合6・情報検索6 | あり |
| long passage | 長文6 | あり |
| editorial-like original text | 主題6・長文6 | あり |
| **implicit meaning（「〜とはどういう意味か」）** | 主題・中文に一部 | **型として無い** |
| **workplace document（社内文書・取引先文書・通知）** | 情報検索は案内・規約のみ | **無い** |
| **短文（本試験「内容理解（短文）」）** | 0 | **無い** |

本試験の N1 短文は「仕事の文書」と「200字前後の評論の断片」で、上の3つの欠けはすべてこの型に当たる。
主題・中文・長文の水増しはせず、**短文 12 本だけ**足した。

## 追加したもの

| 種類 | setId | 内容 | 問い |
|---|---|---|---|
| 仕事の文書 6 | n1r-short-01〜06 | 会議変更の社内メール／納期延期の詫び状と代替提案／経費精算の通知／議事録／製品不具合の案内／担当引き継ぎ | 「受け取った人は何をするか」「決まったことはどれか」「合っているものはどれか」 |
| 評論の断片 6 | n1r-short-07〜12 | 便利さの代価／沈黙と同意／専門用語は地図／後悔と反省／褒め言葉の副作用／分からないと言える強さ | 「筆者の言う『〜』とはどういう意味か」「なぜ問題にしているか」 |

- N1 読解: **30 → 42**（6型）。既存 30 本は無変更。
- 既存の全件検査（advReading.test.ts）を通した: 根拠が本文に実在／正解1つ・4択／長さ比 3.2 倍以内／
  「最長を選ぶ」「本文と最も長く一致するものを選ぶ」戦略が偶然水準以下／誤答すべてに理由（日中）／本文にラテン文字なし。
- 評論の断片の誤答は「本文にあるが指示語の中身ではないもの」「言い過ぎ」「逆」の3種に固定。
  仕事の文書の誤答は「文書内の別の項目」「主語の入れ替え」「否定された行動」。

## 知識グラフへの接続

`ReadingSet.knowledge`（任意）を追加し、短文 12 本すべてに付けた。聴解と同じ形
（`knowledge/materialKnowledge.ts` の `MaterialKnowledge`。`ListeningKnowledge` はその別名にした）。
リンク先は実在する ID で、**その文法・語彙が本文に実際に出る**ことをテストで固定（n1Reading.test.ts）。
N5〜N2 と N1 の既存 30 本は未付与（Phase 4 で遡る候補）。

## ファイル
| ファイル | 変更 |
|---|---|
| `adventure/reading/n1ReadingShortA.ts` | 新規。12本 |
| `adventure/reading/readingTypes.ts` | `knowledge?: MaterialKnowledge` |
| `adventure/reading/readingBank.ts` | 短文を連結 |
| `knowledge/materialKnowledge.ts` | 新規。読解・聴解共通の接続型 |
| `adventure/listening/listeningTypes.ts` | `ListeningKnowledge = MaterialKnowledge` |
