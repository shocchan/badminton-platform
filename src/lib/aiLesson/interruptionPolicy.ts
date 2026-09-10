/**
 * AI会話の割り込み方針（2026-09-10 Phase 7 — adaptive interruption）。
 *
 * 【いまの問題】
 * 2026-08-16 のエコーループ（スピーカーの先生の声がマイクへ回り込み、先生が自分の声に割り込まれ続ける）
 * の対策として、**先生が話している間はマイクを止める半二重**にした。安全だが、
 * 「あ」と言っただけで止まる問題の裏返しで、「ちょっと待って」と言っても先生が止まらず、会話している感じがしない。
 *
 * 【この層の役割】
 * 割り込みの判断を**クライアントの純粋な規則**にする（runtime はこの関数を呼ぶだけ）:
 *   1. 先生の発話中は VAD を厳しくする（threshold↑・onset を長く）。発話が終わったら通常値へ戻す
 *   2. 先生の発話中に検知した音は、**一定時間続いたときだけ**割り込みとみなす（「あ」・咳・呼吸・環境音は無視）
 *   3. 割り込みのあと、生徒の文字起こしが先生の直前の発話と同じ（＝エコー）なら疑いを数え、
 *      短時間に重なったら **そのセッションだけ半二重へ自動で戻す**（全員を戻さない）
 *   4. どの方式で始めるかは 環境（WeChat 内ブラウザ・スピーカー・イヤホン）と段階導入の旗で決める。
 *      **本番の既定は半二重のまま**（CEO 確認まで変えない）。QA アカウント／staging／明示の旗だけ adaptive。
 *
 * 数値は固定の正解ではない。検証で決める前提で、既定値と根拠だけをここに置く。
 */

export type InterruptionMode = 'half_duplex' | 'adaptive';

/** OpenAI Realtime の turn_detection（server_vad）。GA 形式で audio.input.turn_detection に入れる */
export interface ServerVadConfig {
  type: 'server_vad';
  threshold: number;
  prefix_padding_ms: number;
  silence_duration_ms: number;
  create_response: boolean;
  interrupt_response: boolean;
}

export interface AdaptiveVadProfiles {
  /** 先生が話していないとき（生徒の番）。既存の COURSE_TURN_DETECTION に近い値 */
  idle: ServerVadConfig;
  /**
   * 先生が話しているとき。閾値を上げ、発話開始の判定を鈍くする。
   * interrupt_response は false：止めるかどうかは**クライアントの規則**（minSpeechMs）で決めて、
   * 決めたときだけ response.cancel を送る。true だと「あ」で止まる（いまの問題そのもの）
   */
  speaking: ServerVadConfig;
}

export interface InterruptionRuntime {
  mode: InterruptionMode;
  vad: AdaptiveVadProfiles;
  /** 先生の発話中、これだけ続いた音だけを「明確な発話」＝割り込みとみなす */
  minSpeechMs: number;
  /** 割り込み後、残響を拾わないためにマイクを戻すまでの時間（半二重のときだけ使う） */
  micResumeDelayMs: number;
  echoFallback: {
    /** 疑いがこの数に達したら半二重へ */
    maxSuspects: number;
    /** この時間内に数える */
    windowMs: number;
    /** 生徒の文字起こしと先生の直前の発話の重なり（0〜1）がこれ以上ならエコーの疑い */
    similarity: number;
  };
  /** どうしてこの方式になったか（QA・analytics 用。会話本文は含まない） */
  reason: string;
}

export const DEFAULT_ADAPTIVE_VAD: AdaptiveVadProfiles = {
  idle: { type: 'server_vad', threshold: 0.6, prefix_padding_ms: 300, silence_duration_ms: 800, create_response: true, interrupt_response: false },
  speaking: { type: 'server_vad', threshold: 0.85, prefix_padding_ms: 400, silence_duration_ms: 700, create_response: true, interrupt_response: false },
};

export const DEFAULT_INTERRUPTION: Omit<InterruptionRuntime, 'mode' | 'reason'> = {
  vad: DEFAULT_ADAPTIVE_VAD,
  minSpeechMs: 550,
  micResumeDelayMs: 350,
  echoFallback: { maxSuspects: 2, windowMs: 60_000, similarity: 0.6 },
};

/* ────────────────────────────────────────────────────────────
   どの方式で始めるか
   ──────────────────────────────────────────────────────────── */

export interface AudioEnvironment {
  inWeChat: boolean;
  /** イヤホン・ヘッドホンが使われていそうか（デバイス名から。分からなければ null） */
  headphonesLikely: boolean | null;
}

