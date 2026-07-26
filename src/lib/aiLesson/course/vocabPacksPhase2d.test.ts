import { describe, it, expect, beforeEach } from 'vitest';
import { VOCABULARY_PACKS, roleFor, roleCounts, aggregateCognates, currentPackForTrack, nextPackForTrack } from './vocabularyPacks';
import { N3_ITEMS } from './foundationVocabN3';
import { allVocabularyItems } from './foundationVocabBank';
import { levelMetaOf } from './vocabularyLevelMeta';
import { createVocabProgressRepository } from './vocabProgress';
import { pickDiagnosticItems, buildDiagnosticQuestion, applyDiagnosticResult, effectiveRole, diagnosticCountFor, pickQuickReviewItems } from './vocabDiagnostic';

const makeStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
};
const basics = VOCABULARY_PACKS[0];
const n3pack = VOCABULARY_PACKS[1];
const items = allVocabularyItems();
const itemById = new Map(items.map((i) => [i.id, i]));

describe('N3準備パック（§6-§8）', () => {
  it('50〜80語・新規Item・ID重複なし・既存78語と衝突しない・全draft', () => {
    expect(N3_ITEMS.length).toBeGreaterThanOrEqual(50);
    expect(N3_ITEMS.length).toBeLessThanOrEqual(80);
    const ids = N3_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const basicIds = new Set(basics.itemIds);
    ids.forEach((id) => expect(basicIds.has(id)).toBe(false));
    N3_ITEMS.forEach((i) => {
      expect(i.review).toBe('draft');
      expect(i.readingKana.length).toBeGreaterThan(0);
      expect(i.meaningZh.length).toBeGreaterThan(1); // 一文字だけの訳を許さない（§8）
      expect(i.commonFormsJa!.length).toBeGreaterThan(0);
      expect(i.exampleJa && i.exampleZh).toBeTruthy();
      expect(i.sources.length).toBeGreaterThan(0);
    });
  });
  it('品詞バランス: 動詞・形容詞・名詞・副詞/接続/表現を含む', () => {
    const pos = (p: string) => N3_ITEMS.filter((i) => i.partOfSpeech === p).length;
    expect(pos('verb')).toBeGreaterThanOrEqual(20);
    expect(pos('noun')).toBeGreaterThanOrEqual(10);
    expect(pos('iAdj') + pos('naAdj')).toBeGreaterThanOrEqual(8);
    expect(pos('expression')).toBeGreaterThanOrEqual(5);
  });
  it('レベルはN3目安タグ＋根拠つき・公式断定なし・低確信はunreviewed', () => {
    for (const i of N3_ITEMS) {
      const m = levelMetaOf(i.id);
      expect(m.levelTags).toContain('jlpt_n3_estimate');
      expect(m.levelEvidence).toContain('公式断定なし');
    }
    expect(N3_ITEMS.some((i) => levelMetaOf(i.id).cognate === 'unreviewed')).toBe(true);
  });
});

describe('パックrole（§3-§4）', () => {
  it('同一Itemがトラックで異なるroleを持つ（中国: 生活=diagnostic・N3=diagnostic）', () => {
    expect(roleFor('pack-life-basic-1', 'life_basic', 'fi-chugoku')).toBe('diagnostic'); // transparent
    expect(roleFor('pack-life-basic-1', 'life_basic', 'fi-taberu')).toBe('required');
    expect(roleFor('pack-life-basic-1', 'n3_prep', 'fi-eki')).toBe('diagnostic'); // 会話コア以外の基礎語は確認のみ
    expect(roleFor('pack-life-basic-1', 'n3_prep', 'fi-sumu')).toBe('required'); // 会話コアはN3でもrequired候補
    expect(roleFor('pack-n3-prep-1', 'n3_prep', 'fi-joukyou')).toBe('required');
    expect(roleFor('pack-n3-prep-1', 'n2_prep', 'fi-joukyou')).toBe('diagnostic'); // N2はN3語の不足確認から
  });
  it('role別件数は関数から算出（手計算しない）・全roleが有効値', () => {
    for (const track of ['life_basic', 'n3_prep', 'n2_prep', 'conversation'] as const) {
      const rc = roleCounts(basics, track);
      const total = Object.values(rc).reduce((a, b) => a + b, 0);
      expect(total).toBe(basics.itemIds.length);
    }
  });
  it('cognate集計は単一関数から（Item単位・§5の不一致解消）', () => {
    const agg = aggregateCognates(items.filter((i) => basics.itemIds.includes(i.id)));
    const total = Object.values(agg).reduce((a, b) => a + b, 0);
    expect(total).toBe(basics.itemIds.length); // 全78語が必ずいずれかに分類（unreviewed含む）
    expect(agg.unreviewed).toBeGreaterThan(0);  // 未レビューを断定しない
  });
});

