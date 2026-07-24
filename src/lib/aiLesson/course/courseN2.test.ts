// N2カバレッジ分類・能力マップの検証（Phase N2-A）。合格率は出さない・架空達成なし。
import { describe, it, expect } from 'vitest';
import { missionN2Level, n2CoverageSummary, buildN2Map, MISSION_N2_LEVEL, N2_AXES } from './courseN2';
import { COURSE_MISSIONS } from './courseData';
import type { ItemProgress } from './types';

const prog = (itemId: string, state: ItemProgress['masteryState']): ItemProgress => ({
  itemId, masteryState: state, masteryScore: 0, firstLearnedAt: '2026-09-01', lastPracticedAt: '2026-09-01',
  nextReviewAt: null, reviewStage: 'none', successfulReviews: 0, failedReviews: 0,
});

describe('N2カバレッジ分類', () => {
  it('全60ミッションに分類がある', () => {
    for (const m of COURSE_MISSIONS) {
      expect(['daily', 'n3', 'n2bridge']).toContain(missionN2Level(m.id));
    }
    expect(Object.keys(MISSION_N2_LEVEL).length).toBe(60);
  });
  it('現行は会話基礎(N4-N5)中心・純粋N2文法は0（正直な監査）', () => {
    const s = n2CoverageSummary();
    expect(s.total).toBe(60);
    expect(s.pureN2Grammar).toBe(0);
    expect(s.daily).toBeGreaterThan(s.n3 + s.n2bridge); // 大半が会話基礎
    expect(s.daily + s.n3 + s.n2bridge).toBe(60);
  });
});

describe('buildN2Map（正直な能力マップ・合格率なし）', () => {
  it('6軸すべてを返す', () => {
    const map = buildN2Map([]);
    expect(map.map((a) => a.axis).sort()).toEqual([...N2_AXES].sort());
  });
  it('文法・語彙・読解・聴解は専用トラック未実装のため準備中（架空達成を出さない）', () => {
    const map = buildN2Map([]);
    for (const axis of ['vocab', 'grammar', 'reading', 'listening'] as const) {
      expect(map.find((a) => a.axis === axis)?.ready).toBe(false);
    }
  });
  it('会話軸はN3以上の表現を自力使用できた数だけ数える', () => {
    const bridge = COURSE_MISSIONS.find((m) => missionN2Level(m.id) !== 'daily')!;
    const daily = COURSE_MISSIONS.find((m) => missionN2Level(m.id) === 'daily')!;
    const map = buildN2Map([
      prog(bridge.id, 'used_independently'),
      prog(daily.id, 'used_independently'), // daily はN2足場に数えない
    ]);
    const conv = map.find((a) => a.axis === 'conversation')!;
    expect(conv.ready).toBe(true);
    expect(conv.value).toBe(1);
  });
  it('合格率・合格可能性のフィールドは存在しない（禁止）', () => {
    const map = buildN2Map([]);
    for (const a of map) {
      expect(Object.keys(a)).not.toContain('passRate');
      expect(Object.keys(a)).not.toContain('passProbability');
    }
  });
});
