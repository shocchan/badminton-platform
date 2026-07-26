import { describe, it, expect, beforeEach } from 'vitest';
import { createVocabProgressRepository, pickDailyWords, VOCAB_STORAGE_KEY } from './vocabProgress';
import { VOCAB_NEW_ITEMS, allVocabularyItems, vocabByCategory } from './foundationVocabBank';
import { VISUAL_ASSETS, assetForItem } from './visualAssetManifest';
import { isVisibleAsset } from './visualAssetTypes';
import { BANK_ITEMS } from './foundationItemBank';
import { UNIT1_ITEMS } from './foundationUnit1';

const makeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, _map: m };
};

describe('語彙バンク整合（§23・§50-52）', () => {
  it('ID重複なし・既存Itemと衝突しない・全draft', () => {
    const newIds = VOCAB_NEW_ITEMS.map((i) => i.id);
    expect(new Set(newIds).size).toBe(newIds.length);
    const existing = new Set([...BANK_ITEMS, ...UNIT1_ITEMS].map((i) => i.id));
    newIds.forEach((id) => expect(existing.has(id)).toBe(false));
    VOCAB_NEW_ITEMS.forEach((i) => { expect(i.review).toBe('draft'); expect(i.meaningZh.length).toBeGreaterThan(0); expect(i.readingKana.length).toBeGreaterThan(0); });
  });
  it('全体で70〜100語・同一Itemの再利用（行く/住む等は新規登録されない）', () => {
    const all = allVocabularyItems();
    expect(all.length).toBeGreaterThanOrEqual(70);
    expect(all.length).toBeLessThanOrEqual(100);
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    expect(VOCAB_NEW_ITEMS.some((i) => i.lemma === '行く' || i.lemma === '住む')).toBe(false);
  });
  it('多義語sense分離: 高い（值段/高さ）・聞く（听/问）', () => {
    const takai = VOCAB_NEW_ITEMS.find((i) => i.id === 'fi-takai')!;
    expect(takai.senses?.length).toBe(2);
    const kiku = allVocabularyItems().find((i) => i.id === 'fi-kiku')!;
    expect(kiku.senses?.length).toBe(2);
  });
  it('反対語ペアが相互参照・sourceRefs整合（external_scopeはセル参照なし）', () => {
    const byId = Object.fromEntries(VOCAB_NEW_ITEMS.map((i) => [i.id, i]));
    for (const it of VOCAB_NEW_ITEMS) {
      if (it.antonymId) expect(byId[it.antonymId]?.antonymId).toBe(it.id);
      for (const s of it.sources) {
        expect(s.sourceLabel.length).toBeGreaterThan(0);
        if (s.sourceMatchType === 'external_scope') expect(s.cellRange ?? null).toBeNull();
        else expect(s.cellRange).toBeTruthy();
      }
      expect(it.id).toMatch(/^fi-[a-z0-9-]+$/);
    }
  });
  it('カテゴリ分類: 動詞27・い形16・な形7・場面別が引ける', () => {
    const all = allVocabularyItems();
    expect(vocabByCategory(all, 'verbs').length).toBe(27);
    expect(vocabByCategory(all, 'iAdj').length).toBe(16);
    expect(vocabByCategory(all, 'naAdj').length).toBe(7);
    expect(vocabByCategory(all, 'scenes').length).toBeGreaterThanOrEqual(10);
  });
});

describe('VisualAssetManifest（§15-§16・§29）', () => {
  it('asset ID重複なし・全plannedにプロンプト/alt ja/zh/copyrightStatusあり', () => {
    const ids = VISUAL_ASSETS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    VISUAL_ASSETS.forEach((a) => {
      expect(a.altJa.length).toBeGreaterThan(0);
      expect(a.altZh.length).toBeGreaterThan(0);
      expect(a.copyrightStatus).toBeTruthy();
      if (a.sourceKind === 'ai_generated') expect(a.generationPrompt!.length).toBeGreaterThan(20);
    });
  });
  it('ファイル未生成（planned・filePath null）は一般にもlabPreviewにも表示しない', () => {
    const plannedAsset = VISUAL_ASSETS.find((a) => a.reviewStatus === 'planned')!;
    expect(isVisibleAsset(plannedAsset, false)).toBe(false);
    expect(isVisibleAsset(plannedAsset, true)).toBe(false);
  });
  it('draft画像はlabPreviewのみ表示可・approvedは一般表示可', () => {
    const fake = { ...VISUAL_ASSETS[0], filePath: '/x.webp', reviewStatus: 'draft' as const };
    expect(isVisibleAsset(fake, false)).toBe(false);
    expect(isVisibleAsset(fake, true)).toBe(true);
    expect(isVisibleAsset({ ...fake, reviewStatus: 'approved' }, false)).toBe(true);
  });
  it('item→asset解決（imageAssetIdの参照先が実在）', () => {
    for (const it of VOCAB_NEW_ITEMS) {
      if (it.imageAssetId) expect(VISUAL_ASSETS.some((a) => a.id === it.imageAssetId)).toBe(true);
    }
    expect(assetForItem('fi-iku')?.id).toBe('va-verb-iku-scene');
  });
});

