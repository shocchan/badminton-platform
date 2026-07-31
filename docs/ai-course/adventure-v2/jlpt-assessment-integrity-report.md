# 【JLPT ASSESSMENT INTEGRITY FINAL】

作成: 2026-07-31 ／ branch `feature/ai-course-adaptive-adventure-v2`

| 項目 | 結果 |
|---|---|
| Language Integrity | **PASS** |
| Unauthorized Scripts | **0件**（learner-visible 29,112文字列を全走査） |
| Cyrillic Contamination | **0件**（修正前 4件） |
| N2 Exam Skill Model | **CONNECTED**（言語知識105分＋聴解50分） |
| N3 Exam Skill Model | **CONNECTED**（文字語彙30分＋文法読解70分＋聴解40分） |
| Today Skill Visibility | **CLEAR**（Home・バトル・文法学習の全画面に「今鍛えている試験力」） |
| Readiness by Skill | **COMPLETE**（5技能×evidence 6指標） |
| Unsupported Skills | **未判定表示**（読解・聴解・時間配分は理由つきで「未判定」） |
| Correct Answer Storage | **CHOICE_ID**（index採点を全廃） |
| Deterministic Shuffle | **PASS**（seed付きFisher-Yates） |
| Position 1 Rate | **24.99%** |
| Position 2 Rate | **25.02%** |
| Position 3 Rate | **24.97%** |
| Position 4 Rate | **25.01%** |
| Max Same-position Streak | **2** |
| 10,000 Battle Validation | **PASS**（37,890問・χ²=0.02・失敗battle 0） |
| Rerender Stability | **PASS** |
| Reload Stability | **PASS** |
| Assessment Validity | **PASS** |
| P0 | 0 |
| P1 | 0 |
| **Staging Ready** | **YES** |
| **Production Deploy** | **NOT_EXECUTED** |

## 詳細

### foreign-language root cause

執筆時に別言語の単語がそのまま残ったもの。**fallbackではなくソースの誤り**。
最も重大なのは CEO がスクリーンショットで見つけた `n2g-003`（「〜以上は」）の
中国語解説 `「〜以上は＋должен」的结构` — `должен` はロシア語。

全ソースを走査して6件を特定し全件修正（内訳は ux-clarity-hotfix-report.md）。

### affected item IDs

`n2g-003` / `n2g-108` / `n3g-kawarini` / `ono-hyoro` / `ono-pekopeko` / `shuttleCounterI18n.ts`（コメント）

### language validator

- 実装: `src/lib/aiLesson/course/adventure/advLanguageIntegrity.ts`（純関数）＋
  `advLanguageCollect.ts`（learner-visible field の一元宣言）
- 実行: `npm run validate:ai-course-language-integrity`（**build / build:staging の前段に接続済み**）
- 検出: Unicode property escape で15 script（Cyrillic / Hangul / Arabic / Hebrew / Devanagari /
  Thai / Greek / Armenian / Georgian / Mongolian / Bengali / Tamil / Myanmar / Khmer / Ethiopic）
  ＋U+FFFD＋mojibake＋undefined混入＋必須テキスト欠損
- 出力: severity / itemId / field / route / locale / kind / script / 該当文字列 / **code point** /
  origin / sourceFile / 推奨処理（HOLD・SAFE_FALLBACK・REGENERATE・FIX_SOURCE）
- 対象外: コード・JSON key・itemId・URL・メール（指示どおり）
- 実測: checked 29,112 ／ **blocking 0** ／ warning 974（下記）

**warning の扱い（正直な申告）**: 中国語解説の地の文に日本語（「た形」「音がする」等）が
引用符なしで書かれた箇所が 974件ある。これは別言語の混入ではなく既存教材の表記様式で、
機械FAIL化すると N2/N3教材の全面書き換えが必要になり **§13で禁止**されている。
そのため件数・field別内訳・サンプルを `generated/language-integrity.json` に必ず出力したうえで
warning とし、人間の翻訳作業へ回す（silent許容はしていない）。

### JLPT skill schema

```
ExamSection = languageKnowledge | reading | listening
ExamSkill   = charactersVocabulary | grammar | reading | listening | timeManagement
別軸(JLPT非加算) = conversation | practicalUsage | correction | retention
```

