# N2／N3 EXAM COVERAGE CLOSURE 報告

作成: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-completion`
staging: https://staging.badminton-platform.pages.dev （deploy `69aa4605`）
**production へは反映していない。**

---

## 1. このセッションで動いたもの

| # | 項目 | 状態 |
|---|---|---|
| §9 | ミニ模試 runtime | ✅ 完成 |
| §10 | 総合準備度のゲート（模試3回・遅延evidence） | ✅ 完成 |
| §2・§3 | 独立ソース追加と飽和判定 | ✅ 実測完了（暫定） |
| §5・§6 | 層C（独自コンテンツ）＋選択式語彙問題 | 🟡 batch01のみ（249/2,647語） |
| §7 | 試験5区分の接続 | ✅ 全区分が接続済み |
| §8 | 読解・聴解の到達目標 | ❌ 未達（不足を明記） |
| §11 | AI会話 E2E（実API） | ❌ 未実施（learnerセッションが必要） |

---

## 2. §9 ミニ模試 runtime（完成）

`advMockSession.ts` ＋ `AdvMockRunner.tsx`。指定された要素をすべて実装した。

| 要求 | 実装 |
|---|---|
| section intro | 問題数・制限時間・「時間切れ分は未回答として採点」を提示 |
| timer | 1秒刻み。残り60秒で赤表示。0で自動的にセクション終了へ |
| question navigation | 番号ボタンで往復。回答済み／未回答を色と `aria-label` で区別 |
| unanswered warning | 提出時に未回答番号を列挙し「戻って回答」「このまま終える」を選ばせる |
| section submit / transition | セクション結果 → 次セクション。正誤は最後まで見せない |
| audio section | 聴解セクションは再生回数制限つき。解答中は原稿を出さない |
| final submit / skill results | 技能別の正答数・所要時間・時間内完走・未回答数 |
| readiness update | timed:true ＋ `bySkill` つき attempt を台帳へ記録 → 準備度へ反映 |
| reload recovery | `profile.mockSession` に直列化。**同じ問題・同じ提示順・同じ残り時間**で再開 |

**「本番同等」とは表示しない。** モードを2つに分けて明示した。

- 短時間版: 「本番より短い時間・少ない問題数です。時間配分の練習用です。」
- 本番時間版: 「本番と同じ制限時間で行います。**問題数は本番より少ないミニ版です。**」

テストで固定: 出力文字列に「本番同等」「本番と同じ問題数」が含まれないこと（`advMockSession.test.ts`）。

---

## 3. §10 総合準備度のゲート（完成）

7条件すべてを満たさない限り `overallPct` は `null`（未判定）。

```
languageKnowledgeEvidence  文字・語彙と文法にそれぞれ20問以上
readingEvidence            読解に20問以上
listeningEvidence          聴解に20問以上
timedEvidence              制限時間つきの記録がある
unseenEvidence             各技能に未出問題10問以上
delayedEvidence            7日以降の測り直しが合計10問以上
mockCount                  時間つきミニ模試を3回以上
```

- 準備度画面に上の7条件をチェックリストで表示する（何が足りないかを隠さない）
- **文法攻略率を総合準備度へ流用しない。** テストで固定: 文法だけ満点・模試5回でも `overallPct` は `null`

---

## 4. §2・§3 独立ソースと飽和（詳細は `vocab-saturation.md`）

前回の語彙bankはレベル根拠が実質1系統（`tanos-waller`）だった。系統の異なるソースを当てた。

| sourceFamily | 系統 | 取得 |
|---|---|---|
| `opensubtitles-opus` | 字幕コーパスの実測頻度 | ✅ sha256記録 |
| `jmdict` | 新聞頻度・一万語彙分類集の優先度マーカー | ✅ 飽和プローブとして使用 |
| `ninjal-bccwj` | 均衡コーパス頻度 | ❌ repository が502 |
| `jev` | 日本語教育語彙表 | ❌ 申請フォーム制。**reference_only** |

### 試験スコープの宣言

飽和は「日本語全語彙」ではなく「受験者が出会う範囲」で測る。
**頻度上位1万語・常用漢字圏・辞書照合できる内容語**をスコープとし、その外は最初からbankの対象にしない。

### 実測

`opensubtitles-ja-50k` スコープ内: **5,569 / 5,593 = 99.57%（表記ゆれ込み 99.73%）**

| 頻度帯 | 収録率 |
|---|---|
| 1–2,000 | 99.76% |
| 2,001–4,000 | 99.68% |
| 4,001–6,000 | 99.46% |
| 6,001–10,000 | 99.44% |

- 新規CORE **0語（0%）** → しきい値「< 1%」を満たす
- 新規語 **15語（0.22%）** → しきい値「< 2%」を満たす
- `jmdict-common` の残差 16,378語のうち、**頻度上位1万語に入るのは15語だけ**

```
saturatedWithinExamScope : true
saturatedAllRanks        : false   （スコープ外は元から対象にしていない）
provisional              : true    （BCCWJ・JEV 未取得。独立系統は2つにとどまる）
```

**公式の出題基準をすべて満たしたとは主張しない。**

### bankの変化

| | 前 | 後 |
|---|---|---|
| canonical語数 | 8,056 | **10,499** |
| 複数family根拠を持つ語 | 118 | **3,182** |
| core / likely / hold | 2,520 / 4,442 / 1,084 | 2,647 / 6,759 / 1,083 |

レベル規則を2点厳しくした:
- レベル主張を持つsourceが無い語（頻度コーパスのみで拾った語）は下限をN3にする
- 同じ語は `core` にしない（自社教材に多出する語は例外）

読みの正規化も入れた（「べんきょう (する)」「いく; ゆく」→ 見出し読み）。放置すると読み問題の正解が壊れる。

---

## 5. §5・§6 層C（独自コンテンツ）— batch01 のみ

**一括生成はしていない。** 250語単位で 生成 → 機械検査 → 独立した意味レビュー → active_beta を回した。

### batch01 の実測

```
対象      N5内容語 251語（機能語56語は文法bank担当として別集計）
機械検査   blocking 2件 / warning 102件
意味レビュー 辞書との品詞照合・多義語の語義注記
昇格      active_beta 249語 / needs_human_review 2語（みんな・毎年）
生成問題   975問
```

観点別: 意味249・表記200・文脈204・用法139・読み133・易混50

**かな語は読み・表記の観点が構造上作れない**ため、4観点に届かない語が77語ある。隠さず計上した。

### 訳・例文の出所

訳・注記・例文は**すべて自社で書き起こした**。他ソースの訳文・例文は取っていない
（候補層は surface / reading / 出典 のみ。テストで固定）。

### 残り

**CORE 2,398語（約10バッチ）。** 品質を語数より優先する方針は維持する。

---

## 6. §7 試験5区分の接続（`exam-coverage-matrix.json`）

| 区分 | N3 | N2 |
|---|---|---|
| 文字・語彙 | 1,438問（層C 975 / 単元 463） | 1,438問 |
| 文法 | 877問 | 877問 |
| 読解 | 30セット / 30問 | 30セット / 30問 |
| 聴解 | 25セット（全て音声あり） | 25セット |
| 時間配分 | 「N3総合ミニ模試」3セクション実行可 | 「N2総合ミニ模試」3セクション実行可 |

```
allFiveSkillsConnected : true
```

5区分すべてが「学習できて、測定されて、準備度へ反映される」状態になった。

---

## 7. §8 読解・聴解の到達目標 — **未達**

| | 現在 | 目標 | 不足 |
|---|---|---|---|
| N3読解 | 30 | 100〜120 | **70セット** |
| N2読解 | 30 | 120〜150 | **90セット** |
| N3聴解 | 25 | 約100 | **75セット** |
| N2聴解 | 25 | 100〜125 | **75セット** |

合計 **約310セット**が未作成。聴解は1セットにつき音声生成も要る。
言い換えによる水増しはしないため、素材から書き起こす必要がある。**このセッションでは着手していない。**

---

## 8. §11 AI会話 E2E — 未実施

staging へはデプロイ済みだが、`/ja/ai-course` は learner セッションを要求するため、
ブラウザからの実操作 smoke（模試の通し・会話の実API往復）が**行えていない**。

必要なもの: staging の learner ログイン情報（または招待コード）。
これが揃えば、模試の section 遷移・reload 復帰・会話1往復を実機で確認できる。

---

## 9. 10個の完了判定（§12）

| 判定 | 結果 | 根拠 |
|---|---|---|
| Vocabulary Harvest Complete | **YES** | 独立2系統を含む union。試験スコープ内の飽和を実測 |
| Saturation Demonstrated | **PARTIAL** | スコープ内は満たすが独立系統が2つ。BCCWJ・JEV 未取得 |
| Canonical Bank Complete | **NO** | 1,213語がJMdict未照合。sense分離は第1語義中心 |
| CORE Content Complete | **NO** | 249 / 2,647語 |
| CORE Question Coverage Complete | **NO** | 同上。かな語は4観点に届かない構造的制約あり |
| Reading Bank Complete | **NO** | 60 / 220〜270セット |
| Listening Bank Complete | **NO** | 50 / 200〜225セット |
| Mini Mock Runtime Complete | **YES** | section遷移・タイマー・未回答警告・reload復帰・技能別結果 |
| Readiness Gate Complete | **YES** | 7条件の機械判定。1つでも欠ければ未判定 |
| Exam Vocabulary Coverage Complete | **NO** | 上記に依存 |

---

## 10. 検証結果

```
vitest         1,487 pass / 0 fail / 3 skipped
tsc            エラー 0
eslint         src/lib・src/components・scripts でエラー 0
build:staging  成功（language integrity validator を通過）
staging deploy 69aa4605 → https://staging.badminton-platform.pages.dev
```

staging の実バンドル `AdvShell-Bq28OQ-q.js` を取得して確認:

```
ミニ模試 / 短時間版 / 本番時間版 / このセクションを始める / 未回答
総合準備度を出す条件 / 模試を再開する / の意味はどれですか / を漢字で書くとどれですか  … すべて含まれる
層Cコンテンツ（冷蔵庫・图书馆）                                   … 含まれる
「本番同等」                                                    … 含まれない
```

---

## 11. 次に着手すべき順番

1. **staging の learner セッション取得** → 模試の通し smoke と会話 E2E（§11）
2. **読解・聴解の拡張**（約310セット）— 最も大きな残作業。聴解は音声生成もセット
3. **層C batch02 以降**（2,398語 / 約10バッチ）
4. NINJAL BCCWJ の再取得（repository復旧待ち）／ JEV の申請（人間が行う）

## 再現コマンド

```bash
node scripts/ai-course/harvest-vocab-candidates.mjs
node scripts/ai-course/harvest-independent-sources.mjs
./node_modules/.bin/vite-node scripts/ai-course/build-canonical-vocab.ts
./node_modules/.bin/vite-node scripts/ai-course/vocab-coverage-report.ts
./node_modules/.bin/vite-node scripts/ai-course/select-core-batch.ts 2
npm run validate:ai-course
npm run report:ai-course-coverage
npx vitest run
```
