# SOURCE PROVENANCE FINAL — 外部情報を何に使い、何を独自に作ったか

作成: 2026-08-02 ／ 検証コマンド: `docs/ai-course/adventure-v2/generated/vocab-independent-sources.json` ＋ 下記の機械照合

**結論: 外部サイトの中国語訳・例文・解説・問題・読解文章・聴解文章は、
1件も保存しておらず、1件も表示していない（機械照合で0件）。**

---

## 1. 使った外部ソース

| sourceId | family | license / 条件 | 取得したfield | 保存したfield | 用途 |
|---|---|---|---|---|---|
| `opensubtitles-ja-50k` | `opensubtitles-opus` | attribution_share（FrequencyWords: MIT／コーパス本文は OPUS 経由 CC BY-SA 相当） | 表層形（token）、頻度順位 | **surface / reading / sourceSuggestedLevel / sourceId / sourceFamily / sourcePosition / retrievedAt のみ** | 「どの語が実際によく使われるか」の候補抽出と飽和判定 |
| `jmdict-eng-common-inventory` | `jmdict` | attribution_share（JMdict © EDRDG, CC BY-SA 4.0） | 見出し語の存在、優先度マーカー（新聞頻度由来） | 同上 | 語の実在確認・レベル推定の独立系統・飽和プローブ |
| `tanos-waller` | `tanos` | 公開レベル分類（参考） | 見出し語、推定レベル | 同上 | レベル推定の1系統 |
| `ninjal-bccwj` | — | — | **未取得**（repository 502） | — | — |
| `jev` | — | 申請フォーム制 | **未取得**（`reference_only`） | — | — |

### 取得しなかったfield（意図的）

すべてのソースについて、次は**取っていない**（`fieldsDeliberatelyNotTaken` に明記）。

- 翻訳
- 例文
- 文脈行
- 字幕本文
- リストの並びそのもの

---

## 2. 独自に作ったもの（学習者に見えるものは全部こちら）

| 対象 | 件数 | 作り方 |
|---|---|---|
| 中国語訳（`glossZh`） | 2,167語 | 自社で書き起こし |
| 語義注記（`senseNoteZh`）・使い方注記（`usageNoteZh`） | 多義語・注意語 | 自社 |
| 例文（`exampleJa` / `exampleZh`） | 2,167語 | 自社 |
| 解説（`explanationJa` / `explanationZh`） | 2,167語 | 自社 |
| 語彙の選択問題 | 10,126問 | 自社コンテンツから決定的に生成（実行時LLMなし） |
| 読解文章・設問・解説 | 220セット | **完全オリジナル**（既存の著作物・過去問を写していない） |
| 聴解原稿・設問・解説 | 200セット | **完全オリジナル** |
| 聴解の音声 | 200件 | macOS内蔵TTS（`say -v Kyoko`）で自社生成 |
| 文法解説・例文 | N2 178 / N3 76項目 | 自社 |
| 冒険マップのランドマーク | 17種 | **自作SVG**（外部ゲーム・既存IPの素材は不使用） |

---

## 3. 機械照合の結果

候補ファイル（外部由来の生データ）が実際に持っているfieldを列挙し、
そこに翻訳・例文系のfieldが無いこと、および
**学習者に見える全テキストが外部の値と1件も一致しないこと**を照合した。

```
候補ファイルが持つfield: surface, reading, sourceSuggestedLevel,
                        sourceId, sourceFamily, sourcePosition, retrievedAt
候補側にある「訳・例文」系field: なし
外部由来の訳・例文の値の数: 0
学習者に見えるテキストのうち外部値と完全一致: 0
```

照合対象: 層C語彙 2,454語（`glossZh` / `exampleJa` / `exampleZh` / `explanationJa` / `explanationZh`）、
読解 220セット（`passageJa` / `explanationZh`）、聴解 200セット（`transcriptJa` / `explanationZh`）。

**そもそも訳・例文を取り込む経路が存在しない**（候補側にそのfieldが無い）ことが、
コピーしていないことの一次的な根拠である。

---

## 4. 表示しているのはどれか

| 学習者に表示 | 出所 |
|---|---|
| 見出し語（表記・読み） | 外部ソースは**候補提示のみ**。表記・読みは辞書照合のうえ自社で正準化 |
| レベル（N5〜N2） | 外部の推定を参考にしつつ、**自社の規則で再判定**（複数family根拠・頻度帯・常用漢字圏） |
| 中国語訳・例文・解説・問題 | **すべて自社** |
| 読解・聴解の本文と設問 | **すべて自社** |
| 音声 | 自社生成 |

見出し語そのもの（例:「勉強」という語が存在すること、その読みが「べんきょう」であること）は
事実であって著作物ではない。外部ソースはその**候補を出すため**にだけ使っている。

---

## 5. 残っている注意点

- `ninjal-bccwj` と `jev` は未取得のまま。独立系統は2つ（字幕頻度・JMdict）にとどまる
  → 「公式の出題基準を100%網羅した」とは主張していない（`PRODUCT_CANON` §8）
- 外部ソースの attribution は `vocab-independent-sources.json` に保持している。
  公開ページで語彙リストそのものを配布する場合はライセンス表記が必要になるが、
  **現在は配布しておらず、自社コンテンツのみを表示している**
