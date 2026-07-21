// 中国語補助字幕のロジック（純関数・テスト対象）
//
// 方針:
// - 字幕モードは既存の zhSupport と重複させない。zhSupport は「ゆい先生が音声で
//   中国語をどれだけ使うか」（プロンプト側）。subtitleMode は「字幕に中国語訳を出すか」（表示側）。
//   似た設定を並べないよう、subtitleMode の初期値は zhSupport とレベルから導出する。
// - 翻訳対象はゆい先生の発話のみ。生徒自身の発話は常時翻訳しない。
// - 「困ったときだけ」モードでは、原則 日本語のみ。特定条件でのみ補助を出す。

import type { LearnerSettings } from './types';

/** 字幕補助モード */
export type SubtitleMode =
  | 'ja'         // 日本語のみ
  | 'ja_zh'      // 日本語＋中国語補助（常時）
  | 'whenStuck'; // 困ったときだけ中国語

/**
 * 初期の字幕モードを、既存の zhSupport とレベル（difficultyLevel）から決める。
 * - zhSupport が none → 日本語のみ
 * - N3前半以下（difficulty <= 3: N5〜N4 / N4 / N3 / 仮） → 中国語補助あり
 * - N3後半以上（difficulty >= 4: N2 / N1） → 困ったときだけ
 */
export const deriveDefaultSubtitleMode = (
  zhSupport: LearnerSettings['zhSupport'],
  difficultyLevel: number,
): SubtitleMode => {
  if (zhSupport === 'none') return 'ja';
  return difficultyLevel <= 3 ? 'ja_zh' : 'whenStuck';
};

/**
 * 実際に使う字幕モード。
 * - 明示設定（settings.subtitleMode）があればそれを優先
 * - 無ければ、日本語UIは初期OFF（ja）、中国語UIは導出デフォルト
 * - zhSupport が none のときは、UI言語に関わらず日本語のみを強制（矛盾防止）
 */
export const effectiveSubtitleMode = (
  settings: Pick<LearnerSettings, 'zhSupport' | 'subtitleMode'> & { difficultyLevel?: number },
  locale: 'ja' | 'zh',
  difficultyLevel: number,
): SubtitleMode => {
  if (settings.zhSupport === 'none') return 'ja';
  if (settings.subtitleMode) return settings.subtitleMode;
  return locale === 'zh' ? deriveDefaultSubtitleMode(settings.zhSupport, difficultyLevel) : 'ja';
};

/** そのモードで、ゆい先生の発話に中国語を「常時」自動表示するか */
export const autoTranslateAll = (mode: SubtitleMode): boolean => mode === 'ja_zh';

/** そのモードで、中国語訳の機能自体が使えるか（ボタン含む） */
export const zhAssistAvailable = (mode: SubtitleMode): boolean => mode !== 'ja';

// 生徒が「分からない」を示す表現（日本語・中国語）
const CONFUSION_RE = /(分かりません|わかりません|わからない|もう一度|もういちど|什么意思|不明白|听不懂|不懂|再说一次|再说一遍|不太懂)/;

/** ゆい先生の発話に中国語が含まれるか（音声で補助した合図） */
export const tutorUsedChinese = (text: string): boolean =>
  /[一-鿿]/.test(text) && /(你|我们|什么|怎么|没有|可以|意思|就是|因为|所以|一下|这个|那个|试试|一起|明白|听|说)/.test(text);

/** 生徒の直近発話が「分からない」を示すか */
export const studentIsStuck = (studentText: string | null | undefined): boolean =>
  !!studentText && CONFUSION_RE.test(studentText);

/**
 * 「困ったときだけ」モードで、このゆい先生の発話に補助字幕を自動表示すべきか。
 * - ゆい先生が中国語で補助した
 * - 直前に生徒が「分からない」と言った
 * - 同じ質問に2回以上答えられていない（tutorRepeatedQuestion）
 * それ以外は日本語のみ。ボタンで各自展開できる。
 */
export const shouldAutoShowOnStuck = (params: {
  tutorText: string;
  prevStudentText?: string | null;
  tutorRepeatedQuestion?: boolean;
  hintLevelReached?: boolean;
}): boolean =>
  tutorUsedChinese(params.tutorText) ||
  studentIsStuck(params.prevStudentText) ||
  params.tutorRepeatedQuestion === true ||
  params.hintLevelReached === true;

/** 直近のゆい先生の発話が同じ質問の繰り返しか（正規化して比較） */
export const isRepeatedTutorQuestion = (current: string, previousTutorLines: string[]): boolean => {
  const norm = (s: string) => s.replace(/[\s。、,.！-～?？!！]/g, '').trim();
  const c = norm(current);
  if (c.length < 4) return false;
  return previousTutorLines.slice(-4, -1).some((p) => {
    const n = norm(p);
    return n.length >= 4 && (n === c || n.includes(c) || c.includes(n));
  });
};
