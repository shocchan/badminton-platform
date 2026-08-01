// 聴解セットの生成ヘルパー（FINAL COMPLETION §14）。
//
// 既存の n2ListeningSets.ts / n3ListeningSets.ts が各ファイル内に持っていた `s()` を、
// 拡張バッチ用に共有できる形へ切り出したもの。**フィールドの意味・順序は既存と同一**。
//
// 品質規則（advListening.test.ts が全件で機械検査する）:
// - transcriptJa は音声の原稿。**解答前には絶対に表示しない**（runtimeが担保）
// - audioAsset は `/audio/ai-course/<setId>.m4a`。manifest に無い set は出題しない
// - 選択肢は4つ・正解はちょうど1つ・誤答3つすべてに whyWrongJa
// - situationZh / questionZh / explanationZh は簡体字中国語のみ（日本語は「」で引用）
// - 話者は 男「」女「」店員「」のように書く（音声化スクリプトが記号を落として読み上げる）
import type { ListeningSet } from './listeningTypes';

/**
 * レベル固定のセット生成関数を返す。
 * `const s = makeListeningSet('N3');` のように使う。
 */
export const makeListeningSet = (sourceLevel: 'N2' | 'N3') => (
  setId: string, listeningType: ListeningSet['listeningType'],
  transcriptJa: string, situationJa: string, situationZh: string,
  questionJa: string, questionZh: string,
  choices: [string, string, string, string], correctIdx: number,
  whyWrong: [string, string, string],
  explanationJa: string, explanationZh: string,
  difficulty: 1 | 2 | 3, playLimit: 1 | 2,
): ListeningSet => {
  let w = 0;
  return {
    setId, sourceLevel, listeningType,
    audioAsset: `/audio/ai-course/${setId}.m4a`,
    transcriptJa, situationJa, situationZh, questionJa, questionZh,
    choices: choices.map((t, i) => ({
      choiceId: `choice-${String.fromCharCode(97 + i)}`,
      textJa: t,
      isCorrect: i === correctIdx,
      whyWrongJa: i === correctIdx ? undefined : whyWrong[w++],
    })),
    explanationJa, explanationZh, difficulty,
    // 実測値は audio-manifest.json 生成時に上書きされる
    durationSeconds: 0, playLimit,
    reviewState: 'validated_beta', sourceId: setId,
  };
};
