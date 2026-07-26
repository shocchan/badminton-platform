// テキスト会話ターンAPI（ai-lesson-chat Edge Function呼び出し）。
//
// - APIキーはEdge Function内のみ。ここではJWTをAuthorizationに載せるだけ
// - 多重送信防止（in-flight中は同一セッションの追加送信を拒否）
// - タイムアウト（25秒）・自動リトライなし（失敗はフォールバックエンジンが引き受ける）
// - 失敗はここで飲み込み ok:false を返す。呼び出し側はレッスンを止めない

import { getAccessToken } from './courseAuth';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TIMEOUT_MS = 25000;

export interface ChatTurnResult {
  ok: boolean;
  turn?: {
    reaction: string;
    correction: string | null;
    question: string | null;
    shouldClose: boolean;
    closingMessage: string | null;
    /** 応答全体の簡体字訳（折り畳み表示用・同一応答で生成済み＝追加課金なし） */
    translationZh: string | null;
    /** 学習者レベルより難しい語の読み（最大3語） */
    readingAids: { text: string; reading: string }[];
  };
  studentTurns?: number;
  maxTurns?: number;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

export interface ChatTurnRequest {
  sessionId: string;
  locale: 'ja' | 'zh';
  learnerLevel: number;
  /** JLPT目安（N5〜N1）。語彙・文長の制御に使う */
  estimatedLevel: string;
  missionTitleJa: string;
  targetExpression: string;
  history: { role: 'student' | 'tutor'; text: string }[];
  studentText: string;
  maxTurns: number;
  closingAnnounced: boolean;
  askedQuestions: string[];
}

// セッションごとの in-flight（多重送信防止）
const inflight = new Set<string>();

/** gpt-4o-mini の概算単価（USD / 1M tokens）。セッションコスト集計用 */
const MINI_COST = { input: 0.15, output: 0.6 } as const;
export const estimateChatCostUsd = (usage: ChatTurnResult['usage']): number => {
  if (!usage) return 0;
  return ((usage.prompt_tokens ?? 0) * MINI_COST.input + (usage.completion_tokens ?? 0) * MINI_COST.output) / 1_000_000;
};

/** 会話ターンを1回生成する。in-flight中の再呼び出しは即 ok:false（多重送信防止） */
export const requestChatTurn = async (req: ChatTurnRequest): Promise<ChatTurnResult> => {
  if (!SUPA_URL || !ANON_KEY) return { ok: false };
  if (inflight.has(req.sessionId)) return { ok: false };
  inflight.add(req.sessionId);
  try {
    const accessToken = await getAccessToken();
    if (!accessToken) return { ok: false };
    const res = await fetch(`${SUPA_URL}/functions/v1/ai-lesson-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    if (!data?.turn || typeof data.turn.reaction !== 'string') return { ok: false };
    return {
      ok: true,
      turn: {
        reaction: data.turn.reaction,
        correction: data.turn.correction ?? null,
        question: data.turn.question ?? null,
        shouldClose: !!data.turn.shouldClose,
        closingMessage: data.turn.closingMessage ?? null,
        translationZh: typeof data.turn.translationZh === 'string' ? data.turn.translationZh : null,
        readingAids: Array.isArray(data.turn.readingAids)
          ? data.turn.readingAids
            .filter((a: unknown): a is { text: string; reading: string } =>
              !!a && typeof (a as { text?: unknown }).text === 'string' && typeof (a as { reading?: unknown }).reading === 'string')
            .slice(0, 3)
          : [],
      },
      studentTurns: typeof data.studentTurns === 'number' ? data.studentTurns : undefined,
      maxTurns: typeof data.maxTurns === 'number' ? data.maxTurns : undefined,
      usage: data.usage ?? null,
    };
  } catch {
    return { ok: false };
  } finally {
    inflight.delete(req.sessionId);
  }
};
