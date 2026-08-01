# 問題バンク監査レポート

生成: 2026-08-02 ／ 生成コマンド: `./node_modules/.bin/vite-node scripts/ai-course/question-bank-audit.ts`
出力先: `docs/ai-course/adventure-v2/generated/question-bank/`

---

## 0. 最初に — これまでの報告値を足してはいけない

これまで別々に報告してきた次の数字は、**足すと二重計上になる**。

| これまでの報告値 | 件数 |
|---|---|
| CORE語彙問題 | 10,125 |
| N3 文字・語彙 | 10,230 |
| N2 文字・語彙 | 10,588 |
| （単純合計） | **30,017** ← 誤り |
| **実際の一意件数** | **11,465** |

理由: **N3スコープ（N5+N4+N3）は N2スコープ（N5+N4+N3+N2）の部分集合**である。
同じ問題が「N3の問題」としても「N2の問題」としても数えられている。

---

## 1. 数え方（定義）

- **questionId** = `AdvBattleQuestion.key`（例: `vocab:勉強:べんきょう:meaning`）
- 集計はすべて **questionId の集合演算**で行う。件数の足し算はしない
- 一意集合の作り方（この順で、既出IDは上書きしない）
  1. N2プールの全問
  2. N3プールの全問
  3. 単元（文字・語彙／文法）の全問
- 同じ questionId でも、N3プールと N2プールでは**誤答の抽選seedが違うため選択肢が異なる場合がある**（正解は同じ）。
  ID が同じなら同じ問題として1件と数える

---

## 2. 集計結果

| 項目 | 件数 |
|---|---|
| **一意な問題数** | **11,465** |
| CORE（層C・語彙） | 10,125 |
| N3に属する | 9,767 |
| N2に属する | 10,125 |
| N2とN3の両方に属する（重複） | 9,767 |
| N3のみ | **0** |
| N2のみ | 358 |
| 単元（文字・語彙） | 463 |
| 単元（文法） | 877 |
| どのルートからも出題されない（未使用） | **0** |
| active | 11,465 |
| hold | 0 |
| CORE除外語（`excluded_from_core`） | 287語 |
| 人間が確認済み | **0**（未着手） |

---

## 3. 重複・包含レポート

| 関係 | 結果 |
|---|---|
| N3 ⊂ N2 | **完全な包含**（N3のみ = 0 件） |
| N2 ∖ N3 | 358件（N2固有） |
| CORE ∩ 単元 | **0件**（10,125 + 463 + 877 = 11,465 でちょうど一致＝重なりなし） |
| 同一の問題文が別IDで存在 | 522件 |
| 同一の選択肢セットが別IDで存在 | 202件 |

`N3のみ = 0` が、「足してはいけない」ことの直接の根拠である。
N3ルートで出る問題は、すべてN2ルートでも出る。

### N2の実力として数えてよい問題

N2ルートには、N3以下の語から作った問題が**9,783件**含まれる。
これは設計どおり（N2攻略のための基礎補強）だが、**N2の準備度に加算してはいけない**。

| routeRole | 意味 | 件数 |
|---|---|---|
| `n2-core` | N2/N1の語。N2の実力として数える | 342 |
| `n2-foundation-support` | N3以下の語がN2ルートに出る。基礎補強 | 9,783 |
| `n3-core` | N3ルート専用 | 0 |

該当分は `n2-foundation-support-questions.csv` に切り出してある。

---

## 4. 自動警告（13種）

**警告は問題を自動削除しない。** 人間が見つけやすくするための印だけを付ける。
`defect` = 直す候補 ／ `info` = 事実の分類（直す対象ではない）。

| 種別 | 重み | 件数 |
|---|---|---|
| 選択肢の長さが偏る `length_skew` | defect | 1,316 |
| 正解だけが長い `correct_longest` | defect | 953 |
| 同一の問題文 `duplicate_question_text` | defect | 522 |
| 同一の選択肢セット `duplicate_choice_set` | defect | 202 |
| 重複した選択肢 `duplicate_choice` | defect | 0 |
| 複数正解の疑い `multiple_correct_candidate` | defect | 0 |
| 不自然な仮名列 `implausible_kana` | defect | 0 |
| 解説が無い `missing_explanation` | defect | 0 |
| 中国語が無い `missing_zh` | defect | 0 |
| レベル不整合 `level_mismatch` | defect | 0 |
| 出題対象外の語 `hold_leakage` | defect | 0 |
| sourceSenseId欠落 `missing_source_sense_id` | defect | 0 |
| 基礎問題のreadiness誤加算 `readiness_overcount` | info | 9,783 |
| **defectを1つ以上持つ問題** | | **2,409**（全体の21.0%） |

判定基準は `src/lib/aiLesson/course/adventure/questionAudit.ts` に集約してある（画面とCSVで同じ基準）。

- `correct_longest`: 正解だけが最長で、最短との差が3字以上
- `length_skew`: 最長 / 最短 > 3.2倍
- `implausible_kana`: 読み問題の誤答が、実在する読みの集合に無い仮名列

---

## 5. 監査コンソール（画面）

**https://qa-question-bank.badminton-platform.pages.dev/internal/qa/question-bank**

> `staging.badminton-platform.pages.dev` は別ブランチのgit連携ビルドに上書きされるため、
> この画面専用のalias（`qa-question-bank`）に出している。

実測（2026-08-02、実ブラウザ）:

