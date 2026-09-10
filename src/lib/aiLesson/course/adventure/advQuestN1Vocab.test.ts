/*
 * N1 目標の語彙バトルの帯（2026-09-10 Phase 3 で判明・修正）。
 *
 * 'vocab-n1' の帯が無く、N1 目標の学習者の語彙バトルが N2 語までしか出なかった。
 * N1 語彙 513 語（batch 41〜49）が一度もバトルに出ない＝「そのレベルに忠実に進める」に反する。
 */
import { describe, it, expect } from 'vitest';
import { VOCAB_BANDS_IN_SCOPE, isVocabTargetInScope, vocabTargetForStage } from './advQuest';
import { vocabPool } from './vocab/vocabQuestions';

describe('N1 の語彙帯', () => {
  it('N1 のスコープに vocab-n1 が入る（N2 以下のスコープには入らない）', () => {
    expect(VOCAB_BANDS_IN_SCOPE.N1).toContain('vocab-n1');
    expect(isVocabTargetInScope('vocab-n1', 'N1')).toBe(true);
    expect(isVocabTargetInScope('vocab-n1', 'N2')).toBe(false);
  });

  it('N1 の上層（n1_grammar）では N1 語と N2 語を日替わりで出す', () => {
    expect(vocabTargetForStage('n1_grammar', 'N1', 20)).toBe('vocab-n1');
    expect(vocabTargetForStage('n1_grammar', 'N1', 21)).toBe('vocab-n2');
    expect(vocabTargetForStage('mock_boss', 'N1', 20)).toBe('vocab-n1');
  });

  it('N2 目標のときは n1_grammar でも N1 語を出さない（級を超えない）', () => {
    // N2 のルートに n1_grammar は無いが、来ても N2 の範囲に丸められること
    expect(VOCAB_BANDS_IN_SCOPE.N2).toContain(vocabTargetForStage('n1_grammar', 'N2', 20));
  });

  // プール生成は約4,900語ぶん問題を作るので時間がかかる（vocabContent.test と同じ扱い）
  it('**プールに vocab-n1 が実在し、問題が作れる**', () => {
    const pool = vocabPool('N1' as never, 20260910);
    const qs = pool.get('vocab-n1') ?? [];
    expect(qs.length).toBeGreaterThan(100);
  }, 120000);
});
