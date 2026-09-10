# Phase 2-3 — N1 聴解 0 → 模試1回分（2026-09-10）

Phase 1 の監査で、聴解は N5 60／N4 60／N3 100／N2 100 に対して **N1 が 0** だった。
2026-09-05 時点では「N1 聴解は対象外」と決めていたが、基盤フェーズ（CEO 指示 2026-09-10）で
「N1 も模試1回分を持つ」に改めた。

## 結果

| 型 | 本数 | 内容 |
|---|---|---|
| 課題理解 | 6 | 「このあとまず何をするか」。最初に出た案が退けられ、順序が入れ替わる形 |
| ポイント理解 | 7 | 理由・評価点。「〜かと思ったら、そうじゃない」「決め手は〜、〜はおまけ」で候補を消す形 |
| 概要理解 | 6 | 講演・講義・朝礼・ラジオの独話。通説→「しかし」→主張 |
| 即時応答 | 14 | 職場の慣用表現（上げる／目を通す／切り上げる／前倒し／見送る／一存／なかったことにする…） |
| 統合理解 | 5 | 4案の説明＋会話で3条件。誤答は各1条件だけ外れる |
| **計** | **38** | 本試験の N1 配分に合わせた |

- 音源: 38本すべて事前生成（`say -v Kyoko` → m4a）。manifest `total 358 / available 358 / failures 0`。**Realtime は使わない。**
- 既存 N5〜N2 の音源・データは1件も変更なし（生成スクリプトは未生成分だけ作る）。
- 既存の全件検査（advListening.test.ts）を N1 込みで通した: 正解1つ・4択・誤答理由・長さバイアス（最長／最短偶然水準）・言語整合・transcript非漏洩・音声実在。
- 全体テスト 5,311 件 PASS。

## 知識グラフへの接続（この級から）

`ListeningSet.knowledge`（任意フィールド）を追加し、N1 の 38 本すべてに付けた:

| フィールド | 中身 |
|---|---|
| `comprehensionTarget` | この1問が測る理解の対象（例:「〜かと思ったら、そうじゃない」で否定された推測を除き、本当の原因を取る） |
| `distractorDesign` | 誤答の作り方（例: 会話に出た候補をそのまま誤答にする／条件を1つだけ外す） |
| `grammarLinks` | 原稿に**実際に出る** N1 文法の既存ID（n1g-001〜150 のうち 46 種） |
| `vocabularyLinks` | 原稿に**実際に出る** N1 語彙の既存ID（vc-41〜46 のうち 41 種） |
| `domain` | Practical Axis の分野（work／school／health／government／housing／food／money／transport／social／shopping） |

テスト（n1Listening.test.ts）で固定したこと:
- リンク先は実在するID（dangling 0）。**しかも、その文法・語彙が原稿に本当に出ている**（リンクが飾りでない）。
- 即時応答以外の全件に N1 文法が1つ以上リンクされる。
- リンクが偏らない（文法40種以上・語彙40種以上）。分野が6つ以上にまたがる。
- 模試へ `'n1'` 帯として入る（N2 に丸められない）。

## 学習ループへの影響
- `listeningSetsFor('N1')` が 38 を返すので、N1 学習者の「聴解」ビューと N1 ミニ模試の聴解セクション（5問）が動く。
- `advReadiness` の「N1 は聴解を測れない」という特例を外し、他の級と同じく**実在庫**で判定する。
- N5〜N2 の `knowledge` は未付与（undefined）。Phase 4 で遡って付ける候補。

## ファイル
| ファイル | 変更 |
|---|---|
| `adventure/listening/n1ListeningSetsA.ts` | 新規。38本 |
| `adventure/listening/listeningTypes.ts` | `ListeningKnowledge` と `knowledge?` を追加 |
| `adventure/listening/listeningBank.ts` | N1 を連結。`'n1'` 帯。coverage の型に N1 |
| `adventure/advReadiness.ts` | N1 特例を撤去 |
| `scripts/ai-course/generate-listening-audio.mjs` | 話者ラベル7つ追加（担当者・教授・記者・専門家・社長・面接官・応募者） |
| `public/audio/ai-course/n1l-*.m4a` | 38本 |
| `docs/ai-course/adventure-v2/generated/{listening-sets,audio-manifest}.json` | 再生成 |
