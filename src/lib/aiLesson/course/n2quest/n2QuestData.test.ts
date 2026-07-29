// N2攻略UIが表示する全180項目（完成draft173＋同義判断待ちpre-draft7）の内容保証
// （FOREST FIRST §10: 空field・正解なし・問題不能を許可しない）。
// reviewStatus等の自動昇格が起きていないこともここで固定する。
import { describe, it, expect } from 'vitest';
import { N2_GRAMMAR_DRAFTS } from '../n2GrammarDrafts';
import { N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE } from '../n2GrammarPredraftsAwaitingMerge';

const ALL = [...N2_GRAMMAR_DRAFTS, ...N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE];

describe('N2攻略の表示データ180件', () => {
  it('180件・grammarId重複なし・unit 1〜12', () => {
    expect(ALL).toHaveLength(180);
    expect(new Set(ALL.map(d => d.grammarId)).size).toBe(180);
    for (const d of ALL) {
      expect(d.unit).toBeGreaterThanOrEqual(1);
      expect(d.unit).toBeLessThanOrEqual(12);
    }
  });

  it('learner画面の必須fieldが全件で空でない', () => {
    for (const d of ALL) {
      const id = d.grammarId;
      expect(d.pattern.length, id).toBeGreaterThan(0);
      expect(d.reading.length, id).toBeGreaterThan(0);
      expect(d.meaningJa.length, id).toBeGreaterThan(0);
      expect(d.explanationZh.length, id).toBeGreaterThan(0);
      expect(d.formation.length, id).toBeGreaterThan(0);
      expect(d.usageScene.length, id).toBeGreaterThan(0);
      expect(d.examplesJa.length, id).toBeGreaterThanOrEqual(2);
      expect(d.examplesZh.length, id).toBeGreaterThanOrEqual(2);
      expect(d.furigana.length, id).toBeGreaterThan(0);
      expect(d.commonMistakesZh.length, id).toBeGreaterThan(0);
    }
  });

  it('確認問題: 4択・重複なし・正解が一意に存在する', () => {
    for (const d of ALL) {
      const id = d.grammarId;
      expect(d.recognition.options.length, id).toBe(4);
      expect(new Set(d.recognition.options).size, id).toBe(4);
      expect(d.recognition.answerIndex, id).toBeGreaterThanOrEqual(0);
      expect(d.recognition.answerIndex, id).toBeLessThan(4);
      expect(d.recognition.promptZh.length, id).toBeGreaterThan(0);
      expect(d.recognition.explanationZh.length, id).toBeGreaterThan(0);
    }
  });

  it('使用練習: 目標表現の照合キーが空でない', () => {
    for (const d of ALL) {
      const keys = [...d.production.expected, ...d.production.acceptable, ...(d.matchKeys ?? [])]
        .map(k => k.replace(/^〜/, '')).filter(k => k.length > 0);
      expect(keys.length, d.grammarId).toBeGreaterThan(0);
      expect(d.production.promptJa.length, d.grammarId).toBeGreaterThan(0);
      expect(d.production.promptZh.length, d.grammarId).toBeGreaterThan(0);
    }
  });

  it('自動昇格が起きていない（全件 draft・humanReviewed false・approved false）', () => {
    for (const d of ALL) {
      expect(d.reviewStatus, d.grammarId).toBe('draft');
      expect(d.humanReviewed, d.grammarId).toBe(false);
      expect(d.approved, d.grammarId).toBe(false);
    }
  });

  it('恒等式を壊していない（drafts 173・pre-draft 7）', () => {
    expect(N2_GRAMMAR_DRAFTS).toHaveLength(173);
    expect(N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE).toHaveLength(7);
  });
});
