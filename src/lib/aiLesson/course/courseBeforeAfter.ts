// Before / After 比較（§17）。実際の生徒発話だけを使い、捏造しない。
// 低信頼な文字起こし・断片・中国語のみの発話は除外し、日本語の発話の伸びを見せる。

export interface SpeechSample {
  transcript: string;
  dateISO: string;      // セッション開始日（YYYY-MM-DD 以上）
  sessionId: string;
  sessionIndex?: number; // 何回目のレッスンか（1始まり。分かれば）
  usedIndependently?: boolean;
}

export interface BeforeAfter {
  before: SpeechSample;
  after: SpeechSample;
}

// 日本語（かな）を含み、意味のある長さの発話だけを Before/After に使う
const hasKana = (s: string): boolean => /[ぁ-んァ-ヶ]/.test(s);
const MIN_CHARS = 6;

const isUsable = (s: SpeechSample): boolean => {
  const t = s.transcript.trim();
  return t.length >= MIN_CHARS && hasKana(t);
};

/** そのグループで一番「代表的」な発話（長め・自力使用を優先） */
const pickRepresentative = (samples: SpeechSample[]): SpeechSample | null => {
  if (!samples.length) return null;
  return [...samples].sort((a, b) => {
    if (!!a.usedIndependently !== !!b.usedIndependently) return a.usedIndependently ? -1 : 1;
    return b.transcript.trim().length - a.transcript.trim().length;
  })[0];
};

/**
 * 時系列の生徒発話（古い→新しい）から Before/After を作る。
 * - 使える発話が別々の日付/セッションで2つ以上ないと null（データ不足時は表示しない）
 * - Before は前半、After は後半から代表を選ぶ
 */
export const buildBeforeAfter = (samplesOldToNew: SpeechSample[]): BeforeAfter | null => {
  const usable = samplesOldToNew.filter(isUsable);
  if (usable.length < 2) return null;

  const half = Math.floor(usable.length / 2);
  const earlyGroup = usable.slice(0, Math.max(half, 1));
  const lateGroup = usable.slice(Math.max(half, 1));

  const before = pickRepresentative(earlyGroup);
  const after = pickRepresentative(lateGroup.length ? lateGroup : usable.slice(-1));
  if (!before || !after) return null;
  // Before と After が同一セッションなら比較にならない
  if (before.sessionId === after.sessionId) return null;
  return { before, after };
};

/** 代表的な1発話（スナップショット保存用）。最新の使える発話を返す */
export const latestRepresentative = (samplesOldToNew: SpeechSample[]): string | null => {
  const usable = samplesOldToNew.filter(isUsable);
  const last = pickRepresentative(usable.slice(Math.floor(usable.length / 2)));
  return last?.transcript ?? null;
};
