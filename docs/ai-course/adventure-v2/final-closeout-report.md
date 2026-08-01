# 【FINAL CLOSEOUT】N2／N3 Adaptive Adventure — 残りをゼロにする

作成: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-final-completion`
staging: https://staging.badminton-platform.pages.dev
**production frontend へは反映していない。**

---

## 判定

```
CORE Total                    : 2,454語（層C対象）
CORE Active Beta              : 2,167語
CORE Excluded                 : 287語（理由つき）
CORE Pending                  : 0 / 2,454
CORE Question Coverage        : 100%（2,167 / 2,167・2問未満 0語）
Active Vocabulary Questions   : 10,112問（層C）／ 試験科目「文字・語彙」計 N3 10,804・N2 11,165問
JLPT Active Free-text         : 0

Teacher Voice Routing         : COMPLETE
Shoko Voice Smoke             : PASS（marin・音声355,462バイト・日本語transcript）
Yuto Voice Smoke              : PASS（cedar・音声274,882バイト・日本語transcript）
Teacher Change Session        : PASS（別sessionが作られ実効voiceが変わる）
Voice Warning                 : REMOVED
AI Conversation E2E           : PASS（実API12ステップ全通過）

Reading                       : N3 100 / N2 120
Listening                     : N3 100 / N2 100
Audio                         : 200件（音声なし 0）
Mini Mock                     : COMPLETE
Readiness                     : ACCURATE

