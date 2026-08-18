// N5/N4目標の章名テスト（2026-08-19）。
// stage kind の流用により、N4目標の生徒に「第2章 N3を渡る」「N3の語彙・文法」と
// 目標に無いレベル名が出ていた。stageId上書きで目標に合う章名になることを固定する。
import { describe, it, expect } from 'vitest';
import { generateRoute } from './advRoute';
import { buildAdventureMap } from './advMapModel';
import { defaultAdvProfile } from './advProfile';

const NOW = '2026-08-19T09:00:00.000Z';
const mapFor = (target: 'N5' | 'N4') => {
  const route = generateRoute({
    goalType: 'jlpt', targetJlpt: target, knowledgeBand: 'pre_n5',
    conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
  });
  const profile = { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt' as const, targetJlpt: target, route };
  return buildAdventureMap(profile, route, new Set(), 1, 'exam', NOW);
};

describe('N5/N4目標の章名に目標外のレベル名が出ない', () => {
  for (const target of ['N5', 'N4'] as const) {
    it(`${target}目標: 章名・鍛える力に N3/N2 が出ない`, () => {
      const map = mapFor(target);
      const exam = map.regions.filter((r) => r.layer === 'exam');
      expect(exam.length).toBeGreaterThan(1);
      for (const r of exam) {
        expect(`${r.chapterJa}${r.chapterZh}`, `${r.id} の章名`).not.toMatch(/N3|N2/);
        expect(`${r.abilityJa}${r.abilityZh}`, `${r.id} の鍛える力`).not.toMatch(/N3|N2/);
      }
    });
  }
  it('N3/N2目標の章名は従来どおり', () => {
    const route = generateRoute({
      goalType: 'jlpt', targetJlpt: 'N2', knowledgeBand: 'n3_late',
      conversationBand: 'needs_assessment', diagnosis: null, nowISO: NOW,
    });
    const profile = { ...defaultAdvProfile(NOW), enabled: true, goalType: 'jlpt' as const, targetJlpt: 'N2' as const, route };
    const map = buildAdventureMap(profile, route, new Set(), 1, 'exam', NOW);
    expect(map.regions.some((r) => r.chapterJa.includes('N2へ挑む'))).toBe(true);
  });
});
