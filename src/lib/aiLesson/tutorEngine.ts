// チューターエンジンの共通インターフェース
// テキストモード（現在）と音声モード（将来のOpenAI Realtime API）の両方がこの契約を実装する。
//
// 実装の切り替えイメージ:
//   テキスト（モック）  : createMockTutor(plan)            … mockTutor.ts（実装済み）
//   テキスト（AI接続）  : createApiTutor(plan, sessionKey) … Supabase Edge Function `ai-lesson-chat` を呼ぶ
//   音声（Realtime API）: createVoiceTutor(plan, token)    … Edge Function `ai-lesson-token` で
//                         ephemeralトークンを発行し、WebRTCでOpenAIへ直接接続
//
// 【共通化される責務】（このインターフェース＋types.ts の LessonSessionState）
//   テーマ / 目標表現 / フェーズ進行 / ヒント段階 / 中国語サポート設定 / 訂正方針 /
//   目標表現の使用判定 / 学習実績の記録 → XP計算(xp.ts) / レポート・復習項目生成 / 履歴保存(repository.ts)
//
// 【音声モード専用の責務】（ここには置かない。将来 voiceSession.ts に分離する）
//   マイク入力 / 音声出力 / 割り込み(barge-in) / 無音検知 / 発話開始・終了検知(VAD) /
//   音声遅延の吸収 / Realtime API接続状態 / セッション切断・再接続 / マイク権限 / WebRTC・WebSocket処理
//   ※音声レイヤーは「文字起こしテキスト」をこのエンジンの reply() に渡し、
//     返ってきた TutorTurn.messages を読み上げる、という橋渡しに徹する。

import type {
  CorrectionRecord,
  ExpressionRecord,
  LessonPhase,
  LessonSessionState,
  TutorTurn,
} from './types';

/** レッスン終了時にレポートへ渡す結果 */
export interface TutorOutcome {
  expressions: ExpressionRecord[];
  corrections: CorrectionRecord[];
  missionAchieved: boolean;
}

export interface ReplyOptions {
  /** 選択肢チップ経由の回答（自力入力と区別して「ヒントあり使用」扱いにする） */
  viaQuickReply?: boolean;
  /** 音声入力経由の回答（将来: 発話由来の表記ゆれを緩く判定するため） */
  viaVoice?: boolean;
}

export interface TutorEngine {
  /** レッスン開始（導入: テーマ・目標表現の提示） */
  start(): TutorTurn;
  /** フェーズ境界（UI のタイマーが呼ぶ。音声モードでは残り時間からエンジン自身が判断） */
  onPhase(phase: LessonPhase): TutorTurn;
  /** 生徒の発話への応答 */
  reply(userText: string, opts?: ReplyOptions): TutorTurn;
  /** 段階的サポート（呼ぶたびに1段階進む: 言い換え→語句説明→選択肢→一部提示→完成例→復唱） */
  hint(): TutorTurn;
  /** 中国語での説明（現在の質問と目標表現） */
  zhExplain(): TutorTurn;
  /** セッション状態のスナップショット（音声モードの進行判断・デバッグ用） */
  getState(): Readonly<LessonSessionState>;
  /** レポート用の結果 */
  getOutcome(): TutorOutcome;
}
