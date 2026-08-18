// 攻略し終えたのに「まだ挑戦していません」と出さない（2026-08-18 P0）。
//
// 実測で見つかった2つ:
// ① `examRegions` は `mastered.has(stage.stageId)` で攻略を判定するが、AdvShellは
//    **台帳のtargetID集合**だけを渡していた。stageIdが台帳に載るのは中ボス・ランクボスを
//    戦ったときだけなので、通常の学習で全部の束を攻略しても地図は「0地域攻略・
//    全部まだ挑戦していません」のままだった（ホームの攻略率100%と食い違う）。
//    → AdvShell側で deriveMasteredStageIds の結果を混ぜて渡す（advShellMapMastered.test.ts）。
// ② 全地域を攻略すると firstOpen が -1 になり、`firstOpen + 1 === 0` で
//    **先頭の地域が「次の目的地」に化けて**攻略済み表示が1つ減っていた。ここで固定する。
import { describe, it, expect } from 'vitest';
import { buildAdventureMap } from './advMapModel';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile, JlptLevel } from './advTypes';

const NOW = '2026-11-01T09:00:00.000Z';

const setup = (target: JlptLevel) => {
  const route = generateRoute({
    goalType: 'jlpt', targetJlpt: target, knowledgeBand: 'pre_n5',
    conversationBand: 'pre_n5', diagnosis: null, nowISO: NOW,
  });
  const profile: AdventureV2Profile = {
    ...defaultAdvProfile(NOW), goalType: 'jlpt', targetJlpt: target, dailyMinutes: 15, route,
  };
  return { route, profile };
};

describe('全地域を攻略した地図', () => {
  it('全stage攻略済みなら doneCount === totalCount・現在地なし（先頭が「次」に化けない）', () => {
    for (const target of ['N5', 'N4', 'N3', 'N2'] as JlptLevel[]) {
      const { route, profile } = setup(target);
      const allStages = new Set(route.stages.map((s) => s.stageId));
      const map = buildAdventureMap(profile, route, allStages, 1, 'exam', NOW);
      expect(map.doneCount, `${target}: 攻略済み地域の数`).toBe(map.totalCount);
      expect(map.currentRegionId, `${target}: 現在地`).toBeNull();
      expect(map.nextRegionId, `${target}: 次の目的地`).toBeNull();
      for (const r of map.regions) {
        expect(r.state, `${target}/${r.id} の状態`).toBe('done');
        expect(r.doneJa, `${target}/${r.id} の説明`).not.toMatch(/まだ挑戦していません/);
      }
    }
  });

  it('途中の状態では従来どおり現在地と次が1つずつ決まる', () => {
    const { route, profile } = setup('N3');
    const map = buildAdventureMap(profile, route, new Set([route.stages[0].stageId]), 1, 'exam', NOW);
    expect(map.currentRegionId).toBe(route.stages[1].stageId);
    expect(map.nextRegionId).toBe(route.stages[2].stageId);
    expect(map.doneCount).toBe(1);
    expect(map.regions[0].state).toBe('done');
    expect(map.regions[1].state).toBe('current');
    expect(map.regions[2].state).toBe('next');
  });

  it('1つも攻略していない状態では先頭が現在地', () => {
    const { route, profile } = setup('N5');
    const map = buildAdventureMap(profile, route, new Set(), 1, 'exam', NOW);
    expect(map.currentRegionId).toBe(route.stages[0].stageId);
    expect(map.doneCount).toBe(0);
  });
});
