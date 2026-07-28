# Excel Source Inventory（Phase 3A §2）

生成: 2026-07-28 ／ workbook: `scratchpad/source-data/foundation-learning-source.xlsx`
sha256(16): `8b365e6186b9189d` ／ read-onlyで監査（原本は改変していない）

## 集計

| 指標 | 値 |
|---|---|
| シート数 | 40 |
| sourceRefsが既に参照 | 12シート（refs 182件） |
| 未参照 | 28シート |
| 非空行 | 4417 |
| 語彙候補行（概算・見出し等除外前） | 1242 |
| 既存140語と重なる候補行 | 113（3Bで reuse/new sense/conflict へ精査） |
| 重複シート | 3（原：オノマトペ100集・原：N2の文法180例文集（王さん）・原：動詞使用頻度順） |
| 権利レビュー要 | 3シート |
| 画像 | 9 |

分類内訳: {"metadata_only": 7, "example_source": 5, "vocabulary_source": 11, "duplicate": 3, "grammar_source": 6, "exercise_source": 2, "frequency_reference": 4, "unknown": 1, "transitive_intransitive_source": 1}

## 権利の前提（重要）

本workbookは**しょっちゃん自作教材の想定**（rightsStatus: teacher_created想定）だが、
次の3シートは外部由来の可能性があり、**取込前に人間の権利確認が必要**:

- 原：慣用句110集（外部URLの引用あり）
- 日本の29歳以下のビジネスメッセージ67選（URL列・出典不明）
- 営業・ビジネス用語集200集（外部教材由来の可能性）

権利確認までこの3シートは `rights_unknown` 扱い＝**runtime教材へ取り込まない**。

## ID方針（§2確定）

行番号・並び順から永続IDを作らない（既存の `fi-` スラッグ方式を継続）。
新規取込のIDは lemma＋reading＋partOfSpeech＋normalizedSense のcontent hashから決定し、
provenance（workbook/sheet/cellRange/rawTextHash/extractedAt/sourceMatchType/confidence/
reviewStatus/rightsStatus）を全行必須とする（3Bで実装）。

## シート別詳細

| シート | 分類（提案） | 確信 | 非空行 | 語彙候補 | 既存重なり | 取込済 | 画像 | 権利 |
|---|---|---|---|---|---|---|---|---|
| 基礎日本語計画 | metadata_only | high | 22 |  |  |  |  | 自作想定 |
| 注文・買い物表現 | example_source | high | 34 |  |  |  |  | 自作想定 |
| 道案内・店名一覧 | vocabulary_source | medium | 34 | 1 |  |  | 7 | 自作想定 |
| 性格（動画1） | vocabulary_source | high | 25 | 21 | 1 | ✅ |  | 自作想定 |
| 3単語例文 | example_source | high | 31 |  |  | ✅ |  | 自作想定 |
| 50音（平仮名・片仮名） | metadata_only | high | 45 |  |  |  |  | 自作想定 |
| 最初に覚える最低限表現 | vocabulary_source | high | 418 | 400 | 76 | ✅ |  | 自作想定 |
| 原：オノマトペ100集 | duplicate | high | 101 |  |  |  |  | 自作想定 |
| 複合動詞一覧 | vocabulary_source | high | 30 | 27 | 4 |  |  | 自作想定 |
| 原：N2の文法180例文集 | grammar_source | high | 182 |  |  |  |  | 自作想定 |
| N3の文法120例文集 | grammar_source | high | 121 |  |  | ✅ |  | 自作想定 |
| 原：N2の文法180例文集（王さん） | duplicate | high | 182 |  |  |  | 1 | 自作想定 |
| 現状把握・目標設計 | metadata_only | high | 0 |  |  |  |  | 自作想定 |
| 営業・ビジネス用語集200集 | vocabulary_source | medium | 200 | 128 |  |  |  | ⚠️要確認 |
| 原：ビジネス敬語 | example_source | high | 27 |  |  | ✅ |  | 自作想定 |
| 原：PREP特訓 | exercise_source | high | 244 |  |  |  |  | 自作想定 |
| 原：慣用句110集  | vocabulary_source | medium | 111 | 91 |  |  |  | ⚠️要確認 |
| 原：接続詞使用頻度順（話し言葉） | frequency_reference | high | 101 | 49 | 2 | ✅ |  | 自作想定 |
| 原：接続詞使用頻度順（書き言葉） | frequency_reference | high | 101 | 50 | 2 |  |  | 自作想定 |
| 原：副詞使用頻度順 | frequency_reference | high | 103 | 76 | 3 | ✅ |  | 自作想定 |
| 原：動詞使用頻度順 | duplicate | medium | 101 |  |  | ✅ |  | 自作想定 |
| しりとり・連想ゲーム | exercise_source | medium | 1001 |  |  |  |  | 自作想定 |
| 雑談（リアクション会話のコツ） | metadata_only | high | 12 |  |  |  |  | 自作想定 |
| 動詞使用頻度順 | frequency_reference | high | 101 | 22 | 8 | ✅ |  | 自作想定 |
| ファシリテーション | metadata_only | medium | 64 |  |  |  |  | 自作想定 |
| 日本の29歳以下のビジネスメッセージ67選 | unknown | low | 68 |  |  |  |  | ⚠️要確認 |
| 原：接続詞（種類順） | vocabulary_source | medium | 98 | 75 | 7 |  |  | 自作想定 |
| オノマトペ100集（完成版） | vocabulary_source | high | 102 | 101 |  |  | 1 | 自作想定 |
| 会話力UPネタ17集 | metadata_only | medium | 19 |  |  |  |  | 自作想定 |
| 自動詞・他動詞46選 | transitive_intransitive_source | high | 54 | 47 | 9 | ✅ |  | 自作想定 |
| 頻出表現 | example_source | high | 102 |  |  |  |  | 自作想定 |
| 疑問詞（ぎもんし） | vocabulary_source | high | 52 | 3 |  |  |  | 自作想定 |
| 指示語 | vocabulary_source | high | 14 | 7 | 1 |  |  | 自作想定 |
| 数字表現 | vocabulary_source | high | 184 | 144 |  |  |  | 自作想定 |
| 基礎会話練習GW のコピー | example_source | high | 51 |  |  | ✅ |  | 自作想定 |
| 基礎計画表（全24回） | metadata_only | high | 25 |  |  |  |  | 自作想定 |
| 助詞① | grammar_source | high | 14 |  |  |  |  | 自作想定 |
| 助詞② | grammar_source | high | 11 |  |  |  |  | 自作想定 |
| 「です・ます」文（敬语句型） のコピー | grammar_source | medium | 44 |  |  |  |  | 自作想定 |
| 動詞活用形 | grammar_source | high | 188 |  |  | ✅ |  | 自作想定 |

分類は**AI提案**であり、confidence=low/medium と権利要確認シートは人間確認が必要。