問題は全件に `targetLevel / examSection / skill / sourceItemId / questionType(type) /
difficulty / timed / variantId / reviewState` を保持。

### N2能力表示 / N3能力表示

- N2: 「言語知識（文字・語彙・文法）・読解（105分）」「聴解（50分）」を準備度画面に明示
- N3: 「言語知識（文字・語彙）（30分）」「言語知識（文法）・読解（70分）」「聴解（40分）」
- バトル名称は scope で機械決定 — 文法のみ=「N2文法バトル」／語彙＋文法=「N2知識バトル」／
  4技能が揃って初めて「N2総合模試」。**文法だけを模試と呼ばない**

### Home表示

第一カードは「目標試験＋残日数／今鍛えている試験科目／今日の学習／所要時間／次のCTA」のみ。
詳細な能力は「ほかの学習を見る → 成長・準備度を見る」へ格納。

### readiness表示（staging実測）

```
N2準備度
 文字・語彙（言語知識）（暫定） 出題6・未出6・7日後0・時間つき0    17%
 文法（言語知識）（暫定）      出題1・未出1・7日後0・時間つき0   100%
 読解                         未判定（読解問題のデータがまだありません）
 聴解                         未判定（音声での聴解はまだ測定していません）
 時間配分                     未判定（制限時間つきのボスで測ります）
 総合：未判定
   ・文字・語彙のデータが不足しています（6/20問）
   ・文法のデータが不足しています（1/20問）
   ・読解のデータが不足しています（0/20問）
 会話・実践力（JLPTとは別）: 会話 未判定／実践で使う力 未判定
   「AI会話の記録です。JLPTの点数には足しません。」
```
**文法100%でも総合は未判定** — §9の中核要件を実画面で確認。

### correctChoiceId migration

```ts
// before
choices: string[]; answerIndex: number;      // 位置で採点
// after
choices: { choiceId, textJa, textZh?, isCorrect, whyWrongJa?, whyWrongZh? }[];
```
- 採点は `isCorrectAnswer(presented, pickedChoiceId)` のみ。表示位置は判定に使わない
- 保存: `presentedChoiceOrder` / `correctChoiceId` / `attemptSeed`
- 単元問題608問・文法variant全件を新スキーマへ変換（既存canonicalデータは非破壊）

### shuffle algorithm

1. `attemptSeed`（attempt開始時にmount1回・`Date.now()`）から `hashSeed(attemptSeed:questionKey)`
2. seed付き **Fisher-Yates**（xorshift・render中に `Math.random()` を呼ばない）
3. battle全体で `balancedPositions()` — 位置プールを均等生成し、
   **余りの開始位置を seed で回転**（7問4択で位置4が常に薄くなる欠陥を検証中に発見・修正）
4. 3連続回避、選択肢数が異なる問題（3択）にも収まるよう調整
5. 目標位置へは**入れ替え**で到達（決定的）

### distribution results（実データ・10,000 battle）

```
battles=10000  questions=37890
position counts: 9469 / 9481 / 9463 / 9477
position pct   : 24.99% / 25.02% / 24.97% / 25.01%
maxStreak=2  chiSquare=0.02  failedBattles=0  → PASS
```
コマンド: `npm run validate:ai-course-answer-distribution`
（出力: `generated/answer-distribution.json`）

さらにユニットテストで「**素材側の正解が全問index0でも提示は偏らない**」ことを2,000battleで確認。

### invalid distractor IDs

`generated/distractor-validity-audit.json`（N2 28件 / N3 17件・全IDと理由・文末カテゴリ・長さ比）

### tests / build / staging

- **1390テスト PASS**（tsc 0・AIコース側lint 0）
- build PASS（言語整合性validatorがbuild前に自動実行）
- staging deploy `ea4318a4` — 実画面で ja/zh・375px・console error 0 を確認
- fixture撤去済み（auth_users=5 / learners=1 で前後一致）

### CEO確認URL

- ja: `https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1`
- zh: `https://staging.badminton-platform.pages.dev/zh/ai-course?v2=1`
- ⚠️ 旧画面が出たら末尾に `&cb=1` を追加（Cloudflare edgeキャッシュ）
