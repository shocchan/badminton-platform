// 画像問題ビルダー（Phase 2C+ §26-§27）。決定的・タップのみ・LLMなし。
// 画像が表示できない場合は通常の意味問題へフォールバック（回答不能にしない・§44）。
// altに正解語そのものが含まれるassetは画像問題に使わない（読み上げで答えが漏れるため・§43）。
import type { FoundationItem, FoundationQuestion } from './foundationTypes';
import type { VisualAsset } from './visualAssetTypes';
import { isVisibleAsset } from './visualAssetTypes';

/**
 * altが「正解の日本語」を漏らさないか（見出し語・かな読み）。
 * image_to_wordの正解は日本語の語なので、altが場面を中国語/日本語で説明すること自体は
 * 晴眼者が画像から得る情報と同等であり漏洩と扱わない（§43のバランス設計）。
 */
export const altLeaksAnswer = (asset: VisualAsset, item: FoundationItem): boolean =>
  asset.altJa.includes(item.lemma) || asset.altZh.includes(item.lemma) ||
  (item.readingKana.length >= 2 && asset.altJa.includes(item.readingKana));

/**
 * image_to_word: 画像を見て日本語を選ぶ。
 * 誤答は同品詞の他語（意味が重ならないもの）。表示可能な画像が無い/altが漏れる場合はnull。
 */
export const buildImageToWordQuestion = (
  item: FoundationItem, asset: VisualAsset | undefined, pool: FoundationItem[], seed: number, labPreview: boolean,
): FoundationQuestion | null => {
  if (!asset || !isVisibleAsset(asset, labPreview)) return null;
  if (altLeaksAnswer(asset, item)) return null;
  const others: string[] = [];
  const cands = pool.filter((i) => i.id !== item.id && i.partOfSpeech === item.partOfSpeech && i.meaningZh !== item.meaningZh);
  let s = seed;
  while (others.length < 2 && cands.length > 0) {
    s = (s * 37 + 13) % 1009;
    const c = cands[s % cands.length].displayForm;
    if (!others.includes(c) && c !== item.displayForm) others.push(c);
  }
  if (others.length < 2) return null;
  return {
    id: `vq-img-${item.id}`, targetItemId: item.id, dimension: 'meaning', type: 'image_to_word',
    promptJa: 'この画像に合うことばは？', promptZh: '哪个词符合这张图？',
    choices: [item.displayForm, ...others], answerIndex: 0,
    imageAssetId: asset.id,
    explanationJa: `${item.displayForm}（${item.readingKana}）＝${item.meaningZh}`,
    explanationZh: `${item.displayForm}（${item.readingKana}）＝${item.meaningZh}`,
    errorTag: `vocab_image_${item.id}`, review: 'draft',
  };
};