export const detectAudioEnvironment = (
  userAgent: string,
  deviceLabels: readonly string[] = [],
): AudioEnvironment => {
  const inWeChat = /MicroMessenger/i.test(userAgent);
  const labels = deviceLabels.map((l) => l.toLowerCase());
  const headphonesLikely = labels.length === 0
    ? null
    : labels.some((l) => /headphone|headset|earphone|earbud|airpods|bluetooth|イヤホン|ヘッドホン/.test(l));
  return { inWeChat, headphonesLikely };
};

export type RolloutStage = 'production' | 'staging' | 'qa';

export interface ResolveModeInput {
  env: AudioEnvironment;
  /** 段階導入の段階。production では既定を変えない */
  rollout: RolloutStage;
  /** 明示の旗（URL の ?interrupt=adaptive／half_duplex、または設定）。段階より優先 */
  override?: InterruptionMode | null;
}

/**
 * 方式の決め方:
 *   override があればそれ。
 *   production は半二重のまま（CEO 確認まで）。
 *   staging／QA: イヤホンなら adaptive。WeChat 内ブラウザ×スピーカー（エコーキャンセルが効きにくい）は半二重で始め、
 *   それ以外は adaptive（エコーの疑いが重なればセッション内で自動的に半二重へ）。
 */
export const resolveInterruptionMode = (input: ResolveModeInput): { mode: InterruptionMode; reason: string } => {
  if (input.override) return { mode: input.override, reason: `override:${input.override}` };
  if (input.rollout === 'production') return { mode: 'half_duplex', reason: 'production-default' };
  if (input.env.headphonesLikely === true) return { mode: 'adaptive', reason: `${input.rollout}:headphones` };
  // ここに来るのはイヤホンが確認できない環境。WeChat 内ブラウザ×スピーカーはエコーキャンセルが効きにくい
  if (input.env.inWeChat) return { mode: 'half_duplex', reason: `${input.rollout}:wechat-speaker` };
  return { mode: 'adaptive', reason: `${input.rollout}:default` };
};

export const interruptionRuntimeFor = (input: ResolveModeInput, base = DEFAULT_INTERRUPTION): InterruptionRuntime => {
  const { mode, reason } = resolveInterruptionMode(input);
  return { ...base, mode, reason };
};

/** URL の ?interrupt=adaptive|half_duplex を読む（QA 用。他の値は無視） */
export const interruptionOverrideFromSearch = (search: string): InterruptionMode | null => {
  const v = new URLSearchParams(search).get('interrupt');
  return v === 'adaptive' || v === 'half_duplex' ? v : null;
};

/** 環境変数・ホスト名から段階を決める。production 以外を勝手に production 扱いしない */
export const rolloutStageOf = (hostname: string, envStage?: string | null): RolloutStage => {
  if (envStage === 'qa' || envStage === 'staging' || envStage === 'production') return envStage;
  if (/staging|localhost|127\.0\.0\.1|pages\.dev$/.test(hostname)) return 'staging';
  return 'production';
};

/* ────────────────────────────────────────────────────────────
   セッション中の判断（純粋な状態機械）
   ──────────────────────────────────────────────────────────── */

export interface InterruptionState {
  mode: InterruptionMode;
  tutorSpeaking: boolean;
  /** 先生の発話中に音が始まった時刻。null＝始まっていない */
  speechStartedAt: number | null;
  /** 割り込みを実行した時刻（直後の文字起こしをエコー判定に使う） */
  lastInterruptAt: number | null;
  echoSuspectsAt: number[];
  counters: { valid: number; ignored: number; echoSuspects: number; fallback: number };
}

export const initialInterruptionState = (mode: InterruptionMode): InterruptionState => ({
  mode, tutorSpeaking: false, speechStartedAt: null, lastInterruptAt: null, echoSuspectsAt: [],
  counters: { valid: 0, ignored: 0, echoSuspects: 0, fallback: 0 },
});

export type InterruptionDecision =
  | { kind: 'none' }
  | { kind: 'arm'; fireAtMs: number }          // minSpeechMs 後に confirm を呼ぶ
  | { kind: 'ignore' }                         // 短い音だった（false interruption）
  | { kind: 'interrupt' }                      // 明確な発話 → 先生を止める
  | { kind: 'fallback'; to: 'half_duplex' };   // エコーの疑いが重なった → 半二重へ

export const onTutorSpeaking = (s: InterruptionState, speaking: boolean): InterruptionState =>
  ({ ...s, tutorSpeaking: speaking, speechStartedAt: speaking ? s.speechStartedAt : null });

