// AI原価のモデル別単価（USD / 1M tokens）。**単価をここ以外に書かない。**
//
// なぜ要るか（2026-08-24 WAVE 4-4）:
//   これまで単価が3か所に散っていた。
//     - courseConfig.ts REALTIME_COST（音声 32/64）
//     - courseChatApi.ts MINI_COST（テキスト 0.15/0.6）
//     - courseTranslateApi.ts MINI_COST（同じ値をもう一度）
//     - planAiBudget.ts TEXT_USD_PER_SESSION = 0.004（どのモデルの何トークンぶんか書いていない）
//   散っていると、実際に走ったモデルが違っても誰も気づけない。
//   実際 `AI_LESSON_CHAT_MODEL` は env で差し替えられるので、
//   **今どのモデルで課金されているかはコードを読んでも分からない**状態だった。
//
// 記録される原価の正は DB 側（ai_model_prices と ai_model_cost_usd）。
// このファイルは「設計・見積り・画面表示」用の写しで、
// 一致は aiModelPricing.test.ts が migration の seed を読んで検証する。
//
// 出典（provenance）の書き方:
//   repo:<path>  … 今日より前からこのリポジトリに在った数字（新規に持ち込んでいない）
//   list:<行>    … OpenAI 価格表の該当行。**未突合**（実請求と突き合わせていない）
//   derived:<式> … 他の単価から導いた値
// 「未突合」を消してよいのは scripts/ai-course/reconcile-openai-cost.mjs で
// 実請求と突き合わせた後だけ。

import { REALTIME_COST } from './courseConfig';

/** 原価の種別。DB の ai_usage_events.kind と同じ集合 */
export type AiUsageKind = 'voice' | 'text' | 'report' | 'translate' | 'transcribe';

/**
 * その金額がどう出たか。**推定と実測を同じ列に混ぜない**（今回の問題の本質）。
 *   estimated … 分数などから「こちらが仮定した」トークン数で計算した値
 *   reported  … OpenAI のレスポンス usage が返した実トークン数で計算した値
 *   billed    … OpenAI の請求API と突合して確定した値
 */
export type AiCostSource = 'estimated' | 'reported' | 'billed';

export interface ModelPrice {
  model: string;
  inputPerMillion: number;
  cachedInputPerMillion: number;
  outputPerMillion: number;
  audioInputPerMillion: number;
  audioOutputPerMillion: number;
  provenance: string;
}

/**
 * 単価表。**音声の 32/64 は courseConfig の REALTIME_COST から取る**（二重管理しない）。
 * ここに無いモデルが使われたら、コストは 0 ではなく「表の最大単価」で見積もる
 * （0 にすると、知らないモデルを使った月だけ原価が消える＝いちばん危ない向きに外れる）。
 */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'gpt-realtime-2.1': {
    model: 'gpt-realtime-2.1',
    inputPerMillion: 4,
    cachedInputPerMillion: 0.4,
    outputPerMillion: 16,
    audioInputPerMillion: REALTIME_COST.inputPerMillion,   // repo:courseConfig.ts (32)
    audioOutputPerMillion: REALTIME_COST.outputPerMillion, // repo:courseConfig.ts (64)
    provenance:
      'repo:src/lib/aiLesson/course/courseConfig.ts REALTIME_COST(32/64) '
      + '+ list:realtime text 4/16, cached audio 0.4 (未突合)',
  },
  'gpt-realtime-2.1-mini': {
    model: 'gpt-realtime-2.1-mini',
    inputPerMillion: 0.6,
    cachedInputPerMillion: 0.06,
    outputPerMillion: 2.4,
    audioInputPerMillion: 10,
    audioOutputPerMillion: 20,
    provenance:
      'repo:supabase/functions/ai-lesson-token/index.ts コメント(音声10/20) + list:mini text (未突合)',
  },
  'gpt-4o-mini': {
    model: 'gpt-4o-mini',
    inputPerMillion: 0.15,
    cachedInputPerMillion: 0.075,
    outputPerMillion: 0.6,
    audioInputPerMillion: 0,
    audioOutputPerMillion: 0,
    provenance:
      'repo:src/lib/aiLesson/course/courseChatApi.ts MINI_COST(0.15/0.6) + derived:cached=input*0.5',
  },
  /**
   * **これが 17 倍問題の主犯候補。** AI_LESSON_CHAT_MODEL / AI_LESSON_REPORT_MODEL /
   * AI_LESSON_TRANSLATE_MODEL は env で差し替えられる。gpt-4o は gpt-4o-mini の
   * ちょうど 16.67 倍（2.50/0.15 = 10/0.6 = 16.667）で、
   * 監査の「テキスト1回 $0.069」は gpt-4o-mini 前提の見積り $0.004 の約17倍にあたる。
   */
  'gpt-4o': {
    model: 'gpt-4o',
    inputPerMillion: 2.5,
    cachedInputPerMillion: 1.25,
    outputPerMillion: 10,
    audioInputPerMillion: 0,
    audioOutputPerMillion: 0,
    provenance: 'list:gpt-4o text 2.50/10.00 (未突合)。derived:cached=input*0.5',
  },
  'gpt-4o-transcribe': {
    model: 'gpt-4o-transcribe',
    inputPerMillion: 2.5,
    cachedInputPerMillion: 2.5,
    outputPerMillion: 10,
    audioInputPerMillion: 6,
    audioOutputPerMillion: 0,
    provenance: 'list:gpt-4o-transcribe audio-in 6.00 / text 2.50/10.00 (未突合)',
  },
};

