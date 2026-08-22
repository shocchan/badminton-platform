// N5/N4目標のとき現在地診断（12問）を出さない（CEO決定 2026-08-22）。
//
// スクリーンショットで判明した問題: 目標にN5を選んだ人にも、診断の選択肢として
// 「住・飲・読」のような漢字だけの語が12問出ていた。ひらがなしか読めない人には
// 実力ではなく「読めないこと」しか測れず、入口で心を折る画面になっていた。
//
// このテストが守るのは3つ:
//  1. N5/N4は診断を出さない。N3/N2は今までどおり出す
//  2. 出さなかったときは「未判定」を返す（測ったふりをしない）
//  3. 未判定はかな確認の入口条件（AdvShell）とルート生成の基礎キャンプ条件を満たし続ける
import { describe, it, expect } from 'vitest';
import { skipsDiagnosis, unmeasuredDiagnosis } from './advDiagnosis';
import { generateRoute } from './advRoute';
import type { AdvGoalType, JlptLevel } from './advTypes';

const NOW = '2026-08-22T09:00:00.000Z';

describe('skipsDiagnosis', () => {
  it('JLPT目標のN5・N4では診断を出さない', () => {
    for (const goal of ['jlpt', 'hybrid'] as AdvGoalType[]) {
      expect(skipsDiagnosis(goal, 'N5')).toBe(true);
      expect(skipsDiagnosis(goal, 'N4')).toBe(true);
    }
  });

  it('N3・N2・N1では今までどおり診断を出す', () => {
    for (const lv of ['N3', 'N2', 'N1'] as JlptLevel[]) {
      expect(skipsDiagnosis('jlpt', lv)).toBe(false);
      expect(skipsDiagnosis('hybrid', lv)).toBe(false);
    }
  });

  it('会話目標は目標レベルを使わないので対象外', () => {
    expect(skipsDiagnosis('conversation', 'N5')).toBe(false);
    expect(skipsDiagnosis('conversation', null)).toBe(false);
  });

  it('目標未選択では診断を出す（黙って飛ばさない）', () => {
    expect(skipsDiagnosis('jlpt', null)).toBe(false);
  });
});

describe('unmeasuredDiagnosis', () => {
  it('測っていないものを測ったことにしない', () => {
    const { result, skills } = unmeasuredDiagnosis({ targetJlpt: 'N5', goalType: 'jlpt', nowISO: NOW });
    expect(result.knowledgeBand).toBe('needs_assessment');
    expect(result.conversationBand).toBe('needs_assessment');
    expect(result.conversationSampled).toBe(false);
    expect(result.askedQuestionKeys).toEqual([]);
    // 解いていない問題を「間違えた」ことにしない
    expect(result.vocabularyGapIds).toEqual([]);
    expect(result.grammarGapIds).toEqual([]);
    expect(skills.vocabulary.evidenceCount).toBe(0);
    expect(skills.grammar.evidenceCount).toBe(0);
  });

  it('中国語補助は最大（基礎帯として扱う）', () => {
    const { result } = unmeasuredDiagnosis({ targetJlpt: 'N4', goalType: 'jlpt', nowISO: NOW });
    expect(result.supportNeed).toBe('often');
  });

  it('かな確認の入口条件を満たす（AdvShellはこの2値でかなを出す）', () => {
    const { result } = unmeasuredDiagnosis({ targetJlpt: 'N5', goalType: 'jlpt', nowISO: NOW });
    expect(['needs_assessment', 'pre_n5']).toContain(result.knowledgeBand);
  });

  it('基礎から始まるルートになり、目的地は選んだ目標のまま', () => {
    for (const target of ['N5', 'N4'] as JlptLevel[]) {
      const { result } = unmeasuredDiagnosis({ targetJlpt: target, goalType: 'jlpt', nowISO: NOW });
      const route = generateRoute({
        goalType: 'jlpt', targetJlpt: target,
        knowledgeBand: result.knowledgeBand, conversationBand: result.conversationBand,
        diagnosis: result, nowISO: NOW,
      });
      expect(route.stages.length).toBeGreaterThan(0);
      expect(route.stages[0].kind).toBe('foundation_camp');
      expect(route.destinationJlpt).toBe(target);
    }
  });
});