/** 生徒側の音の開始。先生の発話中・adaptive のときだけ武装する */
export const onSpeechStarted = (s: InterruptionState, nowMs: number, cfg: InterruptionRuntime): { state: InterruptionState; decision: InterruptionDecision } => {
  if (s.mode !== 'adaptive' || !s.tutorSpeaking) return { state: s, decision: { kind: 'none' } };
  return { state: { ...s, speechStartedAt: nowMs }, decision: { kind: 'arm', fireAtMs: nowMs + cfg.minSpeechMs } };
};

/** 音の終了。武装中なら「短かった」＝無視 */
export const onSpeechStopped = (s: InterruptionState, nowMs: number, cfg: InterruptionRuntime): { state: InterruptionState; decision: InterruptionDecision } => {
  if (s.speechStartedAt === null) return { state: s, decision: { kind: 'none' } };
  const lasted = nowMs - s.speechStartedAt;
  if (lasted < cfg.minSpeechMs) {
    return { state: { ...s, speechStartedAt: null, counters: { ...s.counters, ignored: s.counters.ignored + 1 } }, decision: { kind: 'ignore' } };
  }
  return { state: { ...s, speechStartedAt: null }, decision: { kind: 'none' } };
};

/** minSpeechMs 経過。まだ音が続いていて先生も話していれば割り込み */
export const confirmInterruption = (s: InterruptionState, nowMs: number): { state: InterruptionState; decision: InterruptionDecision } => {
  if (s.mode !== 'adaptive' || s.speechStartedAt === null || !s.tutorSpeaking) return { state: s, decision: { kind: 'none' } };
  return {
    state: { ...s, speechStartedAt: null, lastInterruptAt: nowMs, counters: { ...s.counters, valid: s.counters.valid + 1 } },
    decision: { kind: 'interrupt' },
  };
};

/** 2つの文の重なり（文字2-gram の Jaccard）。0〜1 */
export const textOverlap = (a: string, b: string): number => {
  const grams = (t: string): Set<string> => {
    const s = t.replace(/[\s、。！？!?「」]/g, '');
    const out = new Set<string>();
    const chars = [...s];
    for (let i = 0; i + 1 < chars.length; i += 1) out.add(chars[i] + chars[i + 1]);
    return out;
  };
  const A = grams(a); const B = grams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter += 1;
  return inter / (A.size + B.size - inter);
};

/**
 * 割り込み直後の生徒の文字起こし。先生の直前の発話と同じならエコーの疑い。
 * 疑いが window 内に maxSuspects 重なったら、このセッションだけ半二重へ。
 */
export const onUserTranscriptAfterInterrupt = (
  s: InterruptionState, transcript: string, lastTutorTranscript: string, nowMs: number, cfg: InterruptionRuntime,
): { state: InterruptionState; decision: InterruptionDecision } => {
  if (s.mode !== 'adaptive' || s.lastInterruptAt === null) return { state: s, decision: { kind: 'none' } };
  // 割り込みから離れすぎた文字起こしは対象外（次の発話）
  if (nowMs - s.lastInterruptAt > 8000) return { state: { ...s, lastInterruptAt: null }, decision: { kind: 'none' } };
  const empty = transcript.replace(/[\s、。！？!?]/g, '').length === 0;
  const echo = empty || textOverlap(transcript, lastTutorTranscript) >= cfg.echoFallback.similarity;
  if (!echo) return { state: { ...s, lastInterruptAt: null }, decision: { kind: 'none' } };
  const suspects = [...s.echoSuspectsAt.filter((t) => nowMs - t <= cfg.echoFallback.windowMs), nowMs];
  const counters = { ...s.counters, echoSuspects: s.counters.echoSuspects + 1 };
  if (suspects.length >= cfg.echoFallback.maxSuspects) {
    return {
      state: { ...s, mode: 'half_duplex', lastInterruptAt: null, speechStartedAt: null, echoSuspectsAt: [], counters: { ...counters, fallback: counters.fallback + 1 } },
      decision: { kind: 'fallback', to: 'half_duplex' },
    };
  }
  return { state: { ...s, lastInterruptAt: null, echoSuspectsAt: suspects, counters }, decision: { kind: 'none' } };
};

/** analytics／QA へ出す要約（会話本文は含まない） */
export interface InterruptionSummary {
  modeStart: InterruptionMode;
  modeEnd: InterruptionMode;
  valid: number;
  ignored: number;
  echoSuspects: number;
  fallback: number;
}
