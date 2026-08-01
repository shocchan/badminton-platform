# 独立ソースの追加と飽和判定（EXAM COVERAGE CLOSURE §2・§3）

更新: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-completion`

## なぜ必要だったか

前回時点の語彙bank 8,056語は、レベル根拠が実質**1系統（一般に流通するJLPT語彙リスト群 = `tanos-waller`）**に依存していた。
「これ以上足しても増えない」ことを示すには、**系統の異なるソース**を当てて実測するしかない。

## 追加した独立ソース

| sourceFamily | sourceId | 系統 | license | 取得 |
|---|---|---|---|---|
| `opensubtitles-opus` | `opensubtitles-ja-50k` | 字幕コーパスの実測頻度 | attribution_share | ✅ sha256記録あり |
| `jmdict` | `jmdict-eng-common-inventory` | 新聞頻度・一万語彙分類集の優先度マーカー | attribution_share | ✅ 語の在庫として利用 |
| `ninjal-bccwj` | `ninjal-bccwj-suw` | 均衡コーパスの実測頻度 | permissive（研究・教育目的で無償） | ❌ **未取得** |
| `jev` | `jev-vocabulary-table` | 日本語教育語彙表（6段階難易度） | **reference_only** | ❌ **未取得** |

### 取得できなかったソース（正直に記録）

- **NINJAL『BCCWJ』短単位語彙表** — `repository.ninjal.ac.jp` が 502 を返し続けるため未取得。
  復旧したら独立familyとして追加する。取得URLはレポートに記録済み。
- **日本語教育語彙表（JEV）** — 配布が申請フォーム経由のため**自動取得しない**。
  §2の指示どおり `reference_only` 扱い。取得できた場合も
  **learnerに見えるDBへ入れない／再配布しない／訳・例文・語義・並び順を取り込まない**。
  照合材料として使い、統計のみを残す。テストで「reference_onlyソース由来の語がbankに無いこと」を固定。

### 取った情報／あえて取らなかった情報

- 取った: 表記・読み・頻度順位・出典・ライセンス
- 取らなかった: 翻訳・例文・文脈行・字幕本文・英訳グロス・**リストの並びそのもの**
- 独立ソースには `sourceSuggestedLevel: null` を与えている。
  **頻度リストはJLPTレベルの権威ではない**ため、レベルは独自判定に委ねる（テストで固定）。

## 試験スコープの宣言

飽和は「日本語全語彙の飽和」ではなく「**受験者が実際に出会う範囲の飽和**」として測る。

```
頻度上位 10,000 語以内
常用漢字圏（KANJIDIC2 学年 <= 8）
辞書照合できる内容語（助詞・助動詞・接辞・固有名詞は語彙bankの担当外）
```

この外側（頻度1万位以降・専門語・固有名詞・当て字・古語）は**最初からbankの対象にしていない**。

## 飽和の実測（独立ソース投入後）

### `opensubtitles-ja-50k`（頻度順位あり＝スコープを切り出せる）

| 頻度帯 | 収録 / 対象 | 収録率 |
|---|---|---|
| 1–2,000 | 1,244 / 1,247 | 99.76% |
| 2,001–4,000 | 1,257 / 1,261 | 99.68% |
| 4,001–6,000 | 1,099 / 1,105 | 99.46% |
| 6,001–10,000 | 1,969 / 1,980 | 99.44% |
| **スコープ内合計** | **5,569 / 5,593** | **99.57%（表記ゆれ込み 99.73%）** |
| 10,001位以降（スコープ外） | 2,285 / 8,437 | 27.08% |

未収録24語の内訳: 表記ゆれ 9（読みは収録済み）＋ 新語 15（喧嘩・狼・槍・絆・些細・骨董 など）。

- 新規CORE **0語（0%）** → しきい値「< 1%」を満たす
- 新規LIKELY **15語（0.22%）** → しきい値「< 2%」を満たす
- overlap **99.73%** → しきい値「>= 90%」を満たす

### `jmdict-eng-common-inventory`（頻度順位なし）

スコープ内 12,378 / 30,408 = 40.71%。未収録 18,057 の内訳:

- 表記ゆれ 1,679（ＣＤプレーヤー／ＣＤプレイヤー、あっという間に／アッと言う間に、いざこざ／イザコザ 等）
- 新語 16,378 — **うち頻度上位1万語に入るのは 15語だけ**

つまり残差はほぼ全量が「宣言した試験スコープの外」である。
このソースは頻度順位を持たないため試験スコープを切り出せず、**候補層へは取り込まず飽和プローブとしてのみ使用**した。
辞書がcommonとする語を全部入れると3万語規模になり、どれがN2圏でどれがN1超かを裏づけなしに決めることになるため（§5に反する）。

## 判定

```
saturatedWithinExamScope : true   ← 宣言した試験スコープ内では飽和している
saturatedAllRanks        : false  ← 全頻度帯では飽和していない（そもそも対象外）
provisional              : true   ← BCCWJ・JEV 未取得のため独立系統は2つにとどまる
```

**公式の出題基準をすべて満たしたとは主張しない。**

## 投入結果（bankの変化）

| | 投入前 | 投入後 |
|---|---|---|
| canonical語数 | 8,056 | **10,505** |
| N5 / N4 / N3 / N2 / N1 | 642 / 1,866 / 2,393 / 3,068 / 87 | 642 / 2,037 / 4,199 / 3,540 / 87 |
| core / likely / extended / hold | 2,520 / 4,442 / 10 / 1,084 | 2,652 / 6,759 / 10 / 1,084 |
| **複数family根拠を持つ語** | **118** | **3,176** |
| levelConfidence = low | 5,177 | 5,730 |

複数familyの根拠を持つ語が 118 → 3,176 に増えた。これが独立ソース投入の最大の効果で、
レベル判定が「1系統の主張の写し」ではなくなったことを意味する。

### レベル判定の規則をこの回で1つ厳しくした

レベル主張を持つsourceが1つも無い語（＝頻度コーパスだけで拾った語）は、
「標準的なN5/N4語彙リストに載っていないことが判明している語」である。
それをN5/N4へ落とすと根拠と矛盾するため、**下限をN3**にした（自社教材に出現する語は除く）。
同じ理由で、**頻度コーパスだけで拾った語は `core` にしない**（自社教材で多出する語は別）。

## 再現コマンド

```bash
node scripts/ai-course/harvest-vocab-candidates.mjs
node scripts/ai-course/harvest-independent-sources.mjs
./node_modules/.bin/vite-node scripts/ai-course/build-canonical-vocab.ts
./node_modules/.bin/vite-node scripts/ai-course/vocab-coverage-report.ts
npx vitest run src/lib/aiLesson/course/adventure/advVocabPolicy.test.ts
```

生成物: `generated/vocab-independent-sources.json` / `vocab-saturation-report.json` /
`vocab-candidates-independent.json`

`vocab-candidates-independent.json` は**bankとの差分ではなくソースのスナップショット**である
（差分にすると bank 再生成のたびに候補が消えて元に戻せなくなるため）。
