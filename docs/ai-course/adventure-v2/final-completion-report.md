# 【N2／N3 ADAPTIVE ADVENTURE FINAL COMPLETION】

作成: 2026-08-01 ／ branch `feature/ai-course-adventure-v2-final-completion`
staging: https://staging.badminton-platform.pages.dev （deploy `6fba10e2`）
**production へは一切反映していない。**

---

## 判定

```
Teacher Selection             : COMPLETE
Teacher Voice Routing         : COMPLETE（実装）／ INCOMPLETE（実走未確認）
Shoko Effective Voice         : marin   （allowlist・実走未確認）
Yuto  Effective Voice         : cedar   （allowlist・実走未確認）
New Session on Teacher Change : PASS（単体テストで固定・実機未確認）
Voice Warning                 : VISIBLE（意図的に残置）
Staging Audio Smoke           : BLOCKED（実行不能。理由は §2）
AI Conversation E2E           : INCOMPLETE（同上）

Canonical Vocabulary          : 10,499語
CORE Total                    : 2,647語
CORE Content Complete         : 482 / 2,647
CORE Question Coverage        : 482 / 2,647 Sense
N3 Active Vocabulary Questions: 1,928問（層C）＋ 463問（単元）＝ 2,391問
N2 Active Vocabulary Questions: 同上 2,391問
JLPT Active Free-text         : 0件

N3 Reading                    : 100 / 100
N2 Reading                    : 120 / 120
N3 Listening                  : 100 / 100
N2 Listening                  : 100 / 100
Active Listening Audio        : 200件（計5,515秒）
Missing Audio Leakage         : 0件

Mini Mock Runtime             : COMPLETE
Readiness Gating              : ACCURATE
HOLD Leakage                  : 0件
Unauthorized Scripts          : 0件
Correct Position Distribution : 24.99 / 25.02 / 24.97 / 25.01 %

P0 : 0件
P1 : 2件（いずれも外部要因でブロック）
P2 : 2件
P3 : 1件

N2 Exam Coverage Complete     : NO（語彙 482/2,647）
N3 Exam Coverage Complete     : NO（同上）
Pilot Complete                : NO
Staging Ready                 : YES
Production Deploy             : NOT_EXECUTED
```

---

## 1. このセッションで閉じたもの

| 項目 | 前 | 後 |
|---|---|---|
| N3読解 | 30 | **100**（5形式×20・全形式 saturated） |
| N2読解 | 30 | **120**（5形式×24・全形式 saturated） |
| N3聴解 | 25 | **100**（実音声100件） |
| N2聴解 | 25 | **100**（実音声100件） |
| 聴解の音声 | 50件 / 975秒 | **200件 / 5,515秒**・失敗0 |
| CORE語彙 層C | 249語 | **482語**（batch02で+233・保留17） |
| 語彙の選択式問題 | 975問 | **1,928問** |
| テスト | 1,509 | **1,536** |
| 先生別realtime音声 | 未実装 | **実装済み**（allowlist・実走待ち） |

`EXAM COVERAGE CLOSURE` 時点で最大の残作業だった
**読解・聴解 約310セットの不足は解消した**（`readingTargetMet: true` / `listeningTargetMet: true`）。

---

## 2. 実走できなかったこと（正直な記載）

### staging と production は同じ Supabase プロジェクトを共有している

- `.env` の `VITE_SUPABASE_URL` も `supabase/.temp/project-ref` も `jdkwijdphlkrcoiggfqw` 1つだけ
- `main`（＝production）にも `supabase/functions/ai-lesson-token` と AIコース画面が入っている

したがって **`ai-lesson-token` のデプロイは production Edge Function deploy に等しい**。
これは今回の禁止事項であり、§22 の「stagingとproductionを分離できないremote operation」に当たる。

`OPENAI_API_KEY` は Supabase Secret にのみ存在し、ローカルには無い。
OpenAI へ直接 client_secret を作って cedar の受理を確かめる経路も無い。

**結果:**

| task | 状態 |
|---|---|
| C-1 cedar の実走確認 | `blocked_external` |
| C-2 AI会話 E2E（実API） | `blocked_external` |
| B-4 注意書きの撤去 | `blocked_external`（C-1 が前提） |

