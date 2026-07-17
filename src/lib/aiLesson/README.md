# AI日本語学習機能 — 設計メモ

## 全体構成

```
src/pages/ai-lesson/AiLessonDemoPage.tsx   … ステップ制御（gate→hearing→plan→mission→lesson→report）
src/components/ai-lesson/                  … UI（レッスン画面は集中モード = 全画面）
src/lib/aiLesson/
  types.ts        … 共通型（LessonSessionState = テキスト/音声共通の状態モデル）
  tutorEngine.ts  … TutorEngine インターフェース（テキスト/音声共通の契約）
  mockTutor.ts    … モック実装（現在使用中）
  planGenerator.ts… ヒアリング→学習プラン（ルールベース）
  xp.ts           … XP計算・ゲージ（テキスト/音声共通）
  repository.ts   … 保存層（localStorage。将来Supabaseへ差し替え）
src/locales/aiLesson.ts … UI文言辞書（ja/zh）
```

## テキストモードと音声モードの共通化方針

**共通（TutorEngine + LessonSessionState + xp.ts + repository.ts に集約済み）**
- レッスンテーマ / 目標表現 / レッスンフェーズ / ヒント段階（6段階サポート）
- 中国語サポート設定 / 訂正方針 / 目標表現の使用判定（self/hint）
- XP計算 / レポート生成 / 復習項目生成（翌日・3日後・7日後）
- レッスン終了条件（時間切れ→まとめ→レポート）/ 学習履歴

**音声モード専用（将来 `voiceSession.ts` として分離。エンジンには置かない）**
- マイク入力 / 音声出力（TTS）/ 割り込み（barge-in）/ 無音検知 / 発話開始・終了検知（VAD）
- 音声遅延の吸収 / Realtime API接続状態 / セッション切断・再接続 / マイク権限 / WebRTC・WebSocket処理
- 音声レイヤーは「文字起こし→ engine.reply() →返答テキストを読み上げ」の橋渡しに徹する

## レッスン進行の設計（音声モードでも同じ）

1. **導入**: テーマ＋目標表現の宣言 → 短い意味説明 → お手本（start / onPhase('teach')）
2. **会話**: 1ターン1質問。回答のキーワードを拾って受け止め→追加質問。
   目標表現が出なければ自然に再挑戦へ誘導（最大2回）。テーマから外れたら一度受け止めて戻す。
3. **言い直し**: 残り30秒で onPhase('wrapup')。目標表現未使用なら一番長い発話をモデル文で言い直させる。
4. **まとめ**: できたことを具体的に伝え、翌日復習を予告して自然に終了。
   タイマー0で強制終了せず「まとめへ進む」バナー表示のみ。

## 段階的サポート（hint() / 「分かりません」検出で1段階ずつ進む）

1. 短く簡単な日本語で再質問 → 2. 重要語句の言い換え → 3. 選択肢2〜4個 →
4. 答えの一部提示（穴埋め） → 5. 完成例文の提示 → 6. 復唱を促す

## 中国語サポートのルール（zhSupport 設定で制御）

- `whenStuck`: ヒント・中文解释ボタン時のみ / `grammar`: 文法説明に付加 / `often`: ほぼ全発話に付加 / `none`: なし
- 生徒が中国語で回答 → 受け止め→日本語モデル文へ変換→復唱を促す（中国語で会話を続けない）
- 中国語は短く、直後に必ず日本語へ戻す

## Realtime API 接続時に必要になる Supabase Edge Functions（未実装）

| Function | 役割 |
|---|---|
| `ai-lesson-token` | デモコード検証 → OpenAI Realtime の ephemeral トークン発行（APIキーはsecrets） |
| `ai-lesson-chat` | テキストモードのAI化: プラン＋セッション状態を渡してチャット応答（SSE） |
| `ai-lesson-report` | 会話ログから学習レポート生成（表現抽出・訂正一覧） |

いずれもデモコード（将来は生徒アカウント）をサーバー側で検証し、回数制限を入れること。
