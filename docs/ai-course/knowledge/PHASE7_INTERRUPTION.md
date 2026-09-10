# Phase 7 — AI会話の割り込み UX（adaptive interruption・2026-09-10）

## いまの問題（Before）
- 2026-08-16 のエコーループ（スピーカーの先生の声がマイクへ回り込み、先生が自分の声に割り込まれ続ける）の対策として、
  **先生が話している間はマイクを止める半二重**（`muteMicWhileTutorSpeaks: true`）を全員に適用している。
- 安全だが、「ちょっと待って」「それはどういう意味？」と言っても先生が止まらず、会話している感じがしない。
- モデルは `gpt-realtime-2.1`（現行最上位・確認済み）。**モデルは変えていない。**

## 作ったもの（`src/lib/aiLesson/interruptionPolicy.ts`）

| 部品 | 中身 |
|---|---|
| Adaptive VAD | 先生の発話中だけ `threshold 0.85 / prefix_padding 400ms`、発話が終わったら `0.6 / 300ms` に戻す（`session.update`・GA 形式）。**`interrupt_response: false`**＝止めるかどうかはクライアントの規則で決める |
| 明確な発話の判定 | 先生の発話中に検知した音が **550ms 以上続いたときだけ**割り込み（`response.cancel`＋`output_audio_buffer.clear`）。「あ」・咳・呼吸・環境音は `speech_stopped` が先に来るので無視 |
| Echo fallback | 割り込み直後の生徒の文字起こしが、先生の直前の発話と同じ（文字 2-gram の Jaccard ≥ 0.6）または空なら「エコーの疑い」。**60 秒内に 2 回**でそのセッションだけ半二重へ自動で戻す（全員を戻さない） |
| 環境の判定 | WeChat 内ブラウザ（UA の MicroMessenger）／イヤホン（デバイス名に headphone・AirPods・イヤホン…）。イヤホンなら adaptive、WeChat×スピーカーは半二重で開始 |
| 段階導入 | `rolloutStageOf(hostname, VITE_AI_INTERRUPTION_STAGE)`：**production の既定は半二重のまま**。staging（`staging`・`localhost`・`pages.dev`）と QA（env=qa）だけ adaptive。`?interrupt=adaptive|half_duplex` で個別に上書き |

状態機械は純粋関数（`onSpeechStarted / onSpeechStopped / confirmInterruption / onUserTranscriptAfterInterrupt`）で、
runtime（`voiceSession.ts`）はそれを呼んで `session.update`／`response.cancel` を送るだけ。

## 配線
- `voiceSession.ts`: `interruption` オプション。adaptive では `dc.onopen` で idle VAD、先生の発話開始で speaking VAD、終了で idle VAD。
  半二重（従来）の経路は無変更。fallback 時は `halfDuplex=true` にしてマイクを止め、VAD を従来の `interrupt_response: true` に戻す。
- `CourseVoiceLesson.tsx`: 環境・段階・旗から方針を決めて渡す。`muteMicWhileTutorSpeaks` は方針が半二重のときだけ true。
  出来事は `trackAdv('voice_interruption', { stageKey: valid|ignored|echo_suspect|fallback })`（会話本文は送らない）。
- サーバー（`ai-lesson-token`）は無変更。

## 値の根拠と、検証で決めること
数値は固定の正解ではない。既定値の根拠:
- threshold 0.85（先生の発話中）: 既存 0.7 で「小さな物音で止まる」実機報告があった。回り込みの先生の声は生の発話より小さいので、上げるほど誤検知は減る。
- minSpeechMs 550: 「あ」「うん」「咳」は 200〜400ms。「ちょっと待って」は 800ms 以上。
- similarity 0.6 / 2回 / 60秒: 1回の偶然の一致で全員を半二重へ戻さない。2回続けば回り込みと見てよい。

**検証の順（実在生徒で最初に試さない）**:
1. QA アカウント（n5copy）×staging で、スマホスピーカー／イヤホン／WeChat 内ブラウザ の3条件。
   見るもの: `voice_interruption` の valid／ignored／echo_suspect／fallback の数。
   - 「あ」「咳」で止まらない（ignored が増え、valid が増えない）
   - 「ちょっと待って」で止まる（valid）
   - WeChat×スピーカーで fallback が起きるか（起きるなら既定どおり半二重開始で正しい）
2. 値の調整（threshold・minSpeechMs・similarity）。
3. limited rollout（`?interrupt=adaptive` を渡した生徒だけ）。
4. **production 全体への反映は CEO 確認**（`VITE_AI_INTERRUPTION_STAGE=qa` を本番で立てる／既定を adaptive にする、のどちらも本番 deploy を伴う）。

## Before / After（設計上の期待。実測は QA で）
| | Before（半二重） | After（adaptive） |
|---|---|---|
| 「あ」「咳」で先生が止まる | 止まらない（マイクが止まっている） | 止まらない（550ms 未満は無視） |
| 「ちょっと待って」で止まる | **止まらない** | 止まる |
| エコーループ | 起きない | 疑い2回でそのセッションだけ半二重へ |
| WeChat×スピーカー | 半二重 | 半二重で開始（イヤホンなら adaptive） |
| 本番の生徒 | 半二重 | **半二重のまま**（CEO 確認まで） |

## テスト
- `interruptionPolicy.test.ts`（13）: 本番既定・環境判定・短い音の無視・明確な発話・echo fallback・時間窓。
- `voiceSessionUpdateShape.test.ts`: 追加した `session.update` も GA 形式（`session.type: 'realtime'`・`audio.input.turn_detection`）。