**cedar を無断で marin へ戻して COMPLETE にはしていない。**
また、**実音声を確認する前に「切り替わります」と表示していない**。
`advTeacher.ts` の `voiceSwitchAvailable` は悠斗先生だけ `false` のままで、
ja/zh の注意書きも staging 上に出ていることを配信バンドルで確認済み。

### CEO が承認したら1コマンドで終わる

```bash
SUPABASE_ACCESS_TOKEN=$(cat ~/.supabase_backup_token) \
  npx supabase functions deploy ai-lesson-token --no-verify-jwt --project-ref jdkwijdphlkrcoiggfqw
node scripts/ai-course/verify-teacher-voice.mjs      # → generated/teacher-voice-smoke.json
```

`verify-teacher-voice.mjs` は今の状態で走らせると `BLOCKED` と理由を出力する（実行済み）。
`verdict: PASS` になったら `advTeacher.ts` の `voiceSwitchAvailable` を `true` にし、注意書きを消す。

---

## 3. 先生別 realtime 音声（実装の内容）

### 正準 mapping はサーバー側だけが持つ

```ts
// supabase/functions/ai-lesson-token/index.ts
const TEACHER_VOICE = { shoko: "marin", yuto: "cedar" } as const;
const resolveTeacherId = (v: unknown) =>
  (typeof v === "string" && v in TEACHER_VOICE) ? v : "shoko";
```

- クライアントが送るのは **`teacherId` だけ**。voice文字列は送らない（注入経路を作らない）
- 未指定・不正値・型違いはすべて既定の先生（翔子先生 / marin）へ倒れる
- 先生名・話し方も `TEACHER_PERSONA` でサーバーが決める。
  `voiceTutorPrompt.ts` の「翔子先生」ハードコードを解消したので、
  画面が悠斗先生のときAIも「悠斗先生」と名乗る
- **教材・出題・難易度・ルート・準備度は teacherId で一切変わらない**

### 機械で固定していること（`advTeacherVoice.test.ts` 16件）

- Edge Function のソースを読んで allowlist の中身を照合（3か所がズレない）
- 先生ごとに異なる音声であること
- `body.voice` / `plan.voice` を読む箇所が存在しないこと
- 固定値 `const VOICE =` が残っていないこと
- console 出力に APIキー・client secret・service key を出していないこと
- クライアントの送信ボディに `marin` / `cedar` が現れないこと
- 音声の説明文に「女性声／男性声」と断定していないこと

### 先生変更時の挙動

`CourseVoiceLesson` は `teacher.id` だけを依存にした effect を持ち、
先生が変わったら **既存 session を `stop()` で正常終了 → 新しい voice で新規 session を作成**する。
生成済み session の voice は差し替えない。言語切替（§4のmount1回設計）では発火しない。

---

## 4. 読解・聴解 — 件数だけで完成扱いにしていない

`scripts/ai-course/skill-coverage-report.ts` を新設し、形式別に段階を判定する
（`empty` → `insufficient` → `pilot` → `broad` → `saturated`）。

- 本文（聴解は原稿）が使い回されていたら上の段階へ上げない
- **設問文では重複を見ない**（「最も言いたいことは何か」は形式ごとに定型のため）。
  本文の骨格（かなを落とした漢字・カタカナ列）で重複を見る
- 難易度が1種類しか無ければ上げない

実測: 読解10形式・聴解10形式すべて `saturated`。**本文重複0・構造重複0・HOLD 0。**

聴解は音声が無い set が `playableSets()` から外れる設計のままで、
`missingAudio: 0`・manifest 失敗0。**音声の無い聴解は1件も出題されない。**

---

## 5. 語彙（層C）

| batch | 語数 | active_beta | needs_human_review |
|---|---|---|---|
| 01 | 251 | 249 | 2 |
| 02 | 250 | **233** | **17** |

batch02 の保留17語は、動詞連用形が見出しとして採取されただけのもの（「話し」「決め」「考え」「受け」等）、
機能語（「たい」「より」「そう」等）、読みが辞書索引で確認できない語（日本|にっぽん・今日|こんにち・明日|あす）。
**でっち上げず保留にした。** 保留語は出題プールに入らない。

多義語に `senseNoteZh` を付けたことで、batch01で101件あった `ambiguous_sense` 警告は batch02 で10件へ。

