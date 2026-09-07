// 日本語の読み上げ（2026-09-07）。ブラウザの音声合成だけを使う＝**原価ゼロ・通信ゼロ**。
//
// なぜ足すか:
//   日本語学習の教材で、文字だけ見せて音が無いのは半分しか渡していない。
//   「今日のことば」は1日1つの短い文なので、聞ける・真似できることの価値が大きい。
//   AIの音声（realtime）は1分$0.135かかるが、こちらは端末の機能なので0円で、
//   中国本土のネットワークからでも動く（api.openai.com に触らない）。
//
// 割り切り:
//   - 端末に日本語の声が無ければ**何も起きない**。それでよい（読み上げは付加であって、
//     これが無いと学べない作りにはしない）。呼び出し側は成否で画面を変えない
//   - 速度は 0.85。学習者向けに一般的な日本語より少しゆっくり（音声レッスンの方針と揃える）
//   - iOS Safari は最初の再生をユーザー操作の中で始める必要がある＝
//     **ボタンのクリックハンドラから直接呼ぶこと**（setTimeout の中から呼ばない）

/** 学習者向けの速さ。音声レッスンの OUTPUT_SPEED（0.8）と近い値にそろえる */
const RATE = 0.85;

const synth = (): SpeechSynthesis | null => {
  if (typeof window === 'undefined') return null;
  const s = window.speechSynthesis;
  return s && typeof s.speak === 'function' ? s : null;
};

/** この端末で日本語の読み上げができるか（ボタンを出すかの判断に使う） */
export const canSpeakJa = (): boolean => {
  const s = synth();
  if (!s) return false;
  try {
    const voices = s.getVoices();
    // 声の一覧は非同期に埋まることがある。空のときは「たぶんできる」に倒す
    // （出して鳴らないほうが、出さずに機会を失うより軽い）
    return voices.length === 0 || voices.some((v) => v.lang?.toLowerCase().startsWith('ja'));
  } catch { return false; }
};

/**
 * 日本語を読み上げる。**必ずユーザー操作の中から呼ぶ**（iOSの制約）。
 * 失敗しても投げない＝画面は読み上げの成否に依存しない。
 */
export const speakJa = (text: string): void => {
  const s = synth();
  if (!s || !text.trim()) return;
  try {
    s.cancel();                                  // 連打で重ならないように
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    u.rate = RATE;
    const ja = s.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ja'));
    if (ja) u.voice = ja;
    s.speak(u);
  } catch { /* 読み上げできない端末では何も起きない */ }
};

/** 画面を離れるときに止める */
export const stopSpeaking = (): void => {
  try { synth()?.cancel(); } catch { /* noop */ }
};
