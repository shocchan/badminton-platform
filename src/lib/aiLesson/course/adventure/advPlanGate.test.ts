// プランによる地域ゲートのテスト。
// いちばん守りたいのは **「体験パスは試験レイヤー4地域目からlocked」** と
// **「会話レイヤー・攻略済みは奪わない」**。
import { describe, it, expect } from 'vitest';
import { gateAdventureMapForPlan } from './advPlanGate';
import type { AdventureMap, MapRegion, RegionState } from './advMapModel';

const region = (id: string, layer: 'exam' | 'conversation', state: RegionState): MapRegion => ({
  id, layer,
  chapterJa: '章', chapterZh: '章',
  nameJa: `地域${id}`, nameZh: `区域${id}`,
  abilityJa: '力', abilityZh: '力',
  blurbJa: '', blurbZh: '',
  landmark: 'camp', tone: 'dawn',
  state, masteryPct: state === 'locked' ? null : 10,
  doneJa: '', doneZh: '', nextJa: '', nextZh: '',
  unlockJa: '', unlockZh: '',
  action: { kind: 'today', labelJa: 'a', labelZh: 'b', reasonJa: 'c', reasonZh: 'd' },
  estMinutes: 5,
});

const mapOf = (regions: MapRegion[], current: string | null, next: string | null): AdventureMap => ({
  routeKind: 'combined', regions,
  currentRegionId: current, nextRegionId: next,
  destinationJa: '塔', destinationZh: '塔',
  mergeIndex: null,
  doneCount: regions.filter((r) => r.state === 'done').length,
  totalCount: regions.length,
});

describe('gateAdventureMapForPlan', () => {
  const base = mapOf([
    region('e1', 'exam', 'done'),
    region('e2', 'exam', 'current'),
    region('e3', 'exam', 'next'),
    region('e4', 'exam', 'locked'),
    region('e5', 'exam', 'locked'),
    region('c1', 'conversation', 'current'),
    region('c2', 'conversation', 'locked'),
  ], 'e2', 'e3');

  it('limit=null はそのまま（1か月・6か月コース）', () => {
    expect(gateAdventureMapForPlan(base, null)).toBe(base);
  });

  it('**体験パス(3): 試験レイヤー4地域目以降が locked＋上位プラン案内**', () => {
    const gated = gateAdventureMapForPlan(base, 3);
    const byId = Object.fromEntries(gated.regions.map((r) => [r.id, r]));
    expect(byId.e1.state).toBe('done');
    expect(byId.e2.state).toBe('current');
    expect(byId.e3.state).toBe('next');
    expect(byId.e4.state).toBe('locked');
    expect(byId.e5.state).toBe('locked');
    expect(byId.e4.unlockJa).toContain('1か月プラン');
    expect(byId.e4.unlockZh).toContain('1个月方案');
  });

  it('**会話レイヤーはゲートしない**（60分上限はサーバー側が守る）', () => {
    const gated = gateAdventureMapForPlan(base, 3);
    const byId = Object.fromEntries(gated.regions.map((r) => [r.id, r]));
    expect(byId.c1.state).toBe('current');
    expect(byId.c2.unlockJa).toBe('');
  });

  it('攻略済み（done）はゲート圏でも奪わない', () => {
    const m = mapOf([
      region('e1', 'exam', 'done'),
      region('e2', 'exam', 'done'),
      region('e3', 'exam', 'done'),
      region('e4', 'exam', 'done'),
      region('e5', 'exam', 'current'),
    ], 'e5', null);
    const gated = gateAdventureMapForPlan(m, 3);
    const byId = Object.fromEntries(gated.regions.map((r) => [r.id, r]));
    expect(byId.e4.state).toBe('done');
    // 現在地（5地域目）はゲートされ、現在地なしになる
    expect(byId.e5.state).toBe('locked');
    expect(gated.currentRegionId).toBeNull();
  });

  it('次の目的地がゲート圏なら nextRegionId を null に倒す', () => {
    const m = mapOf([
      region('e1', 'exam', 'done'),
      region('e2', 'exam', 'done'),
      region('e3', 'exam', 'current'),
      region('e4', 'exam', 'next'),
    ], 'e3', 'e4');
    const gated = gateAdventureMapForPlan(m, 3);
    expect(gated.currentRegionId).toBe('e3');
    expect(gated.nextRegionId).toBeNull();
  });
});
