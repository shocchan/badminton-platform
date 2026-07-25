// N2 チャンク分割・インデックス・senses・dynamic import の検証（Phase N2-B2）。
import { describe, it, expect } from 'vitest';
import { N2_GRAMMAR_INDEX } from './n2GrammarIndex';
import { learnerVisibleIndex, publiclyVisibleIndex, reviewCandidatesIndex, searchIndex, byUnit12Index, n2IndexStats, loadFullGrammar } from './courseN2Grammar';
import { aiCourseI18n } from '../../../locales/aiCourse';

describe('公開状況の正直表示（誤認防止）', () => {
  for (const loc of ['ja', 'zh'] as const) {
    it(`${loc}: 「完成」「全180公開」と誤認させない・順次追加を明示`, () => {
      const n = aiCourseI18n[loc].n2grammar.ongoingNotice;
      expect(n.length).toBeGreaterThan(0);
      expect(n).not.toContain('完成');
      expect(/全180.*公開|全部.*公开|180項目.*公開済/.test(n)).toBe(false);
    });
    it(`${loc}: 学び方ステップは5段階`, () => {
      expect(aiCourseI18n[loc].n2grammar.steps.length).toBe(5);
    });
  }
});

describe('軽量インデックス（一覧で本文/問題を読み込まない）', () => {
  it('180項目のインデックスがある', () => {
    expect(N2_GRAMMAR_INDEX.length).toBe(180);
  });
  it('インデックスに例文・問題などの重い本文フィールドを含めない', () => {
    for (const g of N2_GRAMMAR_INDEX.slice(0, 20)) {
      expect(Object.keys(g)).not.toContain('examples');
      expect(Object.keys(g)).not.toContain('quizzes');
      expect(Object.keys(g)).not.toContain('conversationExamples');
      expect(Object.keys(g)).not.toContain('meaningZh');
    }
  });
  it('インデックス統計: total180・draft10・approved0', () => {
    const s = n2IndexStats(N2_GRAMMAR_INDEX);
    expect(s.total).toBe(180);
    expect(s.draft).toBe(10);
    expect(s.approved).toBe(0);
  });
  it('人間承認済(approved)は0、レビュー候補(draft+reviewed)は15', () => {
    expect(learnerVisibleIndex(N2_GRAMMAR_INDEX).length).toBe(0);
    expect(reviewCandidatesIndex(N2_GRAMMAR_INDEX).length).toBe(15);
  });
  it('限定ベータ: 180件すべて learner に表示（hidden=0）', () => {
    expect(publiclyVisibleIndex(N2_GRAMMAR_INDEX).length).toBe(180);
    expect(N2_GRAMMAR_INDEX.every((g) => g.publishStatus === 'beta')).toBe(true);
    expect(N2_GRAMMAR_INDEX.filter((g) => g.publishStatus === 'hidden').length).toBe(0);
  });
  it('検索・ユニットフィルターがインデックスで動く', () => {
    expect(searchIndex(N2_GRAMMAR_INDEX, 'あげく').length).toBeGreaterThanOrEqual(1);
    for (let u = 1; u <= 12; u++) expect(byUnit12Index(N2_GRAMMAR_INDEX, u).length).toBeGreaterThan(0);
  });
});

describe('詳細本文の dynamic import（loadFullGrammar）', () => {
  it('本文（例文・中国語・問題）を含む完全itemを返す', async () => {
    const g = await loadFullGrammar('n2g-001');
    expect(g).not.toBeNull();
    expect(g!.examples.length).toBeGreaterThan(0);
    expect((g!.meaningZh || '').length).toBeGreaterThan(0);
    expect((g!.quizzes || []).length).toBeGreaterThanOrEqual(3);
    expect(g!.reviewStatus).toBe('draft');
  });
  it('006「上で」は senses（多義）を3つ持つ', async () => {
    const g = await loadFullGrammar('n2g-006');
    expect((g!.senses || []).length).toBe(3);
    const ids = (g!.senses || []).map((s) => s.senseId);
    expect(ids).toContain('ue-de-aspect');
    expect(ids).toContain('ta-ue-de-order');
    expect(ids).toContain('ue-de-no-noun');
  });
  it('未存在IDは null', async () => {
    expect(await loadFullGrammar('n2g-999')).toBeNull();
  });
});