| 確認 | 結果 |
|---|---|
| 上記URLでルートが解決する（リダイレクトされない） | ✅ `/internal/qa/question-bank` に留まる |
| 未ログインでは中身が出ない | ✅「管理者専用です」のみ |
| **kawabado.com（本番）で同じURLを開く** | ✅ `/ja/` に落ちる。コンソールも権限メッセージも出ない |
| 本番bundle内の該当文字列 | ✅ 0件 |

- **読み取り専用。** この画面から教材データは変更できない（保存・編集・削除の導線が無い）
- **本番ビルドには含まれない。** `import.meta.env.MODE === 'production'` のとき
  lazy import ごと dead code として消えるので、chunk すら生成されない
- staging/local でも **`ai_admins` に載っている人だけ**が中身を見られる。
  権限取得に失敗した場合も中身を出さない（fail closed）
- 管理者と確認できるまで教材（1万問超）を読み込まない

### できること

| 機能 | 内容 |
|---|---|
| キーワード検索 | questionId・語・読み・設問(ja/zh)・選択肢・解説を横断 |
| レベル | すべて / N3に出る / N2に出る / N2のみ |
| バンク | CORE（層C） / 単元（文字・語彙） / 単元（文法） |
| 問題形式 | `vocab-reading` `vocab-context` `vocab-usage` ほか、実データから自動列挙 |
| 状態 | active / hold |
| 難易度 | 1 / 2 / 3 |
| 正解位置 | 1 / 2 / 3 / 4（データ上の位置。出題時はシャッフルされる） |
| 警告 | defectを持つ問題だけに絞る |
| 人間未確認 | 現在は全件が未確認 |
| ランダム抽出 | 100問を無作為抽出 |
| 表示件数 | 50 / 100 / 200 件、前へ・次へ |
| 詳細展開 | 設問(ja/zh)・全選択肢と正解・解説(ja/zh)・sourceSenseId・出所ファイル・prerequisiteLevel・readinessContribution・reviewState・警告の内訳 |
| questionIdコピー | 各行の ⧉ ボタン |

---

## 6. CSV（Excelで開ける）

すべて **UTF-8 BOM付き・CRLF**。Excelでダブルクリックしても文字化けしない。
選択肢は `choice1` 〜 `choice4` の別カラムに展開し、`correctChoicePosition` を併記している。

### まとめ・レベル別

| ファイル | 行数 |
|---|---|
| `question-bank-summary.csv` | 15 |
| `core-vocabulary-questions.csv` | 10,125 |
| `n3-vocabulary-questions.csv` | 9,767 |
| `n2-vocabulary-questions.csv` | 10,125 |
| `warning-questions.csv` | 2,409 |
| `n2-foundation-support-questions.csv` | 9,783 |
| `review-needed-questions.csv` | 11,465 |

### 出題形式別（`by-type-*.csv`）

1万行のファイルはExcelで扱いづらいので、形式ごとにも分けてある。
形式は決め打ちせず実データから拾っているので、形式を足しても取りこぼさない。

| ファイル | 行数 | | ファイル | 行数 |
|---|---|---|---|---|
| `by-type-vocab-reading` | 1,852 | | `by-type-cloze` | 283 |
| `by-type-vocab-orthography` | 1,852 | | `by-type-meaning` | 244 |
| `by-type-vocab-context` | 1,828 | | `by-type-rec` | 209 |
| `by-type-vocab-meaning` | 1,733 | | `by-type-u-context` | 146 |
| `by-type-vocab-usage` | 1,492 | | `by-type-u-reading` | 126 |
| `by-type-vocab-confusable` | 1,368 | | `by-type-u-collocation` | 103 |
| | | | `by-type-u-conjugation` | 75 |
| | | | `by-type-u-core_meaning` | 68 |
| | | | `by-type-form` | 66 |
| | | | `by-type-u-transfer_error` | 13 |
| | | | `by-type-u-scope_contrast` | 7 |

17ファイルの合計は **11,465** で、一意件数とちょうど一致する（取りこぼし・重複なし）。

### 列

`questionId` `bank` `inN3` `inN2` `targetLevel` `prerequisiteLevel` `routeRole`
`readinessContribution` `skill` `questionType` `sourceSenseId` `targetWord` `reading`
`questionJa` `questionZh` `choice1` `choice2` `choice3` `choice4`
`correctChoiceId` `correctChoicePosition` `explanationJa` `explanationZh`
`difficulty` `reviewState` `sourceFile` `warnings` `infoFlags`
`humanReviewState` `reviewedAt` `reviewer` `reviewNote` `correctionRequested`

---

## 7. 人間レビュー欄について

`humanReviewState` `reviewedAt` `reviewer` `reviewNote` `correctionRequested` は
**列だけ用意し、値はすべて空**にしてある。

- 今回、問題を `approved` へ一括昇格していない
- 既存データを `humanReviewed` へ変更していない
- 人間が確認済みの問題: **0件**

CEOがCSVに記入して返す運用を想定しているが、**取り込み処理はまだ作っていない**。

---

## 8. まだできていないこと

- 警告2,409件の中身を人が見ていない（機械が印を付けただけ）
- `duplicate_question_text` 522件が「別の語なのに設問が同じ」なのか
  「同じ語の別観点で問題ない」のかを分けていない
- CSVに書いたレビュー結果を取り込む仕組みが無い
- 画面は50〜200件のページ送りで、仮想スクロールは入れていない
