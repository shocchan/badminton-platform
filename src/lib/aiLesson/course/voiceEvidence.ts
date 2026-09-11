/*
 * 音声会話で「会話が成立したか」の材料を数える（2026-09-11 CEO指示）。
 *
 * 「実質的なAI会話が成立していない回は回数を消費しない」。
 * **成立したかを決めるのはサーバーだけ**（supabase/migrations/20260911120000_ai_voice_session_consumption.sql の
 * ai_voice_conversation_established）。ここはしきい値を持たず、数えて送るだけにする。
 * 両方にしきい値を書くと、判定が2か所になってずれる。
 *
 * 数えるもの:
 *   userTurns          … 生徒の有効な発話（isMeaningfulUserTurn を通ったもの）
 *   aiRepliesAfterUser … 生徒が話し終えたあとに、AI が応答した数
 *   tutorTurns         … AI が話した数（最初のあいさつを含む）
 *   userSpeechStarts   … 生徒の声をマイクが拾った回数（短い相づちも含む）
 *   connectedMs        … 実際につながっていた時間（切断中・エラー画面・再接続待ちは含めない）
 *
 * 「応答」は、文字起こしが届いた順ではなく**声の順番**で数える。
 * 生徒の文字起こしは、AI の返事の文字起こしより後に届くことがある（OpenAI 側で別々に処理される）。
 * そこで「生徒が話し終えた（マイクの無音）」のあとに来た AI の発話を応答として数える。
 */

export interface VoiceEvidence {
  connectedMs: number;
  userTurns: number;
  aiRepliesAfterUser: number;
  tutorTurns: number;
  userSpeechStarts: number;
}

export interface VoiceEvidenceTracker {
  /** 接続した（status が connected になった） */
  onConnected(nowMs: number): void;
  /** 接続していない状態になった（切断・エラー・停止・先生の切り替え）。つながっていたなら true（送る合図） */
  onDisconnected(nowMs: number): boolean;
  /** 生徒の声をマイクが拾い始めた */
  onUserSpeechStarted(): void;
  /** 生徒の声が止まった（話し始めていないのに呼ばれたときは何もしない） */
  onUserSpeechEnded(): void;
  /** 生徒の有効な発話が1回確定した（文字起こしが届いた） */
  onMeaningfulUserTurn(): void;
  /** AI の発話が1回確定した。生徒が話し終えたあとの応答として数えたら true（すぐ送る合図） */
  onTutorTurn(): boolean;
  snapshot(nowMs: number): VoiceEvidence;
}

export const createVoiceEvidenceTracker = (): VoiceEvidenceTracker => {
  let userTurns = 0;
  let aiRepliesAfterUser = 0;
  let tutorTurns = 0;
  let userSpeechStarts = 0;
  let speaking = false;
  let awaitingReply = false;
  let accumulatedMs = 0;
  let connectedSince: number | null = null;
  return {
    onConnected(nowMs) {
      if (connectedSince === null) connectedSince = nowMs;
    },
    onDisconnected(nowMs) {
      if (connectedSince === null) return false;
      accumulatedMs += Math.max(0, nowMs - connectedSince);
      connectedSince = null;
      return true;
    },
    onUserSpeechStarted() {
      userSpeechStarts += 1;
      speaking = true;
      // 生徒が続けて話し始めたら、まだ数えていない AI の返事は応答に数えない
      // （再生前に止められた返事の文字起こしが届いても、あいさつだけの回を「往復2回」にしない）
      awaitingReply = false;
    },
    onUserSpeechEnded() {
      // 停止・エラーのときにも「話していない」が届く。話し始めていなければ応答待ちにしない
      if (!speaking) return;
      speaking = false;
      awaitingReply = true;
    },
    onMeaningfulUserTurn() {
      userTurns += 1;
    },
    onTutorTurn() {
      tutorTurns += 1;
      if (!awaitingReply) return false;
      awaitingReply = false;
      aiRepliesAfterUser += 1;
      return true;
    },
    snapshot(nowMs) {
      const live = connectedSince !== null ? Math.max(0, nowMs - connectedSince) : 0;
      return {
        connectedMs: Math.round(accumulatedMs + live),
        userTurns,
        aiRepliesAfterUser,
        tutorTurns,
        userSpeechStarts,
      };
    },
  };
};

/**
 * 会話中に材料を送る間隔。サーバーが「成立」と返したら、それ以降は送らない。
 * 送るのは成立までの数回だけ（1分で最大4回）なので、DB の負荷にはならない。
 */
export const VOICE_EVIDENCE_HEARTBEAT_MS = 15_000;