/** 表の中の最大単価（未知モデルのフォールバック。過大に見積もる向きへ倒す） */
const maxOf = (pick: (p: ModelPrice) => number): number =>
  Object.values(MODEL_PRICES).reduce((m, p) => Math.max(m, pick(p)), 0);

export const UNKNOWN_MODEL_PRICE: ModelPrice = {
  model: '(unknown)',
  inputPerMillion: maxOf((p) => p.inputPerMillion),
  cachedInputPerMillion: maxOf((p) => p.cachedInputPerMillion),
  outputPerMillion: maxOf((p) => p.outputPerMillion),
  audioInputPerMillion: maxOf((p) => p.audioInputPerMillion),
  audioOutputPerMillion: maxOf((p) => p.audioOutputPerMillion),
  provenance: 'derived:表の最大単価。未知モデルは0にせず過大側へ倒す',
};

export interface ResolvedPrice {
  price: ModelPrice;
  /** 単価表にこのモデル（の系列）がある。false = 最大単価で過大に見積もっている */
  known: boolean;
  matchedBy: 'exact' | 'prefix' | 'fallback';
}

/**
 * モデル名 → 単価。照合は「完全一致 → いちばん長い前方一致 → 最大単価」。
 *
 * OpenAI は要求した `gpt-4o-mini` に対し `gpt-4o-mini-2024-07-18` のような
 * 版つきの名前を返すことがある。記録には**実際に返った名前をそのまま残す**ので
 * （env で差し替えられるのだから、記録が実際の値でなければ意味がない）、
 * 版差はここで吸収する。DB 側 ai_model_cost_usd と同じ順序。
 */
export const resolvePrice = (model: string | null | undefined): ResolvedPrice => {
  const key = (model ?? '').trim();
  const exact = MODEL_PRICES[key];
  if (exact) return { price: exact, known: true, matchedBy: 'exact' };
  const prefix = Object.values(MODEL_PRICES)
    .filter((p) => key.startsWith(p.model))
    .sort((a, b) => b.model.length - a.model.length)[0];
  if (prefix) return { price: prefix, known: true, matchedBy: 'prefix' };
  return { price: UNKNOWN_MODEL_PRICE, known: false, matchedBy: 'fallback' };
};

export interface TokenCounts {
  inputTokens?: number;
  /** 単価が違うので入力と分けて数える（多くのモデルで入力の半額） */
  cachedInputTokens?: number;
  outputTokens?: number;
  audioInputTokens?: number;
  audioOutputTokens?: number;
}

const nz = (v: number | undefined): number => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0);

/** トークン数 → USD。**金額の計算はここだけ**（呼び出し側で単価を掛けない） */
export const costUsdForTokens = (model: string | null | undefined, t: TokenCounts): number => {
  const { price } = resolvePrice(model);
  return (
    nz(t.inputTokens) * price.inputPerMillion
    + nz(t.cachedInputTokens) * price.cachedInputPerMillion
    + nz(t.outputTokens) * price.outputPerMillion
    + nz(t.audioInputTokens) * price.audioInputPerMillion
    + nz(t.audioOutputTokens) * price.audioOutputPerMillion
  ) / 1_000_000;
};

/**
 * OpenAI Chat Completions の `usage` → TokenCounts。
 * `prompt_tokens` にはキャッシュ済みぶんも含まれるので、差し引いてから数える
 * （引かずに両方数えると二重計上になる）。
 */
export const tokensFromChatUsage = (usage: unknown): TokenCounts => {
  const u = (usage ?? {}) as {
    prompt_tokens?: number; completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  const prompt = nz(u.prompt_tokens);
  const cached = Math.min(nz(u.prompt_tokens_details?.cached_tokens), prompt);
  return {
    inputTokens: prompt - cached,
    cachedInputTokens: cached,
    outputTokens: nz(u.completion_tokens),
  };
};

/**
 * 音声（realtime）の「分数 → トークン数」の**仮定**。
 * WebRTC でブラウザが OpenAI へ直接つなぐため、こちら側では usage を受け取れない。
 * だから音声の金額は必ず source='estimated' であり、
 * **分数と、その分数がどう測られたか（duration_source）を根拠として残す**。
 */
export const estimateRealtimeTokens = (durationSeconds: number): TokenCounts => {
  const minutes = Math.max(durationSeconds, 0) / 60;
  return {
    audioInputTokens: minutes * REALTIME_COST.approxInputTokensPerMin,
    audioOutputTokens: minutes * REALTIME_COST.approxOutputTokensPerMin,
  };
};

/** 音声1分あたりの原価（USD）。モデル指定なしなら既定の realtime モデル */
export const DEFAULT_REALTIME_MODEL = 'gpt-realtime-2.1';

export const realtimeUsdPerMinute = (model: string = DEFAULT_REALTIME_MODEL): number =>
  costUsdForTokens(model, estimateRealtimeTokens(60));