describe('語彙進捗Repository（§20-§22）', () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); });

  it('encounter→seen・自己評価変更可能・不正JSONは安全破棄', () => {
    const repo = createVocabProgressRepository(storage);
    repo.recordEncounter('fi-iku', { imageViewed: true }, '2026-07-27T09:00:00.000Z');
    expect(repo.getEntry('fi-iku')).toMatchObject({ selfAssessment: 'seen', imageViewed: true, encounterCount: 1 });
    repo.setSelfAssessment('fi-iku', 'self_known');
    expect(repo.getEntry('fi-iku').selfAssessment).toBe('self_known');
    repo.setSelfAssessment('fi-iku', 'needs_review');
    expect(repo.getEntry('fi-iku').selfAssessment).toBe('needs_review');
    storage.setItem(VOCAB_STORAGE_KEY, '{bad');
    expect(createVocabProgressRepository(storage).getEntry('fi-iku').selfAssessment).toBe('unseen');
  });

  it('【絶対条件】self_knownにしてもverifiedStateはretainedにならない', () => {
    const repo = createVocabProgressRepository(storage);
    repo.setSelfAssessment('fi-iku', 'self_known');
    expect(repo.getVerifiedState('fi-iku')).toBe('not_tested');
    const stats = repo.getStats();
    expect(stats.selfKnownCount).toBe(1);
    expect(stats.verifiedCount).toBe(0);
    expect(stats.retainedCandidateCount).toBe(0);
  });

  it('検証状態は問題履歴のみから導出: 自力正解=independent・別日再確認=retained_candidate', () => {
    const repo = createVocabProgressRepository(storage);
    repo.recordTest('fi-iku', 'meaning', true, '2026-07-20T09:00:00.000Z');
    expect(repo.getVerifiedState('fi-iku')).toBe('independent');
    repo.recordTest('fi-iku', 'meaning', true, '2026-07-27T09:00:00.000Z');
    expect(repo.getVerifiedState('fi-iku')).toBe('retained_candidate');
  });

  it('本人が覚えたにしても誤答の弱点は残る（needs_reviewでなくても復習候補）', () => {
    const repo = createVocabProgressRepository(storage);
    repo.setSelfAssessment('fi-iku', 'self_known');
    repo.recordTest('fi-iku', 'reading', false, '2026-07-27T09:00:00.000Z');
    expect(repo.getReviewItemIds()).toContain('fi-iku');
    expect(repo.getEntry('fi-iku').selfAssessment).toBe('self_known'); // 自己評価は上書きしない
  });

  it('リセットは語彙専用キーのみ・他キー非接触', () => {
    storage.setItem('ai_course_foundation_preview_v1', 'keep');
    const repo = createVocabProgressRepository(storage);
    repo.recordEncounter('fi-iku');
    repo.reset();
    expect(storage._map.has(VOCAB_STORAGE_KEY)).toBe(false);
    expect(storage.getItem('ai_course_foundation_preview_v1')).toBe('keep');
  });
});

describe('今日の3語（§25）', () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); });
  const allIds = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6'];

  it('3語・重複なし・未着手はCore A順・理由は決定的', () => {
    const repo = createVocabProgressRepository(storage);
    const r = pickDailyWords(allIds, repo, [], '2026-07-27');
    expect(r.itemIds).toEqual(['w1', 'w2', 'w3']);
    expect(r.reasons['w1']).toBe('core_a');
  });
  it('復習候補が最優先・現在単元の新語が未着手より優先', () => {
    const repo = createVocabProgressRepository(storage);
    repo.recordTest('w5', 'meaning', false, '2026-07-26T09:00:00.000Z');
    const r = pickDailyWords(allIds, repo, ['w4'], '2026-07-27');
    expect(r.itemIds[0]).toBe('w5');
    expect(r.reasons['w5']).toBe('review');
    expect(r.itemIds).toContain('w4');
    expect(r.reasons['w4']).toBe('current_unit');
  });
  it('同日は固定・日付が変わると再選定', () => {
    const repo = createVocabProgressRepository(storage);
    const day1 = pickDailyWords(allIds, repo, [], '2026-07-27');
    repo.recordEncounter('w1'); repo.setSelfAssessment('w1', 'self_known');
    const day1again = pickDailyWords(allIds, repo, [], '2026-07-27');
    expect(day1again.itemIds).toEqual(day1.itemIds); // 同日固定
    const day2 = pickDailyWords(allIds, repo, [], '2026-07-28');
    expect(day2.itemIds).not.toEqual(day1.itemIds); // w1は学習済みになり得る
  });
});
