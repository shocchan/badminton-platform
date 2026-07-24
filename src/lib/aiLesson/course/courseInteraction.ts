// 音声レッスンの「割り込み・ターン確定」の誤爆防止（Feature 1）と開始案内（Feature 2）の純ロジック。
// UI・WebRTCから分離。狙い: 咳・雑音・短い息・相づちで翔子先生を止めたり、
// 会話・ミッションを勝手に進めたりしない。ただし「はい/いいえ」等の有効な短答は通す。

/**
 * OpenAI Realtime の turn_detection 設定（client から session.update で適用）。
 * server_vad の threshold を上げ、無音判定を長めにして、短い雑音での即割り込みを防ぐ。
 * - threshold: 高いほど鈍感（小さな物音を拾わない）
 * - prefix_padding_ms: 発話開始前の取り込み
 * - silence_duration_ms: これだけ無音が続いて初めてターン確定（＝短い音で即確定しない）
 */
export const COURSE_TURN_DETECTION = {
  type: 'server_vad',
  threshold: 0.6,
  prefix_padding_ms: 300,
  silence_duration_ms: 800,
  // 生徒が明確に話し始めたら翔子先生の音声は止める（自然な割り込みは許可）。
  // 短い音では threshold により発話開始自体が成立しにくい。
  interrupt_response: true,
  create_response: true,
} as const;

/** 「はい/いいえ」など、短くても有効な回答（短答質問への応答） */
const VALID_SHORT_ANSWER = /^(はい|はーい|ええ|うん|そう(です)?|いいえ|いえ|ううん|ちがいます|だめ|オーケー|ok|yes|no|[0-9０-９一二三四五六七八九十]+)[。.!！？?、,]*$/i;

/** 相づち・フィラー・雑音だけ（意味のある回答ではない） */
const FILLER_OR_NOISE_ONLY = /^[あぁいぃうぅえぇおぉんっーはへふぅえーとえっとまあうーんんー\s、。,.…]+$/;

const hasJapaneseWord = (s: string): boolean => /[ぁ-んァ-ヶー一-龥]/.test(s);

/** 意味のあるユーザーのターンか（短い雑音・咳・相づちを除外） */
export interface TurnJudgeInput {
  transcript: string;
  /** speech_started→stopped の継続ミリ秒（分かる場合。0/未指定なら文字数で判定） */
  durationMs?: number;
  /** 直前の質問が短答（はい/いいえ等）を期待しているか */
  shortAnswerExpected?: boolean;
}

/** 継続時間の下限（これ未満は雑音とみなす。有効短答は例外） */
export const MEANINGFUL_MIN_MS = 700;
/** 文字数の下限（有効短答・数字は例外） */
export const MEANINGFUL_MIN_CHARS = 2;

export const isMeaningfulUserTurn = (input: TurnJudgeInput): boolean => {
  const t = (input.transcript ?? '').trim();
  if (!t) return false;
  // 「はい/いいえ」等は短くても有効（短答期待の有無に関わらず、明確な返答として通す）
  if (VALID_SHORT_ANSWER.test(t)) return true;
  // 相づち・フィラー・雑音だけなら無効
  if (FILLER_OR_NOISE_ONLY.test(t)) return false;
  // 日本語（かな/漢字）を含まない極短の断片（ラテン雑音等）は無効
  if (!hasJapaneseWord(t) && t.length < 3) return false;
  // 文字数が下限未満は無効
  if (t.length < MEANINGFUL_MIN_CHARS) return false;
  // 継続時間が分かる場合、極端に短い（＝咳・物音）ものは無効。
  // ただし短答期待の場面では、文字数が足りていれば時間は問わない。
  if (typeof input.durationMs === 'number' && input.durationMs > 0
    && input.durationMs < MEANINGFUL_MIN_MS && !input.shortAnswerExpected) {
    return false;
  }
  return true;
};

/** レッスン開始案内（Feature 2）。最初の有効発話が来るまで表示する */
export interface GreetingGuideState {
  /** 案内を表示すべきか */
  visible: boolean;
}

/**
 * 開始案内の表示可否。
 * - 接続済みで、まだ有効なユーザー発話が1つも無く、翔子先生も話し始めていないときに表示
 * - 有効発話が来たら消す（咳・雑音では消さない＝isMeaningfulUserTurn で判定した後に反映）
 */
export const shouldShowGreetingGuide = (params: {
  connected: boolean;
  hasMeaningfulUserTurn: boolean;
  ended: boolean;
}): boolean => params.connected && !params.hasMeaningfulUserTurn && !params.ended;

/** 数秒無発話のとき、翔子先生に1回だけ挨拶を促すか（繰り返さない） */
export const shouldNudgeGreeting = (params: {
  connected: boolean;
  hasMeaningfulUserTurn: boolean;
  tutorHasSpoken: boolean;
  secondsSinceConnected: number;
  alreadyNudged: boolean;
}): boolean =>
  params.connected && !params.hasMeaningfulUserTurn && !params.alreadyNudged
  && params.secondsSinceConnected >= 8;