`validate-vocab-content` が package.json でバッチ1固定になっており batch02 が検査から漏れていたため、
**引数なしで全バッチを検査する**よう修正した。

---

## 6. 先生表示の整合（追加で見つけた不具合）

先生選択を入れた後も、次の2か所に既定の先生が残っていた。両方とも修正した。

1. `CourseIllustration`（AI会話完了・学習レポート・復習ゼロの空状態）が翔子先生固定
2. `CourseTextLesson` の発話者ラベルが「翔子先生／翔子老师」固定

イラストは slot→表情の対応にし、無いポーズは `teacherAsset()` が base へ落とす
（無い絵をでっち上げない）。翔子先生の専用ポーズ（cheer/wave）は既定時のみ使う。

---

## 7. 準備度ゲート（§17）

「1つでも欠ければ未判定」を、欠けている条件ごとに個別のテストで固定した（6件追加）。

| 欠けている条件 | overallPct |
|---|---|
| 聴解の記録なし（模試5回でも） | `null` |
| 読解の記録なし | `null` |
| 文字・語彙の記録なし | `null` |
| 未出問題の記録なし | `null` |
| 模試2回 | `null` |
| すべて充足 | 算出される |
| N3でも同じgate | 同じ |

AI会話の結果は JLPT 総合準備度へ加算していない（別軸のまま）。

---

## 8. 検証結果

```
vitest         1,536 pass / 0 fail
tsc            エラー 0
eslint         src/components/ai-course・src/lib/aiLesson・src/pages/ai-lesson・scripts で 0
build:staging  成功（language integrity validator を通過）
language integrity  blocking 0 ／ warning 970（中国語解説内の未引用日本語＝教材の表記様式）
answer distribution 24.99 / 25.02 / 24.97 / 25.01 %
vocab content       batch1 blocking 2・batch2 blocking 3（**いずれも needs_human_review 側。active は 0**）
audio manifest      200 / 200・失敗0
staging deploy      6fba10e2
```

### staging 実配信の確認

| 確認 | 結果 |
|---|---|
| `AdvShell-CWS0q1KB.js` が dist と一致し 200 | ✅ |
| 新規setId（`n3r-key-20` / `n2r-theme-24` / `n3l-int-20` / `n2l-quick-20`）が配信バンドルに含まれる | ✅ |
| 新規音声（`n3l-task-20` / `n2l-outline-20` / `n2l-point-06`）が 200 | ✅ |
| 「本番同等」が含まれない | ✅ |
| 悠斗先生の音声注意書き（ja/zh）が含まれる | ✅（意図的に残置） |
| 375px で横スクロールなし・console error 0 | ✅（未ログインの入口画面） |

⚠️ deploy 直後は `AdvShell-*.js` が一時的に 404 になる（エッジ伝播待ち）。数十秒後に 200 になることを確認済み。

---

## 9. 残課題

### P1（外部要因でブロック。AI側では進められない）

| # | 内容 | 解除条件 |
|---|---|---|
| P1-1 | cedar の実走確認と注意書きの撤去 | CEO が Edge Function デプロイを承認する |
| P1-2 | AI会話 E2E（実API 1周） | staging の learner ログイン情報 |

### P2

| # | 内容 | 補足 |
|---|---|---|
| P2-1 | CORE語彙 層C の残り **1,916語**（約8バッチ） | batch03・04 の対象リストは切り出し済み |
| P2-2 | `AdvShell` チャンクが 900 kB（gzip 263 kB）へ肥大 | 読解・聴解bankを取り込んだため。lazy chunkなので初回表示は影響しないが、冒険を開くときに読み込む。`readingPool()`/`listeningPool()` を動的importへ変える改修が要る（AdvShell・AdvMockRunner・クエスト生成に波及するため、実機検証できないこのセッションでは行わなかった） |

### P3

| # | 内容 |
|---|---|
| P3-1 | 悠斗先生の `cheer`（笑顔）画像が無く base で代用している |

---

## 10. CEO に見てほしい URL

- https://staging.badminton-platform.pages.dev/ja/ai-course?v2=1
- https://staging.badminton-platform.pages.dev/zh/ai-course?v2=1

（ログイン後に opt-in。旧Homeへ戻るボタンあり。
画面が古いときは URL に `&cb=<現在の秒>` を付ける）

**production・main・remote migration・Edge Function deploy はいずれも行っていない。**
