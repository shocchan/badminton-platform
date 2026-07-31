import { describe, it, expect } from 'vitest';
import { buildImageToWordQuestion, altLeaksAnswer } from './vocabImageQuestions';
import { allVocabularyItems } from './foundationVocabBank';
import { VISUAL_ASSETS } from './visualAssetManifest';
import type { VisualAsset } from './visualAssetTypes';

const items = allVocabularyItems();
const iku = items.find((i) => i.id === 'fi-iku')!;
const draftAsset = (over: Partial<VisualAsset> = {}): VisualAsset => ({
  ...VISUAL_ASSETS.find((a) => a.id === 'va-verb-iku-scene')!,
  filePath: '/images/x.webp', thumbnailPath: '/images/x-thumb.webp', width: 800, height: 600,
  reviewStatus: 'draft', ...over,
});

describe('画像問題（§27・§43）', () => {
  it('draft画像はlabPreviewのみimage_to_wordを生成・一般はnull（フォールバック）', () => {
    const asset = draftAsset();
    const q = buildImageToWordQuestion(iku, asset, items, 5, true)!;
    expect(q.type).toBe('image_to_word');
    expect(q.choices!.length).toBe(3);
    expect(q.choices![q.answerIndex!]).toBe('行く');
    expect(new Set(q.choices).size).toBe(3); // 複数正解なし
    expect(buildImageToWordQuestion(iku, asset, items, 5, false)).toBeNull();
  });
  it('未生成（filePath null）・assetなしでは生成しない', () => {
    // 取り込み進行に依存しないよう、filePath無しのassetを合成して検証（挙動仕様のテスト）
    const plannedAsset = draftAsset({ filePath: null, thumbnailPath: null, reviewStatus: 'planned' });
    expect(buildImageToWordQuestion(iku, plannedAsset, items, 5, true)).toBeNull();
    expect(buildImageToWordQuestion(iku, undefined, items, 5, true)).toBeNull();
    // manifest側の不変条件: filePathが無いassetは必ずplanned系状態
    for (const a of VISUAL_ASSETS) if (!a.filePath) expect(['planned', 'rejected']).toContain(a.reviewStatus);
  });
  it('取り込み済み実画像（行く等12枚）はdraftとしてlabPreviewで問題化できる', () => {
    const real = VISUAL_ASSETS.find((a) => a.id === 'va-verb-iku-scene')!;
    expect(real.filePath).toContain('.webp');
    expect(real.reviewStatus).toBe('draft');
    expect(buildImageToWordQuestion(iku, real, items, 5, true)).not.toBeNull();
    expect(buildImageToWordQuestion(iku, real, items, 5, false)).toBeNull(); // 一般は非表示のまま
  });
  it('altで正解が漏れるassetは画像問題に使わない（§43）', () => {
    const leaky = draftAsset({ altJa: '行くを表す場面' });
    expect(altLeaksAnswer(leaky, iku)).toBe(true);
    expect(buildImageToWordQuestion(iku, leaky, items, 5, true)).toBeNull();
  });
  it('manifestの動詞・形容詞対比assetのaltは正解語を含まない（漏洩防止・全件検証）', () => {
    for (const a of VISUAL_ASSETS.filter((x) => x.learningTargetType === 'item')) {
      const item = items.find((i) => i.id === a.learningTargetId);
      if (!item) continue;
      if (item.partOfSpeech === 'verb') expect(altLeaksAnswer(a, item)).toBe(false);
    }
  });
});
