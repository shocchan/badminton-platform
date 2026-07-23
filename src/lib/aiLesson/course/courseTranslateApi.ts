// 翔子先生の日本語発話 → 短い中国語補助訳の取得（キャッシュ＋多重リクエスト抑止）。
//
// - 同じ字幕を何度も翻訳しない（テキストをキーにキャッシュ）
// - 同時に同じテキストを2回投げない（in-flight を共有）
// - 翻訳APIの失敗はここで飲み込み、呼び出し側はレッスンを止めない
// - APIキーは Edge Function 内のみ。ここでは JWT を Authorization に載せるだけ

import { getAccessToken } from './courseAuth';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export interface TranslateResult {
  ok: boolean;
  zh?: string;
  /** OpenAI usage（コスト集計用） */
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null;
}

// テキスト → 訳（成功のみ保持）。セッションをまたいでも同じ訳文は再利用できる。
const cache = new Map<string, string>();
// テキスト → 進行中の Promise（多重送信防止）
const inflight = new Map<string, Promise<TranslateResult>>();

/** gpt-4o-mini の概算単価（USD / 1M tokens）。コスト集計の目安 */
const MINI_COST = { input: 0.15, output: 0.6 } as const;
export const estimateTranslateCostUsd = (usage: TranslateResult['usage']): number => {
  if (!usage) return 0;
  const inTok = usage.prompt_tokens ?? 0;
  const outTok = usage.completion_tokens ?? 0;
  return (inTok * MINI_COST.input + outTok * MINI_COST.output) / 1_000_000;
};

/** キャッシュ済みの訳（同期取得）。無ければ null */
export const cachedTranslation = (text: string): string | null => cache.get(text.trim()) ?? null;

/**
 * 翔子先生の発話 1 行を中国語補助訳にする。
 * sessionId が無い場合は翻訳しない（デモや未認可では字幕補助を出さない）。
 */
export const translateTutorLine = async (
  sessionId: string | null,
  text: string,
  targetHint?: string,
): Promise<TranslateResult> => {
  const key = text.trim();
  if (!key) return { ok: false };
  const hit = cache.get(key);
  if (hit) return { ok: true, zh: hit };
  if (!SUPA_URL || !ANON_KEY || !sessionId) return { ok: false };

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = (async (): Promise<TranslateResult> => {
    try {
      const accessToken = await getAccessToken();
      if (!accessToken) return { ok: false };
      const res = await fetch(`${SUPA_URL}/functions/v1/ai-lesson-translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ sessionId, text: key, targetHint }),
      });
      if (!res.ok) return { ok: false };
      const data = await res.json().catch(() => null);
      const zh = typeof data?.zh === 'string' ? data.zh.trim() : '';
      if (!zh) return { ok: false };
      cache.set(key, zh);
      return { ok: true, zh, usage: data?.usage ?? null };
    } catch {
      return { ok: false };
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
};

/** テスト用: キャッシュを空にする */
export const _resetTranslateCache = (): void => { cache.clear(); inflight.clear(); };
