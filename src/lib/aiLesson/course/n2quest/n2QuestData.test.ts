// N2攻略UIが表示する全178項目（CEO統合判断 2026-07-30: canonical 178＋alias 2＝原本180）の内容保証
// （FOREST FIRST §10: 空field・正解なし・問題不能を許可しない）。
// reviewStatus等の自動昇格が起きていないこともここで固定する。
import { describe, it, expect } from 'vitest';
import { N2_GRAMMAR_DRAFTS } from '../n2GrammarDrafts';
import { N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE } from '../n2GrammarPredraftsAwaitingMerge';

const ALL = [...N2_GRAMMAR_DRAFTS, ...N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE];

describe('N2攻略の表示データ178件', () => {
  it('178件・grammarId重複なし・unit 1〜12', () => {
    expect(ALL).toHaveLength(178);
    expect(new Set(ALL.map(d => d.grammarId)).size).toBe(178);
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

  it('恒等式を壊していない（canonical 178・pre-draft 0）', () => {
    expect(N2_GRAMMAR_DRAFTS).toHaveLength(178);
    expect(N2_GRAMMAR_PREDRAFTS_AWAITING_MERGE).toHaveLength(0);
  });
});

describe('統合alias（N2 progress compatibility・2026-07-30）', () => {
  const mem = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, raw: m };
  };
  it('統合前ID（n2g-024）の保存済み進捗が統合先（n2g-023）の読み取りへ引き継がれる', async () => {
    const { readItemProgress } = await import('./n2QuestProgress');
    const { N2_QUEST_KEY_PREFIX } = await import('./n2QuestProgress');
    const st = mem();
    st.setItem(N2_QUEST_KEY_PREFIX + 'n2g-024', JSON.stringify({ recognizedAtMs: 1000, producedAtMs: 2000 }));
    const p = readItemProgress(st, 'n2g-023');
    expect(p.recognizedAtMs).toBe(1000);
    expect(p.producedAtMs).toBe(2000);
    // 旧IDで読んでも同じ（canonical正規化）
    const pOld = readItemProgress(st, 'n2g-024');
    expect(pOld.recognizedAtMs).toBe(1000);
  });
  it('書き込みは常にcanonical IDへ（旧IDでmarkしてもn2g-102キーに保存）', async () => {
    const { markProduced, N2_QUEST_KEY_PREFIX } = await import('./n2QuestProgress');
    const st = mem();
    markProduced(st, 'n2g-104', 5000);
    expect(st.raw.has(N2_QUEST_KEY_PREFIX + 'n2g-102')).toBe(true);
    expect(st.raw.has(N2_QUEST_KEY_PREFIX + 'n2g-104')).toBe(false);
  });
  it('canonical本体とalias元の両方に記録がある場合は早い時刻を採用', async () => {
    const { readItemProgress, N2_QUEST_KEY_PREFIX } = await import('./n2QuestProgress');
    const st = mem();
    st.setItem(N2_QUEST_KEY_PREFIX + 'n2g-104', JSON.stringify({ recognizedAtMs: 1000, producedAtMs: null }));
    st.setItem(N2_QUEST_KEY_PREFIX + 'n2g-102', JSON.stringify({ recognizedAtMs: 3000, producedAtMs: 4000 }));
    const p = readItemProgress(st, 'n2g-102');
    expect(p.recognizedAtMs).toBe(1000);
    expect(p.producedAtMs).toBe(4000);
  });
});
