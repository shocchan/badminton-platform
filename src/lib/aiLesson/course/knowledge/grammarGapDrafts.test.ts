/*
 * ギャップ教材（2026-09-10 Phase 2-2）。
 *
 * 守りたいこと:
 *   ・既存の出題プールに**入っていない**（人が確認するまで学習者に出さない）
 *   ・既存IDと衝突しない・knowledgeId が読める形（級が一致する）
 *   ・27フィールドが N3 ドラフトと同じ形で埋まっている（別構造を作らない）
 *   ・語彙リンクは実在する fi- だけ（dangling を作らない）
 *   ・認識問題は正解が1つだけ・選択肢に重複が無い
 */
import { describe, it, expect } from 'vitest';
import { GRAMMAR_GAP_DRAFTS, grammarGapById } from './grammarGapDrafts';
import { parseKnowledgeId } from './knowledgeId';
import { N3_GRAMMAR_DRAFTS } from '../n3GrammarDrafts';
import { N3_GRAMMAR_DRAFTS_BATCH1 } from '../n3GrammarDrafts';
import { BANK_ITEMS } from '../foundationItemBank';
import { N3_ITEMS } from '../foundationVocabN3';
import { VOCAB_NEW_ITEMS } from '../foundationVocabBank';
import { N2_GRAMMAR_INDEX } from '../n2GrammarIndex';

const foundationIds = new Set([...BANK_ITEMS, ...N3_ITEMS, ...VOCAB_NEW_ITEMS].map((i) => i.id));
const liveIds = new Set([
  ...N3_GRAMMAR_DRAFTS.map((d) => d.grammarId),
  ...N3_GRAMMAR_DRAFTS_BATCH1.map((d) => d.grammarId),
  ...N2_GRAMMAR_INDEX.map((d) => d.grammarId),
]);

describe('ギャップ教材は draft のまま・未公開', () => {
  it('23件ある（265件を265教材にはしていない）', () => {
    expect(GRAMMAR_GAP_DRAFTS.length).toBe(23);
  });

  it('**出題プールに入っていない**（N3_GRAMMAR_DRAFTS / N2 索引に同じIDが無い）', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) expect(liveIds.has(d.grammarId), d.grammarId).toBe(false);
  });

  it('全件 draft・未承認・route=gap-grammar', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) {
      expect(d.reviewStatus).toBe('draft');
      expect(d.approved).toBe(false);
      expect(d.humanReviewed).toBe(false);
      expect(d.route).toBe('gap-grammar');
      expect(d.reviewKey).toBe(d.grammarId);
    }
  });
});

describe('IDと級', () => {
  it('IDが一意', () => {
    const ids = GRAMMAR_GAP_DRAFTS.map((d) => d.grammarId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('knowledgeId が grammar として読め、級がフィールドと一致する', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) {
      const k = parseKnowledgeId(d.grammarId);
      expect(k?.kind, d.grammarId).toBe('grammar');
      expect(k?.level, d.grammarId).toBe(d.level);
    }
  });

  it('grammarGapById で引ける', () => {
    expect(grammarGapById('n3g-nitsurete')?.pattern).toBe('〜につれて');
    expect(grammarGapById('n2g-001')).toBeUndefined();
  });
});

describe('27フィールドの中身', () => {
  const nonEmpty = (s: string) => typeof s === 'string' && s.trim().length > 0;

  it('文字列フィールドが空でない', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) {
      for (const key of ['pattern', 'reading', 'meaningJa', 'explanationZh', 'formation', 'usageScene', 'nuance',
        'furigana', 'commonMistakesZh', 'learnerFocus', 'contrast', 'unit', 'sourceRowId'] as const) {
        expect(nonEmpty(d[key]), `${d.grammarId}.${key}`).toBe(true);
      }
    }
  });

  it('例文は2つ以上・日中が同数', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) {
      expect(d.examplesJa.length, d.grammarId).toBeGreaterThanOrEqual(2);
      expect(d.examplesZh.length, d.grammarId).toBe(d.examplesJa.length);
    }
  });

  it('認識問題：正解が1つ・選択肢4つ・重複なし', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) {
      const { options, answerIndex } = d.recognition;
      expect(options.length, d.grammarId).toBe(4);
      expect(new Set(options).size, d.grammarId).toBe(4);
      expect(answerIndex, d.grammarId).toBeGreaterThanOrEqual(0);
      expect(answerIndex, d.grammarId).toBeLessThan(options.length);
      expect(nonEmpty(d.recognition.distractorReason), d.grammarId).toBe(true);
    }
  });

  it('産出・会話の練習が空でない', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) {
      expect(d.production.expected.length, d.grammarId).toBeGreaterThan(0);
      expect(nonEmpty(d.practice.starterJa), d.grammarId).toBe(true);
      expect(nonEmpty(d.practice.starterZh), d.grammarId).toBe(true);
    }
  });

  it('**語彙リンクは実在する fi- だけ**', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) {
      for (const v of d.vocabularyLinks) expect(foundationIds.has(v), `${d.grammarId} → ${v}`).toBe(true);
    }
  });

  it('関連（similarPatterns）が1つ以上（孤立した項目を作らない）', () => {
    for (const d of GRAMMAR_GAP_DRAFTS) expect(d.similarPatterns.length, d.grammarId).toBeGreaterThan(0);
  });
});
