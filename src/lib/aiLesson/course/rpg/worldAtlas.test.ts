// World Atlas契約テスト（FOREST FIRST §7・§22）。
// 「準備中エリア」「未接続エリア」「N3単元の孤立/重複」をビルド時に検出する。
import { describe, it, expect } from 'vitest';
import { WORLD_AREAS, areaById, areaForUnit, unitSpecsForArea } from './worldAtlas';
import { N3_UNIT_SPECS } from '../quality/n3UnitSpecs';

describe('World Atlas（ミナモ列島10エリア）', () => {
  it('10エリアがorder 1..10で一意に存在する', () => {
    expect(WORLD_AREAS).toHaveLength(10);
    expect([...new Set(WORLD_AREAS.map(a => a.areaId))]).toHaveLength(10);
    expect(WORLD_AREAS.map(a => a.order).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('全エリアが必須要素（名前・役割・学習テーマ・人物・ミッション・色・landmark・座標）を持つ', () => {
    for (const a of WORLD_AREAS) {
      expect(a.nameJa.length, a.areaId).toBeGreaterThan(0);
      expect(a.nameZh.length, a.areaId).toBeGreaterThan(0);
      expect(a.storyPurposeJa.length, a.areaId).toBeGreaterThan(0);
      expect(a.learningThemeJa.length, a.areaId).toBeGreaterThan(0);
      expect(a.characterJa.length, a.areaId).toBeGreaterThan(0);
      expect(a.practicalMissionJa.length, a.areaId).toBeGreaterThan(0);
      expect(a.visual.base).toMatch(/^#[0-9a-f]{6}$/);
      expect(a.visual.accent).toMatch(/^#[0-9a-f]{6}$/);
      expect(a.pos.x).toBeGreaterThanOrEqual(0);
      expect(a.pos.x).toBeLessThanOrEqual(100);
      expect(a.pos.y).toBeGreaterThanOrEqual(0);
      expect(a.pos.y).toBeLessThanOrEqual(100);
    }
  });

  it('色とlandmarkはエリアごとに違う（テンプレの完全複製を許さない・§7）', () => {
    expect(new Set(WORLD_AREAS.map(a => a.visual.base)).size).toBe(10);
    expect(new Set(WORLD_AREAS.map(a => a.visual.landmark)).size).toBe(10);
  });

  it('「準備中」「coming soon」「作成中」のエリアは存在しない', () => {
    const banned = ['準備中', 'coming soon', 'Coming Soon', '作成中', 'TBD'];
    for (const a of WORLD_AREAS) {
      const text = [a.nameJa, a.storyPurposeJa, a.learningThemeJa, a.practicalMissionJa].join(' ');
      for (const b of banned) expect(text.includes(b), `${a.areaId}: ${b}`).toBe(false);
    }
  });

  it('N3全12単元がちょうど1エリアへ割り当てられる（孤立0・重複0）', () => {
    const assigned = WORLD_AREAS.flatMap(a => a.unitIds);
    expect(assigned.length).toBe(12);
    expect(new Set(assigned).size).toBe(12);
    for (const spec of N3_UNIT_SPECS) {
      expect(areaForUnit(spec.unitId), spec.unitId).toBeDefined();
    }
    // 存在しない単元IDを指していない
    for (const id of assigned) {
      expect(N3_UNIT_SPECS.some(s => s.unitId === id), id).toBe(true);
    }
  });

  it('n3areaエリアは単元を持ち、それ以外は持たない', () => {
    for (const a of WORLD_AREAS) {
      if (a.destination.kind === 'n3area') expect(a.unitIds.length, a.areaId).toBeGreaterThan(0);
      else expect(a.unitIds, a.areaId).toHaveLength(0);
    }
  });

  it('nextAreaId の鎖が全エリアを一度ずつ通り、最後だけnull（行き止まり0・§22）', () => {
    let cur = WORLD_AREAS.find(a => a.order === 1)!;
    const visited = [cur.areaId];
    while (cur.nextAreaId) {
      const next = areaById(cur.nextAreaId);
      expect(next, `${cur.areaId} -> ${cur.nextAreaId}`).toBeDefined();
      visited.push(next!.areaId);
      cur = next!;
      expect(visited.length).toBeLessThanOrEqual(10);
    }
    expect(visited).toHaveLength(10);
    expect(new Set(visited).size).toBe(10);
  });

  it('unitSpecsForAreaはorder順のspecを返す', () => {
    const area7 = areaById('area07-katachi')!;
    const specs = unitSpecsForArea(area7);
    expect(specs.map(s => s.unitId)).toEqual(['n3u-08-change', 'n3u-11-situation', 'n3u-12-adverb']);
  });

  it('Chapter 1 冒険の入口はエリア1のみ', () => {
    expect(WORLD_AREAS.filter(a => a.hasAdventure).map(a => a.areaId)).toEqual(['area01-minato']);
  });
});
