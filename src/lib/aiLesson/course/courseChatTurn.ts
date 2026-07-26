// LLMテキスト会話のクライアント側状態機械（純関数・テスト可能）。
//
// サーバー（ai-lesson-chat）と二重のガードを張る:
//   - studentTurns >= maxTurns でクライアントも必ず closing 扱い
//   - 出題済み質問を askedQuestions としてサーバーへ渡す（重複質問防止）
//   - API失敗時は courseTextTurn（決定的エンジン）へ状態を引き継いでフォールバック
// 音声Realtime側とは無関係（voiceSession には触れない）。

import { initialTextTurnState } from './courseTextTurn';
import type { TextTurnState } from './courseTextTurn';
import type { ChatTurnResult } from './courseChatApi';

export interface ChatConvState {
  studentTurns: number;      // 送信済みの学習者ターン数
  maxTurns: number;          // 8（サーバーは10でハードキャップ）
  asked: string[];           // AIが出した質問（重複防止・直近10件で足りる）
  closingAnnounced: boolean; // 「あと1つ」段階に入ったか
  done: boolean;             // 終了（以降は送信しない）
}

export const initialChatConvState = (maxTurns = 8): ChatConvState => ({
  studentTurns: 0, maxTurns, asked: [], closingAnnounced: false, done: false,
});

/** 次の送信が closing 扱いになるか（サーバーへ closingAnnounced として渡す） */
export const willBeClosing = (s: ChatConvState): boolean =>
  s.closingAnnounced || s.studentTurns + 1 >= s.maxTurns;

/** 成功応答を状態へ反映する */
export const applyChatTurn = (s: ChatConvState, r: NonNullable<ChatTurnResult['turn']>): ChatConvState => {
  const studentTurns = s.studentTurns + 1;
  return {
    ...s,
    studentTurns,
    asked: r.question ? [...s.asked, r.question].slice(-10) : s.asked,
    // 終盤（次が最後の質問）に入ったらフラグを立てる。サーバー側の宣言と同期
    closingAnnounced: s.closingAnnounced || studentTurns >= s.maxTurns - 1,
    done: r.shouldClose,
  };
};

/** 表示用: 応答JSONを先生の吹き出し1つに合成する（反応→訂正→質問/締め） */
export const composeTutorText = (r: NonNullable<ChatTurnResult['turn']>): string => {
  const parts = [r.reaction.trim()];
  if (r.correction) parts.push(`✏️ ${r.correction.trim()}`);
  if (r.shouldClose) {
    if (r.closingMessage) parts.push(r.closingMessage.trim());
  } else if (r.question) {
    parts.push(r.question.trim());
  }
  return parts.filter(Boolean).join('\n');
};

/**
 * フォールバック: LLM会話の進行を決定的エンジンの状態へ引き継ぐ。
 * ターン数を維持するため、切替後も「最大8ターンで必ず終了」が保たれる。
 */
export const toGuidedState = (s: ChatConvState): TextTurnState => ({
  ...initialTextTurnState(s.maxTurns),
  turn: s.studentTurns,
  phase: s.done ? 'done' : s.closingAnnounced ? 'closingAnnounced' : 'talking',
});
