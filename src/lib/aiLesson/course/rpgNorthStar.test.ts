// RPG North Star（CEO最上位方針）の設計manifestガード。
// 実装前でも、設計が原則に反した状態でcommitされることを防ぐ。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const gen = (n: string) => JSON.parse(readFileSync(
  join(__dirname, '../../../..', 'docs/ai-course/rpg/generated', n), 'utf8'));
const world = gen('rpg-world-manifest.json');
const chapters = gen('chapter-manifest.json');
const quests = gen('quest-manifest.json');
const rewards = gen('reward-manifest.json');

describe('RPG設計の不変条件', () => {
  it('冒険値はMasteryに影響しない（学習と演出の分離）', () => {
    const xp = rewards.inGame.find((r: { id: string }) => r.id === 'adventure-xp');
    expect(xp.affectsMastery).toBe(false);
    const rank = rewards.inGame.find((r: { id: string }) => r.id === 'adventurer-rank');
    expect(rank.isJlptLevel).toBe(false);
    expect(rank.derivedFrom).toBe('adventure-xp');
  });
  it('霧はmasteryStateから導出するだけで書き込まない', () => {
    expect(world.coreMechanic.dataSource).toContain('読むだけ');
    expect(world.coreMechanic.dataSource).toContain('書き込み禁止');
  });
  it('現実報酬は未実装で、法務確認がblockerとして残っている', () => {
    expect(rewards.realWorld.status).toBe('not_implemented');
    expect(rewards.realWorld.blockedBy).toContain('景品表示法の確認');
    expect(rewards.realWorld.decisionQueue).toBe('awaiting_legal_review');
    expect(rewards.prohibited).toContain('ガチャ');
  });
  it('模倣禁止・幼児向け禁止が世界設定に明記されている', () => {
    const p = world.prohibited.join('');
    expect(p).toContain('模倣');
    expect(p).toContain('幼児');
  });
});

describe('章・クエストの参照整合', () => {
  it('全chapterのareaIdがworld manifestに実在する', () => {
    const areas = new Set(world.areas.map((a: { id: string }) => a.id));
    for (const c of chapters.chapters) expect(areas.has(c.areaId), `${c.id}: 未知のarea`).toBe(true);
  });
  it('全questのchapterIdが実在し、chapter側のquestIdsと双方向で一致する', () => {
    const chIds = new Set(chapters.chapters.map((c: { id: string }) => c.id));
    for (const q of quests.quests) expect(chIds.has(q.chapterId)).toBe(true);
    const ch1 = chapters.chapters.find((c: { id: string }) => c.id === 'ch-1');
    const q1 = quests.quests.filter((q: { chapterId: string }) => q.chapterId === 'ch-1')
      .map((q: { id: string }) => q.id);
    expect([...ch1.questIds].sort()).toEqual([...q1].sort());
  });
  it('Vertical Sliceは1章のみ（全世界を最初に作らない）', () => {
    const vs = chapters.chapters.filter((c: { verticalSlice: boolean }) => c.verticalSlice);
    expect(vs.length).toBe(1);
    expect(vs[0].id).toBe('ch-1');
    expect(chapters.totals.implemented).toBe(0);
  });
  it('章末クエストは単発テストにしない旨がルールとして残っている', () => {
    const fin = quests.quests.find((q: { isFinalQuest?: boolean }) => q.isFinalQuest);
    expect(fin.completionRule).toContain('10問テストにしない');
    expect(quests.rules.mustChangeWorld).toContain('実際に変化');
  });
  it('全クエストが解放するものを持つ（何も変化しないクエストを作らない）', () => {
    for (const q of quests.quests) expect(q.unlocks.length).toBeGreaterThan(0);
  });
});
