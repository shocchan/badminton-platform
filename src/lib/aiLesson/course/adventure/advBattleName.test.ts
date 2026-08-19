// バトル名のレベル表記テスト（2026-08-19 CEO報告: N5目標なのに「N2文法バトル」）。
// 名前は学習者の目標ではなく**いま戦っている中身**を言う。
import { describe, it, expect } from 'vitest';
import { scopeLevelOfTargets, battleScopeName } from './advExamSkills';
import { loadGrammarPools } from './advContent';
import { buildEncounter, encounterName } from './advBattle';

describe('バトル名は中身のレベルを言う', () => {
  it('targetIdからレベルを実測できる', () => {
    expect(scopeLevelOfTargets(['n5g-shuujoshi-ne'], 'N2')).toBe('N5');
    expect(scopeLevelOfTargets(['n4g-unit-3'], 'N2')).toBe('N4');
    expect(scopeLevelOfTargets(['n3g-unit-1'], 'N2')).toBe('N3');
    expect(scopeLevelOfTargets(['n2g-unit-5'], 'N3')).toBe('N2');
    expect(scopeLevelOfTargets(['vocab-n5'], 'N2')).toBe('N5');
    expect(scopeLevelOfTargets(['kanji-n4'], 'N2')).toBe('N4');
    // 判定できないIDはフォールバック
    expect(scopeLevelOfTargets(['fi-namae'], 'N4')).toBe('N4');
  });

  it('基礎キャンプの実バトルが「N5文法バトル」と名乗る（N2目標のフォールバックでも）', async () => {
    const pools = await loadGrammarPools();
    const enc = buildEncounter({
      tier: 'normal', targetIds: ['n5g-unit-1'], pool: pools.byItem,
      seenKeys: new Set(), recentWrongKeys: new Set(), seed: 1, attemptSeed: 1,
    });
    // 旧実装はフォールバック(N2)がそのまま出て「N2文法バトル」になっていた
    expect(encounterName(enc, 'N2', 'ja')).toContain('N5');
    expect(encounterName(enc, 'N2', 'ja')).not.toContain('N2');
    expect(encounterName(enc, 'N2', 'zh')).toContain('N5');
  });

  it('N2文法の実バトルは従来どおり「N2文法バトル」', async () => {
    const pools = await loadGrammarPools();
    const enc = buildEncounter({
      tier: 'normal', targetIds: ['n2g-unit-1'], pool: pools.byItem,
      seenKeys: new Set(), recentWrongKeys: new Set(), seed: 1, attemptSeed: 1,
    });
    expect(encounterName(enc, 'N2', 'ja')).toContain('N2');
  });

  it('battleScopeNameがN5/N4の表記を受け付ける', () => {
    expect(battleScopeName(['grammar'], 'N5', 'ja')).toBe('N5文法バトル');
    expect(battleScopeName(['charactersVocabulary'], 'N4', 'zh')).toBe('N4文字・词汇战斗');
  });
});