P0                            : 0
P1                            : 0
Tests                         : PASS（1,541 / 0 fail / 3 skipped）
Build                         : PASS
Staging                       : PASS
Pilot Complete                : YES
Production Frontend Deploy    : NOT_EXECUTED
```

---

## 1. CORE語彙をゼロにした

`select-core-batch.ts` の実測 pending が **0**（`core pending=0 covered=2594`）。

| batch | 語数 | active_beta | excluded | pending |
|---|---|---|---|---|
| 01 | 251 | 249 | 2 | 0 |
| 02 | 250 | 233 | 17 | 0 |
| 03 | 250 | 204 | 46 | 0 |
| 04 | 250 | 217 | 33 | 0 |
| 05 | 250 | 223 | 27 | 0 |
| 06 | 250 | 229 | 21 | 0 |
| 07 | 250 | 197 | 53 | 0 |
| 08 | 250 | 223 | 27 | 0 |
| 09 | 250 | 223 | 27 | 0 |
| 10 | 203 | 169 | 34 | 0 |
| **計** | **2,454** | **2,167** | **287** | **0** |

**`needs_human_review` は0件。** 保留のまま放置された語を無くし、
最終状態を `active_beta` か `excluded_from_core` の2つだけにした。

### CORE から外した287語の理由

| exclusionReason | 件数 | 中身 |
|---|---|---|
| `inflected_form` | 53 | 動詞連用形が見出しとして採取されただけ（切り・使い・持ち・読み・働き…） |
| `sense_indeterminate` | 51 | 語義を1つに定められず、出題すると複数正解になる |
| `question_unbuildable` | 45 | 同音異表記が密集し、品質を満たす問題を2問作れない（点く／付く、計る／図る／量る…） |
| `compound_fragment` | 41 | 複合語の一部だけで単独の語にならない（州・住・小・上…） |
| `function_word` | 39 | 助詞・助動詞・接続詞など。文法bank担当（まま・たり・はず・つもり…） |
| `reading_unverifiable` | 34 | 表記と読みの対応が辞書索引で確認できない |
| `suru_stem_artifact` | 13 | サ変語幹に「する」が付いたまま採取された見出し（`相談\|そうだんする`…） |
| `duplicate_headword` | 11 | 別の見出しと同一の語 |

**外した語にも理由を型（`exclusionReason`）と文章（`reviewNotes`）の両方で残している。**
無理に教材化せず、誤った教材を出すより外すという方針を最後まで通した。

### 品質ゲート（全部テストで固定）

- active_beta の語は**必須10項目**が揃っている（reading / partOfSpeech / meaningZh /
  exampleJa / exampleZh / **explanationJa** / **explanationZh** / sourceSenseId /
  targetLevel / reviewState）→ `toSenseRecord()` が null を返す語 **0**
- active_beta の全語に有効な選択問題が**2問以上** → 2問未満 **0語**
- **4形式以上ある語 89.5%**（かな語は読み・表記の観点が構造上作れないため100%にはならない）
- validator の blocking **30件はすべて excluded 側**。active_beta の blocking **0**
  （`wordId` で突き合わせて機械確認）
- 自由入力の問題形式 **0**（`freeText` / `typedReading` 等は型で禁止済み）
- 正解位置分布 24.99 / 25.02 / 24.97 / 25.01 %（χ²=0.02・10,000battle・37,890問）

---

## 2. 先生別音声を実APIで確認した

`ai-lesson-token` を共有Supabaseプロジェクトへデプロイし、
**Edge Function → ephemeral secret → OpenAI Realtime（WebSocket）** まで実際につないで確認した。
`session.created` の `audio.output.voice` を一次情報として採っている。

| ケース | 実効voice | 音声バイト | 日本語transcript | 結果 |
|---|---|---|---|---|
| teacherId 未送信（旧クライアント相当） | marin | 304,462 | あり | PASS |
| shoko | marin | 355,462 | あり | PASS |
| yuto | **cedar** | 274,882 | あり | PASS |
| `'alloy'`（実在のvoice名） | marin | — | — | PASS（注入拒否） |
| `'yuto2'` / `'YUTO'` / 数値 | marin | — | — | PASS（既定へfallback） |

**cedar は現行モデル `gpt-realtime-2.1` で利用でき、marin と別音声**であることを実測した。
代替voiceを探す必要はなかった。

実走PASSを受けて `voiceSwitchAvailable` を true にし、
**「AI会話の声は、いまはまだ切り替わりません」の ja/zh 注意書きを削除**した。
配信バンドルで文言が消えていることも確認済み。消し忘れ・出し忘れの両方をテストで固定した。

### 後方互換（production frontend も同じ関数を使うため）

| 条件 | 実装・実測 |
|---|---|
| `teacherId` は optional | 未指定・不正値・型違いはすべて `shoko` へ倒れる |
| 旧クライアントは従来どおり marin | **実APIで確認済み**（上表1行目） |
| 旧クライアントの instructions が変わらない | 話し方の方針は `teacherId` を明示送信したリクエストにだけ足す。先生名の既定値は従来と同じ「翔子先生」 |
| DB変更なし | SQL・migration は未実行 |
| API response 破壊なし | 既存キーはそのまま。`teacherId` を追加しただけ |
| secret 変更なし | 読み取りのみ |
| 切り戻し可能 | deploy 前に `main` 版の実体と sha256 と手順を `docs/.../rollback/` に保存 |

---

## 3. AI会話 E2E を実APIで1周した

12ステップすべて PASS。証跡: `generated/conversation-e2e.json`

```
PASS  ai_start_session（実RPC・利用上限を通過して予約）
PASS  ai-lesson-token（実Edge Function・teacherId受け渡し／cedar適用）
PASS  Realtime 会話（実音声・3ターン）
PASS  目標表現が会話へ渡っている（サーバー側instructions）
PASS  発話ログの保存（実DB・RLS通過）
PASS  ai-lesson-report（実Edge Function・実LLM）
PASS  言い直しの素材が生成されている（corrections / naturalPhrases）
PASS  学習レポートの本文が日本語・中国語の両方で出ている
PASS  セッション完了の記録（実DB）
PASS  復習登録（実DB・翌日にスケジュール）
PASS  reload後もサーバー値が残る
PASS  発話ログがサーバーに残っている
```

学習者の発話には、中国語話者にありがちな助詞の誤り（「京都を行きたい」）を意図的に入れ、
**言い直しの素材が実際に生成されること**まで確認した。

### 一時QA learner の扱い

CEO の test learner が無かったため、今回の許可に従って一時QA learner を作成した。

- メール: `qa-temporary-<timestamp>@kawabado-stage-verify.invalid`（**実在しないTLD**）
- `user_metadata.temporary_qa = true` ／ learner 側も `is_test: true`
- 決済処理なし・他learnerへの影響なし
- **作業後に削除済み。前後の件数が一致することを確認**

```
before: auth_users=5 learners=1
after : auth_users=5 learners=1
orphan_sessions=0  orphan_utterances=0  orphan_progress=0
qa_leftover_users=0  voice_smoke_sessions=0  e2e_mission_rows=0
```

---

## 4. 既存の完成部分は維持している

| 項目 | 実測 |
|---|---|
| N3読解 / N2読解 | 100 / 120（10形式すべて saturated） |
| N3聴解 / N2聴解 | 100 / 100（全件再生可能） |
| 音声 | 200件・**Missing Audio Leakage 0** |
| Mini Mock | COMPLETE（「本番同等」表記なしをテストで固定） |
| Readiness Gating | ACCURATE（7条件・欠落条件ごとに個別テスト） |
| JLPT Active Free-text | 0 |
| 正解位置分布 | 約25%ずつ |
| Teacher Selection | COMPLETE（全画面・ja/zh） |

**読解・聴解の問題は1件も追加していない。**

---

## 5. 検証結果

```
vitest              1,541 pass / 0 fail / 3 skipped
tsc                 エラー 0
eslint              src/components/ai-course・src/lib/aiLesson・src/pages/ai-lesson・scripts で 0
build:staging       成功
language integrity  blocking 0
answer distribution 24.99 / 25.02 / 24.97 / 25.01%・χ²=0.02・maxStreak 2
vocab content       blocking 30（**全件 excluded 側。active は 0**）
audio manifest      200 / 200・失敗 0
teacher voice smoke verdict=PASS（実API・実音声）
conversation E2E    verdict=PASS（実API・12ステップ）
```

### バンドルの改善

教材が2,000語規模になり、`AdvShell` チャンクが gzip 568 kB まで膨らんでいた。
教材データを画面コードから別チャンクへ切り出した。

| チャンク | 前 | 後 |
|---|---|---|
| `AdvShell`（画面コード） | 568 kB gzip | **43 kB gzip** |
| `ai-course-vocab-content` | （同居） | 335 kB gzip |
| `ai-course-reading` | （同居） | 112 kB gzip |
| `ai-course-listening` | （同居） | 76 kB gzip |

UIを1行直すたびに学習者が教材ぜんぶを再取得する状態を解消した。
**初回の合計転送量は変わらない**（すべて静的import のため）。
初回を軽くするには出題プールを動的importへ変える必要があり、これは P2 として残す。

あわせて `vocabPool()` に (level, seed) キャッシュを入れた。
1回の生成で1万問前後を組み立てるため、バトル・模試・カバレッジ表示で毎回作り直していた。

---

## 6. 残課題

### P2

| # | 内容 |
|---|---|
| P2-1 | 初回転送量。出題プールを動的importにすれば冒険の初回表示を軽くできる（AdvShell・AdvMockRunner・クエスト生成に波及するため、実機UI検証ができない範囲では着手しない判断） |
| P2-2 | `scripts/ai-course/validate-legal.mts` が ESLint の `.mts` パーサ設定に無く、`--ext .mts` を明示すると parse error になる（このセッション以前からの既存事象・プロジェクトの検証コマンドは `.mts` を対象にしていない） |

### P3

| # | 内容 |
|---|---|
| P3-1 | 悠斗先生の `cheer`（笑顔）画像が無く base で代用している |

---

## 7. CEO に見てほしい URL

- https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1
- https://staging.badminton-platform.pages.dev/zh/ai-course?v2=1

**production frontend・main merge・remote migration はいずれも行っていない。**
Edge Function `ai-lesson-token` のみ、今回の明示的な許可に基づきデプロイした
（後方互換を実APIで確認済み・切り戻し手順は `docs/ai-course/adventure-v2/rollback/`）。
