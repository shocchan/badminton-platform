// AI原価の実利用記録（Edge Function 共通・2026-08-24 WAVE 4-4）
//
// 方針:
//   - **金額をここで計算しない。** 送るのは「実際に使われたモデル名」と「トークン数」だけ。
//     単価は DB（ai_model_prices）が正で、金額は ai_record_usage_event が計算する。
//     関数側で金額を作ると、単価の写しがズレた瞬間に台帳が静かに壊れる
//     （それが「実測 $8.11/時間」が循環参照になっていた原因そのもの）。
//   - **モデル名は env の既定値ではなく、OpenAI が返した実際の値を優先する。**
//     AI_LESSON_CHAT_MODEL 等で差し替えられるので、記録が実際の値でなければ意味がない。
//   - 記録に失敗しても学習は止めない（原価台帳のためにレッスンを落とさない）。
//   - 既定では ai_usage_daily へ積まない（rollup=false）。クライアントが今も
//     ai_record_usage で日次へ積んでいるため、両方から積むと数字が倍になる。

export type AiUsageKind = "voice" | "text" | "report" | "translate" | "transcribe";
export type AiCostSource = "estimated" | "reported" | "billed";

export interface CostMeterEnv {
  url: string;
  serviceKey: string;
}

/** SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が揃っていれば env を返す */
export const costMeterEnvFrom = (get: (k: string) => string | undefined): CostMeterEnv | null => {
  const url = get("SUPABASE_URL");
  const serviceKey = get("SUPABASE_SERVICE_ROLE_KEY");
  return url && serviceKey ? { url, serviceKey } : null;
};

export interface ChatUsageLike {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface TokenCounts {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

const nz = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/**
 * OpenAI Chat Completions の usage → トークン数。
 * prompt_tokens はキャッシュ済みぶんを含むので差し引く（引かないと二重計上）。
 * src/lib/aiLesson/course/aiModelPricing.ts の tokensFromChatUsage と同じ規則。
 */
export const tokensFromChatUsage = (usage: unknown): TokenCounts => {
  const u = (usage ?? {}) as ChatUsageLike;
  const prompt = nz(u.prompt_tokens);
  const cached = Math.min(nz(u.prompt_tokens_details?.cached_tokens), prompt);
  return { inputTokens: prompt - cached, cachedInputTokens: cached, outputTokens: nz(u.completion_tokens) };
};

/**
 * OpenAI のレスポンスから、実際に使われたモデル名を取る。
 * 応答が名乗らないときだけ、要求したモデル名へ倒す。
 */
export const modelFromResponse = (data: unknown, requested: string): string => {
  const m = (data as { model?: unknown } | null)?.model;
  return typeof m === "string" && m.trim() ? m.trim().slice(0, 80) : requested;
};

export interface RecordUsageEventArgs {
  kind: AiUsageKind;
  /** 実際に使われたモデル名（modelFromResponse の戻り値） */
  model: string;
  /** 既定は reported（OpenAI が返した実トークン数） */
  source?: AiCostSource;
  tokens?: Partial<TokenCounts> & { audioInputTokens?: number; audioOutputTokens?: number };
  realtimeSeconds?: number;
  /** その分数がどう測られたか。音声はトークンが取れないので、これが唯一の根拠になる */
  durationSource?: string;
  sessionId?: string | null;
  learnerId?: string | null;
  note?: string;
  /** true にすると ai_usage_daily へも積む。既定 false（クライアント側と二重計上しない） */
  rollup?: boolean;
}

/**
 * 明細を1件記録する。**失敗しても呼び出し側は続行すること**（例外を投げない）。
 * 戻り値は「記録できたか」だけ。金額はサーバーが決めるのでここでは持たない。
 */
export const recordUsageEvent = async (
  env: CostMeterEnv,
  args: RecordUsageEventArgs,
): Promise<boolean> => {
  try {
    const t = args.tokens ?? {};
    const res = await fetch(`${env.url}/rest/v1/rpc/ai_record_usage_event`, {
      method: "POST",
      headers: {
        apikey: env.serviceKey,
        Authorization: `Bearer ${env.serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_kind: args.kind,
        p_model: args.model,
        p_source: args.source ?? "reported",
        p_input_tokens: nz(t.inputTokens),
        p_cached_input_tokens: nz(t.cachedInputTokens),
        p_output_tokens: nz(t.outputTokens),
        p_audio_input_tokens: nz(t.audioInputTokens),
        p_audio_output_tokens: nz(t.audioOutputTokens),
        p_realtime_seconds: nz(args.realtimeSeconds),
        p_duration_source: args.durationSource ?? null,
        p_session_id: args.sessionId ?? null,
        p_learner_id: args.learnerId ?? null,
        p_note: args.note ?? null,
        p_rollup: args.rollup === true,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      // 本文は出さない（learner_id 等が混ざりうる）。状態だけ残す
      console.error(`usage event record failed: status=${res.status} kind=${args.kind}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("usage event record error:", e instanceof Error ? e.message : "unknown");
    return false;
  }
};
