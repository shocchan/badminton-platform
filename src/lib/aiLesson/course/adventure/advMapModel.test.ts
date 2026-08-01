// 冒険マップの受入テスト（PRODUCT_CANON 原則11/12/13）。
//
// いちばん守りたいのは「現在地が1つであること」。
// ルートを切り替えても複数の現在地が出ると、学習者はどこにいるのか分からなくなる。
import { describe, it, expect } from 'vitest';
import { buildAdventureMap, availableRouteKinds } from './advMapModel';
import { generateRoute } from './advRoute';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile, AdvGoalType } from './advTypes';

const NOW = '2026-08-02T00:00:00.000Z';

const profileFor = (goalType: AdvGoalType): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  goalType,
  targetJlpt: goalType === 'conversation' ? null : 'N2',
  dailyMinutes: 15,
  route: generateRoute({
    goalType,
    targetJlpt: goalType === 'conversation' ? null : 'N2',
    knowledgeBand: 'n4', conversationBand: 'n4', diagnosis: null, nowISO: NOW,
  }),
});

describe('冒険マップ — 現在地は必ず1つ', () => {
  for (const goal of ['jlpt', 'conversation', 'hybrid'] as AdvGoalType[]) {
    for (const kind of availableRouteKinds(goal)) {
      it(`${goal} / ${kind}: current が1つだけ`, () => {
        const prof = profileFor(goal);
        const m = buildAdventureMap(prof, prof.route, new Set(), 1, kind);
        expect(m.regions.filter((r) => r.state === 'current')).toHaveLength(1);
        expect(m.currentRegionId).toBeTruthy();
      });
    }
  }

  it('攻略が進んでも current は1つ（先頭の未攻略へ移る）', () => {
    const prof = profileFor('jlpt');
    const first = prof.route!.stages[0].stageId;
    const m = buildAdventureMap(prof, prof.route, new Set([first]), 1, 'exam');
    expect(m.regions.filter((r) => r.state === 'current')).toHaveLength(1);
    expect(m.currentRegionId).toBe(prof.route!.stages[1].stageId);
    expect(m.doneCount).toBe(1);
  });
});

describe('冒険マップ — 表示の誠実さ', () => {
  it('**未解放の地域に定着率を出さない**（0%と見せない・原則13）', () => {
    const prof = profileFor('jlpt');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'exam');
    for (const r of m.regions.filter((x) => x.state === 'locked')) {
      expect(r.masteryPct).toBeNull();
    }
  });

  it('**会話の地域は定着率を測っていないので必ず未判定**', () => {
    const prof = profileFor('conversation');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'conversation');
    expect(m.regions.length).toBe(12);   // PLACE_NAME と同数
    for (const r of m.regions) expect(r.masteryPct).toBeNull();
  });

  it('全地域が「何の力を鍛えるか」を持つ（世界観の名前だけにしない・原則12）', () => {
    for (const goal of ['jlpt', 'conversation', 'hybrid'] as AdvGoalType[]) {
      const prof = profileFor(goal);
      for (const kind of availableRouteKinds(goal)) {
        for (const r of buildAdventureMap(prof, prof.route, new Set(), 1, kind).regions) {
          expect(r.abilityJa.length, `${goal}/${kind}/${r.id}`).toBeGreaterThan(0);
          expect(r.abilityZh.length, `${goal}/${kind}/${r.id}`).toBeGreaterThan(0);
          expect(r.nameZh.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('地域ごとにランドマークが割り当たる（全部同じ形にしない）', () => {
    const prof = profileFor('hybrid');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'combined');
    expect(new Set(m.regions.map((r) => r.landmark)).size).toBeGreaterThan(4);
  });
});

describe('冒険マップ — ルートの組み立て', () => {
  it('目的が試験なら試験ルートだけ、会話なら会話ルートだけを出す', () => {
    expect(availableRouteKinds('jlpt')).toEqual(['exam']);
    expect(availableRouteKinds('conversation')).toEqual(['conversation']);
    expect(availableRouteKinds('hybrid')).toEqual(['combined', 'exam', 'conversation']);
  });

  it('**Hybridの総合ルートは試験と会話が合流する**（mergeIndexを持つ）', () => {
    const prof = profileFor('hybrid');
    const m = buildAdventureMap(prof, prof.route, new Set(), 1, 'combined');
    expect(m.mergeIndex).not.toBeNull();
    // 合流点より前が試験、後が会話
    expect(m.regions[m.mergeIndex! - 1].layer).toBe('exam');
    expect(m.regions[m.mergeIndex!].layer).toBe('conversation');
    expect(m.totalCount).toBe(m.regions.length);
  });

  it('会話目的でルートが無くても地図が壊れない', () => {
    const prof = { ...profileFor('conversation'), route: null };
    const m = buildAdventureMap(prof, null, new Set(), 1, 'conversation');
    expect(m.regions.length).toBe(12);   // PLACE_NAME と同数
    expect(m.currentRegionId).toBeTruthy();
    expect(m.destinationJa.length).toBeGreaterThan(0);
  });
});
