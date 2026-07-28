// Phase 3P-3: 会話contextual接続のガード。
// 目標「未達127→0」を、テンプレート量産の偽装なしで達成していることを固定する。
import { describe, it, expect } from 'vitest';
import { ALL_CONVERSATION_PRACTICES, VOCAB_CONVERSATION_PRACTICES } from './vocabConversationPractice';
import { allVocabularyItems } from './foundationVocabBank';
import { N3_ITEMS } from './foundationVocabN3';

const items = [...allVocabularyItems(), ...N3_ITEMS];
const ids = [...new Set(items.map(i => i.id))];

describe('会話contextual接続（3P-3）', () => {
  it('全140語がitemId固有の練習を持つ（未達0）', () => {
    expect(ids.length).toBe(140);
    const covered = new Set(ALL_CONVERSATION_PRACTICES.map(p => p.itemId));
    const missing = ids.filter(id => !covered.has(id));
    expect(missing).toEqual([]);
  });
  it('itemIdの重複なし・実在しないitemIdへの参照なし', () => {
    const pIds = ALL_CONVERSATION_PRACTICES.map(p => p.itemId);
    expect(new Set(pIds).size).toBe(pIds.length);
    const idSet = new Set(ids);
    expect(pIds.filter(id => !idSet.has(id))).toEqual([]);
  });
  it('テンプレート量産の偽装防止: starter質問・themeは全語で固有', () => {
    const starters = ALL_CONVERSATION_PRACTICES.map(p => p.starterQuestionJa);
    expect(new Set(starters).size).toBe(starters.length);
    const themes = ALL_CONVERSATION_PRACTICES.map(p => p.themeJa);
    expect(new Set(themes).size).toBe(themes.length);
  });
  it('必須field完備: 中文サポート・対象表現・followUpが全件にある', () => {
    for (const p of ALL_CONVERSATION_PRACTICES) {
      expect(p.targetExpressions.length).toBeGreaterThan(0);
      expect(p.supportExpressionsJa.length).toBeGreaterThanOrEqual(3);
      expect(p.supportExpressionsJa.length).toBe(p.supportExpressionsZh.length);
      expect(p.starterQuestionZh.length).toBeGreaterThan(0);
      expect(p.followUpQuestionJa.length).toBeGreaterThan(0);
      expect(p.followUpQuestionZh.length).toBeGreaterThan(0);
      expect(p.reviewStatus).toBe('draft');
    }
  });
  it('既存13語は変更していない（fi-sumuのthemeが従来値のまま）', () => {
    expect(VOCAB_CONVERSATION_PRACTICES.length).toBe(13);
    expect(VOCAB_CONVERSATION_PRACTICES[0].itemId).toBe('fi-sumu');
    expect(VOCAB_CONVERSATION_PRACTICES[0].themeJa).toBe('今住んでいる場所について話す');
  });
});