describe('診断（§10）', () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); });
  it('診断問題数はパック語数に比例させすぎない（基礎78語→8〜15問）', () => {
    expect(diagnosticCountFor(basics)).toBeGreaterThanOrEqual(8);
    expect(diagnosticCountFor(basics)).toBeLessThanOrEqual(15);
    expect(diagnosticCountFor(n3pack)).toBeGreaterThanOrEqual(8);
  });
  it('正解=confirmed・誤答=remedial・自己申告では変わらない', () => {
    const repo = createVocabProgressRepository(storage);
    const targets = pickDiagnosticItems(basics, 'n2_prep', itemById, repo);
    expect(targets.length).toBeGreaterThan(0);
    const a = targets[0]; const b = targets[1];
    applyDiagnosticResult(repo, basics.id, a.id, true);
    applyDiagnosticResult(repo, basics.id, b.id, false);
    expect(effectiveRole(basics, 'n2_prep', a.id, repo)).toBe('confirmed');
    expect(effectiveRole(basics, 'n2_prep', b.id, repo)).toBe('remedial');
    // 自己評価self_knownにしてもdiagnostic結果は変わらない
    repo.setSelfAssessment(b.id, 'self_known');
    expect(effectiveRole(basics, 'n2_prep', b.id, repo)).toBe('remedial');
    // 診断済みは再度対象にならない
    const again = pickDiagnosticItems(basics, 'n2_prep', itemById, repo).map((i) => i.id);
    expect(again).not.toContain(a.id);
    expect(again).not.toContain(b.id);
  });
  it('診断問題は決定的・意味/読みを交互・正解が選択肢に含まれる', () => {
    const item = itemById.get('fi-chugoku')!;
    const q0 = buildDiagnosticQuestion(item, items, 0);
    const q1 = buildDiagnosticQuestion(item, items, 1);
    expect(q0.dimension).toBe('meaning');
    expect(q1.dimension).toBe('reading');
    expect(q1.choices![q1.answerIndex!]).toBe('ちゅうごく');
    expect(buildDiagnosticQuestion(item, items, 1)).toEqual(q1);
  });
});

describe('N2表示・トラック（§9）', () => {
  it('N2トラックの現在パックは基礎（弱点確認から）・次はN3準備', () => {
    expect(currentPackForTrack('n2_prep').id).toBe('pack-life-basic-1');
    expect(nextPackForTrack('n2_prep')?.id).toBe('pack-n3-prep-1');
    expect(nextPackForTrack('life_basic')).toBeNull(); // 未実装パックを見せない
  });
});

describe('3分復習（§25）', () => {
  it('弱点だけを3〜7問・重複なし', () => {
    const storage = makeStorage();
    const repo = createVocabProgressRepository(storage);
    ['fi-iku', 'fi-sumu', 'fi-taberu', 'fi-kau'].forEach((id) => repo.recordTest(id, 'reading', false, '2026-07-27T09:00:00.000Z'));
    const picked = pickQuickReviewItems(items.map((i) => i.id), repo);
    expect(picked.length).toBeGreaterThanOrEqual(3);
    expect(picked.length).toBeLessThanOrEqual(7);
    expect(new Set(picked).size).toBe(picked.length);
    expect(picked).toContain('fi-iku');
  });
});
