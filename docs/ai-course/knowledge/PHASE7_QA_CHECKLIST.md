# Adaptive interruption — 実機 QA チェックリスト（Case A〜G）

人が実機で試すための手順。**本番の生徒には何も変わらない**（production の既定は half_duplex のまま）。
QA は **QA アカウント（サマー検証コピー / n5copy・is_test）だけ**で行う。実在生徒のアカウントでは試さない。

## 準備（済み・2026-09-10）
| | |
|---|---|
| QA アカウント | user `8f190d9c…` / learner `b04b29aa…`（`is_test = true`） |
| AI会話の回数 | 週3回は使い切り → **回数券 残り 4**（うち +3 を QA 用に付与。`ai_conversation_credits` id `414c5743…`・reason `grant`・purchase_id なし＝売上に入らない） |
| 1回の長さ | 回数券の回は 6 分 |
| 画面 | staging（staging.badminton-platform.pages.dev）。データは本番 Supabase |
| 数値パネル | 会話画面の上に `QA interrupt: …` の点線の枠が出る（会話本文も音声も保存しない） |

### 入り方
1. スマホで次を開く（コードで QA アカウントに入り、割り込みの旗とパネルを有効にする）
   `https://staging.badminton-platform.pages.dev/ja/learn/JNKX-NGAP-Y7PA?interrupt=adaptive&interruptDebug=1`
2. 「ほかの学習を見る」→「AI会話（ベータ）」→ 場面を1つ選んで開始
3. 会話画面の上のパネルで `start=adaptive` になっているか確認
   - WeChat 内ブラウザは旗が無いと `start=half_duplex (staging:wechat-speaker)` になる。F は旗つきで試す
4. 旗を消すとき: `?interrupt=off&interruptDebug=0` を付けて開き直す

### パネルの読み方
| 表示 | 意味 |
|---|---|
| `start` / `now` | 開始時の方式 / いまの方式（fallback すると now が half_duplex になる） |
| `valid(cancel)` | 明確な発話で先生を止めた回数（＝`response.cancel` を送った回数） |
| `ignored` | 先生の発話中の短い音を無視した回数（false interruption を防いだ回数） |
| `echo` | 割り込み直後の文字起こしが先生の直前の発話と同じだった回数（エコーの疑い） |
| `fallback` | このセッションだけ半二重へ戻した回数 |
| `turnsAfterFallback` | 半二重へ戻ったあとに先生が話した回数（**会話が続いているか**） |

## 必要な回数（4 回で足りる組み方）
| 回 | 端末・条件 | この回で見る Case |
|---|---|---|
| 1 | スマホ・**イヤホンなし**・通常ブラウザ（Safari / Chrome） | A, B, C, D（G が起きればそれも） |
| 2 | スマホ・**イヤホンあり**・通常ブラウザ | A, C, E |
| 3 | **WeChat 内ブラウザ**・イヤホンなし・`?interrupt=adaptive` 付き | F（G が起きやすい） |
| 4 | 予備（どれかをやり直す） | |

## Case と記録欄
先生が話している最中に行う。各 Case は 2〜3 回ずつ試し、パネルの数値を控える。

| Case | やること | 期待 | 結果（◯/×・パネルの数値・気づき） |
|---|---|---|---|
| A | 小さく「あ」／「うん」 | 先生は止まらない。`ignored` が増え `valid` は増えない。先生が話し終わった直後に「あ」への返事が始まらない | |
| B | 咳・深い呼吸・机を軽く叩く・近くで物音 | 先生は止まらない。`valid` は増えない | |
| C | 「ちょっと待って」「それどういう意味？」とはっきり言う | 先生が 1 秒以内に止まり、言い終わると先生がそれに答える。`valid` が 1 増える | |
| D | イヤホンなしで 6 分話す | 先生が自分の声で止まり続けない。`valid` が勝手に増え続けない | |
| E | イヤホンありで C を繰り返す | 毎回止まる（3 回中 3 回）。`echo` は 0 | |
| F | WeChat 内ブラウザで A〜C | 会話が止まって進めなくなる状態にならない | |
| G | エコーの疑いが続いたとき（D/F で起きうる） | `fallback=1`・`now=half_duplex` になり、そのあと `turnsAfterFallback` が増える＝会話が続く | |

## 本番 ON の判断基準（CEO 指示・2026-09-10）
Case C が 1 回成功しただけでは ON にしない。最低限すべて:
1. 明確な発話で割り込める（C・E）
2. 「あ」や咳で頻繁に止まらない（A・B）
3. イヤホンなしでも echo loop しない（D）
4. WeChat で会話不能にならない（F）
5. 異常時の fallback が実際に働く（G）

端末・ブラウザで結果が分かれる場合は、全員一律 ON ではなく環境別の rollout（例: イヤホン／通常ブラウザ → adaptive、WeChat×スピーカー → half_duplex）を検討する。
方針の切り替えは `src/lib/aiLesson/interruptionPolicy.ts` の `resolveInterruptionMode` だけで行える。

## 既知の不確かさ（実機で確かめること）
- 先生の発話中は VAD の `create_response=false`。割り込みが成立したときだけ、生徒の発話が終わってから 0.8 秒待ってクライアントが `response.create` を送る（VAD が先に作っていれば送らない）。**C で「止まったのに先生が答えない」なら、ここを疑う**
- 閾値（`threshold 0.85`・`minSpeechMs 550`）は仮の値。A/B で止まる・C で止まらない、が出たら調整する
- WeChat 内ブラウザで staging（pages.dev）が開けない・警告が出る場合がある

## QA 後に戻すこと
- 回数券を使い切らなかった場合、QA 付与ぶんを戻す: `ai_conversation_credits` へ `delta = -（残りのうち付与ぶん）`・`reason = 'adjust'` を 1 行入れる（台帳は追記のみ・消さない）
- `?interrupt=off&interruptDebug=0` を開いてタブの記憶を消す
