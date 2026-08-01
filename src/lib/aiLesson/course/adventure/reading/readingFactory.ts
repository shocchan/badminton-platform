// 読解セットの生成ヘルパー（FINAL COMPLETION §13）。
//
// 既存の n2ReadingSets.ts / n3ReadingSets.ts が各ファイル内に持っていた `s()` を、
// 拡張バッチ用に共有できる形へ切り出したもの。**フィールドの意味・順序は既存と同一**。
//
// 品質規則（advReading.test.ts が全件で機械検査する）:
// - 本文を読まないと解けない／一般常識だけで解けない
// - rationaleSpan は passageJa の部分文字列として**実在**する（改行は無視して照合）
// - 選択肢は4つ・正解はちょうど1つ・本文が重複しない・文字数比が3.2倍以内
// - 誤答3つすべてに whyWrongJa（本文のどこと食い違うか）を書く
// - zh側フィールドに日本語の地の文を入れない（引用は別扱い）
// - 本文にラテン文字の語（3文字以上）を入れない
import type { ReadingSet } from './readingTypes';

/**
 * レベル固定のセット生成関数を返す。
 * `const s = makeReadingSet('N3');` のように使う。
 */
export const makeReadingSet = (sourceLevel: 'N2' | 'N3') => (
  setId: string, readingType: ReadingSet['readingType'],
  passageJa: string, contextZh: string,
  questionJa: string, questionZh: string,
  choices: [string, string, string, string], correctIdx: number,
  whyWrong: [string, string, string],
  rationaleSpan: string, explanationJa: string, explanationZh: string,
  difficulty: 1 | 2 | 3, estimatedSeconds: number,
): ReadingSet => {
  let w = 0;
  return {
    setId, sourceLevel, readingType, passageJa, contextZh, questionJa, questionZh,
    choices: choices.map((t, i) => ({
      choiceId: `choice-${String.fromCharCode(97 + i)}`,
      textJa: t,
      isCorrect: i === correctIdx,
      // 誤答理由は日本語のみ持つ（zh画面へ日本語の地の文を出さないため）
      whyWrongJa: i === correctIdx ? undefined : whyWrong[w++],
      whyWrongZh: undefined,
    })),
    rationaleSpan, explanationJa, explanationZh, difficulty, estimatedSeconds,
    reviewState: 'validated_beta', variantId: setId,
  };
};
