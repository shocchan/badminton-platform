# 次フェーズの監査（2026-09-11・読み取りのみ・コード変更なし）

CEO 指示: Case A〜G の結果を見てから、①adaptive の限定ロールアウト ②回数券1回＝6分の統一 ③先生の記憶機能の扱い を判断する。
その材料として、②と③を監査した。

## ② 4分／6分の不一致 — どこに 4分 が残っているか

正: `ai_config.conversation_beta`（sessionSeconds 240 / paidSessionSeconds 360）。`ai_start_session` と台帳 `ai_voice_session_ledger.session_max_seconds` はこれを返す・固定する。

途中で値が落ちている場所（この3つを直せば画面は6分になる）:
| 場所 | 現状 |
|---|---|
| `src/lib/aiLesson/course/courseRepository.ts:112-126, 288-303` | `createSession` が RPC の `sessionMaxSeconds` を捨てている |
| `src/pages/ai-lesson/AiCoursePage.tsx:657, 1356` | sessionId しか保持せず、会話画面に長さを渡していない |
| `src/components/ai-course/CourseVoiceLesson.tsx:95` | `DURATION = 180, HARD_END = 240, CLOSING_BEFORE = 30` をハードコード。473行で 240 秒で強制終了 |

同じ「4分」がハードコードされている他の場所（single source of truth 化の対象）:
| 種類 | 場所 | 値 |
|---|---|---|
| サーバー記録の上限 | `ai_config.usage_limits.session_max_seconds`（20260718 / 20260722）、`ai_record_usage`（20260817:46-49）、`ai_record_usage_event`（20260824:322-327） | 240 でクランプ＝**6分の回は利用秒数・原価が最大120秒分記録されない** |
| Edge Function | `ai-lesson-token/index.ts:390-391` | トークン寿命 300 秒・コメント「最大3分半」。`ai_service_claim_voice_token` が返す sessionMaxSeconds を捨てている |
| 画面のゲート | `AiCoursePage.tsx:1143` | `4 * 60 * 1000`（体験の残りが4分未満なら会話を出さない） |
| 原価・予算 | `courseConfig.ts:55`、`planAiBudget.ts:145-146, 314, 360`、`friendsBeta.ts:40-42, 109, 113` | 240 固定 |
| 商品文言 | `planCatalog.ts:229, 237, 292, 300`（体験パス・月額プラン「1回最大4分」）、`lpContent.ts:495`、`locales/aiCourse.ts:81, 1694`（「1回は3〜4分」） | 文字列にハードコード |
| 回数券文言 | `conversationTopups.ts:39` `PAID_SESSION_MINUTES = 6` → `ConversationTopupCard.tsx:115` | **こちらは定数から導出できている（お手本）** |
| 見積もり | `advQuest.ts:195, 262-265`、`advReviewForecast.ts:40-42`、`courseGrowth.ts:69` | 「AI会話 4分」 |
| テスト | `planAiBudget.test.ts:21`（240 を固定）ほか | 会話画面の HARD_END を検査するテストは無い＝ずれても気づけなかった |

特定商取引法・利用規約の文面には分数の記載なし。商取引上の分数は回数券の説明（6分）とプラン説明（4分）だけ。

### 提案（未実装）
- 正は「予約時に台帳へ固定した `session_max_seconds`」。`createSession` → `AiCoursePage` → `CourseVoiceLesson` の prop で渡し、95行の3定数を消して導出する（`HARD_END = max`、`DURATION = max − 60`、まとめ合図は `DURATION − 30`。合図の文言「残り約30秒」も定数から生成）。
- 端末間の再開（`getActiveSession`）でも台帳の値を返す。
- トークン寿命は `sessionMaxSeconds + 余裕` に。
- 記録のクランプは台帳の値（無ければ 360）を使う。`usage_limits.session_max_seconds` は「絶対上限」として 360 に上げる。
- 文言は `FREE_SESSION_MINUTES`／`PAID_SESSION_MINUTES` を1か所で定義して補間する（回数券カードと同じ形）。
- 会話画面の長さをテストで固定する。

## ③ 先生の記憶（learnerNotes）— 本番の現在状態

| 項目 | 結果 |
|---|---|
| 本番で有効か | **音声は ON**（Edge Function v29 が受け取り、本番の画面 2f3be003 が送っている）。**テキストは実質 OFF**（`ai-lesson-chat` の本番は v23・8/23 のままで、送られた notes を無視する）。デモページは無関係 |
| feature flag | **無い**。全体でも生徒ごとでも止められない。止めるには Edge Function を v28 に戻すしかなく、それは今日の回数消費修正も一緒に戻してしまう（禁止手順） |
| 何を記憶するか | `ai_learning_sessions.report`（AI が作った日本語レポート）だけ。直近30日・最大5行・各90字。①前回の会話の要約 ②前回できたこと ③2回以上出た直し ④前回直した言い方 |
| 保存しないもの | 生の文字起こし・生徒の元の言い方（`original`）・中国語の文・レポートの他の欄。要約し直しも無い |
| 保存先 | **新しい保存は無い**。毎回その場でレポートから組み立てる。テーブル・列・localStorage の追加なし |
| 保存期間 | レポート自体に期限が無い（削除される発話ログと違い、レポートは残す設計）。記憶に使うのは30日分。規約の「受講終了後1年」を実装する purge は無い（既存の穴） |
| 実在生徒の既存データ | 書き換え・migration なし。ただし v29 が出た 9/11 04:59Z から、直近30日にレポートがある全員の先生が前回の話に触れ始めた（告知なし） |
| 次回会話での使い方 | instructions に「【この人のこと】」節を足す。「書いていないことを覚えているふりをしない」の指示あり。出力側の検査は無い |
| 生徒間の混同 | 読み取りは learner_id + RLS で自分の分だけ。共有キャッシュ無し。**混ざらない** |
| 削除・失効 | 「学習データの削除」は発話ログだけ消し、レポートは残す → **削除した会話の内容を次回も先生が口にする**。生徒ごとの opt-out 無し。実在アカウントの自己削除 RPC も無い |
| 個人情報・自由入力 | レポートは実会話の自由文なので出身地・勤務先・病気・帰化などが載りうる。フィルタ無し。生徒が「覚えられている内容」を見る・消す手段が無い。notes はクライアントが送る文字列で、本人の回にしか効かないが改行や【】の除去無し（自分の回への prompt 操作は可能） |
| 原価 | 音声は1回あたり約500トークンの文字入力（1%未満）。テキストは毎ターン再送でも1%未満。追加の API 呼び出し無し |

### リスク順
1. 削除したはずの会話を先生が持ち出す（高）
2. 止めるスイッチが無い（高）
3. 全員に無告知で遡って ON になった（高）
4. 個人情報が無検査で prompt に入る（中〜高）
5. レポートの保持期限が規約と合っていない（中・既存）
6. テキストは片側だけ出ている（中・実害は無し）

### 最小の手当て（未実装・CEO 判断待ち）
- (a) `ai_config` に kill switch を置き、Edge Function 側で確認する（関数を戻さずに止められる）
- (b) 生徒ごとの opt-out（`ai_learners.settings`）と、「学習データの削除」でレポートの要約・直しも消す
- (c) notes の改行・【】を除去し、生徒が「覚えていること」を見られる画面
