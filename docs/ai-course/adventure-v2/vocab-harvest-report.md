# 語彙ハーベスト報告（PUBLIC JLPT VOCABULARY HARVESTING POLICY）

作成: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-completion`

> **本バンクの位置づけ**
> 複数の主要公開語彙データを統合し、重複・意味・レベルを独自に再整理した
> **N2／N3累積語彙バンク**である。
> 公式出題基準の100%網羅を主張するものではない。

## 4つの完了判定（§12）

| 判定 | 結果 | 根拠 |
|---|---|---|
| **Vocabulary Harvest Complete** | **YES** | 4 sourceFamily・8,131候補行を収集し union 済み |
| **Canonical Bank Complete** | **NO** | hold以外は field が揃うが、語義1,220語がJMdict未照合。sense分離も第1語義中心 |
| **CORE Question Coverage Complete** | **NO** | 層C（独自問題）未着手。CORE 2,520語に問題0 |
| **Exam Vocabulary Coverage Complete** | **NO** | 上記に依存 |

§9 の順番（候補union → 正規化 → sense分離 → 独自レベル → **coverage audit** → CORE問題生成 …）のうち、
**5番目の coverage audit まで完了**。6番目以降は未着手です。
「候補語を集めただけで Exam Vocabulary Coverage Complete にしない」という指示に従いました。

## 収集ソースと取扱い（§2・§3）

| sourceFamily | sourceId | license | 取得したfield | **あえて取らなかったfield** |
|---|---|---|---|---|
| `tanos-waller` | openanki-jlpt-n5〜n1（5件） | permissive（MIT編集物） | 表記・読み・レベルタグ | **訳（meaning）**・カード順・デッキ構成・guid |
| `jmdict` | jmdict-eng-common | attribution_share（CC BY-SA・© EDRDG） | 表記・読み・品詞・語義数・頻度マーカー | **英訳グロス**・例文 |
| `kanjidic2` | kanjidic2-en | attribution_share（CC BY-SA・© EDRDG） | 漢字・学年・画数 | 英語意味・読みリスト |
| `kawabado-internal` | kawabado-vocab-140 ほか教材 | 自社 | 表記・読み・出現回数 | — |

- 一般に流通するJLPT語彙リストは多数の派生repositoryが存在するため、**代表1件のみを取得し
  `sourceFamily='tanos-waller'` として1根拠に束ねています**（§2）。派生を複数数えていません。
- **元リストの順番は canonical へ引き継いでいません**。`sourcePosition` に記録するのみで、
  canonical は「読み → 表記」で安定ソートしています（テストで固定）。
- 訳・例文・解説・問題は一切取得していません。層C は独自作成です。

## 収集・正準化の実測

```
候補行            8,131（tanos-waller family）
unique 表記|読み   8,034
canonical 語       8,056（自社教材のみの語を含む）
unique 表記        7,915
unique 読み        7,217
```

### 独自レベル判定の結果（§5）

| レベル | 語数 |
|---|---|
| N5 | 642 |
| N4 | 1,866 |
| N3 | 2,393 |
| N2 | 3,068 |
| N1 | 87 |

判定材料: 掲載source family／source主張レベル／JMdict頻度マーカー／漢字学年（KANJIDIC2）／
自社教材での出現回数。**sourceSuggestedLevel をそのまま採用していません**
（source ±1段の範囲で再判定。テストで「独自判定が実際に効いている」ことを検証）。

### 優先度（§5）

| priority | 語数 | 意味 |
|---|---|---|
| core | 2,520 | 自社教材に複数回出現、または頻出かつN5/N4 |
| likely | 4,442 | 辞書上頻出、またはN3以下 |
| extended | 10 | 上記以外の検証済み |
| **hold** | **1,084** | **読み欠損または辞書照合できず＝出題しない** |

## 累積カバレッジ（§4・§11）

### N3累積（N5＋N4＋N3）

```
候補レベル内訳   N5 642 / N4 1,866 / N3 2,393
unique 表現      4,810
unique 語義      9,082
core             2,441
likely           1,870
extended          （上記に含む）
hold               590
canonical field完備 4,196
問題カバレッジ    0（層C未着手）
```

### N2累積（N5＋N4＋N3＋N2）

```
候補レベル内訳   N5 642 / N4 1,866 / N3 2,393 / N2 3,068
unique 表現      7,836
unique 語義      13,909
core             2,520
likely           4,442
hold               999
canonical field完備 6,836
問題カバレッジ    0（層C未着手）
```

## WARNING（§10）

| 種別 | 件数 | 扱い |
|---|---|---|
| source family 1件のみ | 7,938 | JLPTレベルの根拠が実質1familyに依存。だからこそ独自再判定を必須にしている |
| level conflict | 96 | `levelConflict` に保持。`alsoRequiredFor` で上位レベルも記録 |
| low frequency | 1,220 | JMdict未照合。多くは hold |
| ambiguous sense | 1,703 | 語義3つ以上。sense単位の問題作成が必要 |
| low confidence | 5,177 | 単一family＋信号不一致。人間レビュー候補 |

## §7 自由入力の禁止

**active JLPT出題の自由入力は 0件**（テストで固定）。

- N3単元問題 748問: choice 678 / order 70（`orderedChoice` として許可形式）
- 読解 60セット・聴解 50セット: すべて4択
- `foundationTypes.ts` に `text_input` 等の型は残るが、**active な出題データでは未使用**
- 自由入力はAI会話・言い直し・実践練習のみに残置。JLPT readiness へは加算しない
  （readinessは `bySkill` を持つ attempt のみ集計するため、会話の自由入力は構造上入らない）

## 次のステップ（§9の6番目以降）

1. CORE 2,520語について、層C（独自の中国語訳・注記・例文）を作成
2. 語義単位で観点別問題を生成（CORE 4〜6観点・LIKELY 3〜5・EXTENDED 2〜3）
3. automated validation → 独立した意味レビュー → `active_beta`
4. LIKELY／EXTENDED へ拡張

**一括大量生成はしません**（§9）。問題品質を語数より優先します。

## 再現コマンド

```
node scripts/ai-course/harvest-vocab-candidates.mjs
./node_modules/.bin/vite-node scripts/ai-course/build-canonical-vocab.ts
./node_modules/.bin/vite-node scripts/ai-course/vocab-coverage-report.ts
npx vitest run src/lib/aiLesson/course/adventure/advVocabPolicy.test.ts
```

生成物: `generated/vocab-candidates.json` / `vocab-canonical.json` /
`vocab-coverage-report.json` / `vocab-jmdict-index.json` / `vocab-kanji-grade.json`
