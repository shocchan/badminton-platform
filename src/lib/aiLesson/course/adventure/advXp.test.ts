// XP（努力の通貨・2026-08-16）の受入テスト。
//
// いちばん守りたいこと:
// - XPは上限なしで増え続ける（おかわりバトルの動機づけ）
// - 旧データ（xpフィールドが無い/壊れている）を読んでも落ちず、0から始まる
import { describe, it, expect } from 'vitest';
import { XP_RULES, xpForBattle, levelOf, xpToNextLevel } from './advXp';
import { readAdvProfile, writeAdvProfile, defaultAdvProfile } from './advProfile';
import type { LearnerSettings } from '../types';

const NOW = '2026-08-16T10:00:00.000Z';

describe('xpForBattle: 参加でもらえて、80%以上でボーナス', () => {
  it('79%は参加分のみ・80%からボーナス', () => {
    expect(xpForBattle(0)).toBe(XP_RULES.battle);
    expect(xpForBattle(79)).toBe(XP_RULES.battle);
    expect(xpForBattle(80)).toBe(XP_RULES.battle + XP_RULES.battleWinBonus);
    expect(xpForBattle(100)).toBe(XP_RULES.battle + XP_RULES.battleWinBonus);
  });
});

describe('levelOf / xpToNextLevel: 100XPごとにレベルアップ', () => {
  it('Lv.1から始まり、境界値で上がる', () => {
    expect(levelOf(0)).toBe(1);
    expect(levelOf(99)).toBe(1);
    expect(levelOf(100)).toBe(2);
    expect(levelOf(1050)).toBe(11);
  });
  it('負数・NaN由来でも壊れない（0扱い）', () => {
    expect(levelOf(-10)).toBe(1);
    expect(xpToNextLevel(-10)).toBe(100);
  });
  it('次のレベルまでの残り', () => {
    expect(xpToNextLevel(0)).toBe(100);
    expect(xpToNextLevel(30)).toBe(70);
    expect(xpToNextLevel(199)).toBe(1);
  });
});

describe('プロファイルのxp: 復元と後方互換', () => {
  it('xpが無い旧データ → 0で開始', () => {
    const settings = {
      adventureV2: { schemaVersion: 1, enabled: true },
    } as unknown as LearnerSettings;
    expect(readAdvProfile(settings)!.xp).toBe(0);
  });

  it('壊れたxp（文字列・負数・小数）→ 安全側に丸める', () => {
    const read = (xp: unknown) => readAdvProfile({
      adventureV2: { schemaVersion: 1, enabled: true, xp },
    } as unknown as LearnerSettings)!.xp;
    expect(read('abc')).toBe(0);
    expect(read(-50)).toBe(0);
    expect(read(120.9)).toBe(120);
  });

  it('保存→再読込でXPが減らない（往復耐久）', () => {
    const prof = { ...defaultAdvProfile(NOW), enabled: true, xp: 235 };
    const settings = writeAdvProfile({} as LearnerSettings, prof, NOW);
    expect(readAdvProfile(settings)!.xp).toBe(235);
  });
});
