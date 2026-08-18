// つづけた日（ストリーク）の受入テスト（2026-08-19）。
//
// いちばん守りたいこと:
// - 同日冪等（1日1回しか保存が増えない＝保存ループを作らない）
// - 途切れても**責めない**: 数字が1へ戻るだけで、bestは残る
// - 履歴からのseedは**過小方向にしか**ズレない（過去分を偽造しない・原則13）
// - 節目は「ちょうど到達」した日だけ祝う（seedの飛び越えを遡って祝わない）
import { describe, it, expect } from 'vitest';
import {
  STREAK_MILESTONES, activeDayKeys, hasActivityOn, seedStreak, advanceStreak, crossedMilestone,
} from './advStreak';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile, AdvMasteryAttempt } from './advTypes';

const NOW = '2026-08-19T09:00:00.000Z';

const attempt = (dateKey: string): AdvMasteryAttempt => ({
  dateKey, scorePct: 60, unseenRatio: 0.5, questionKeys: ['rec:a'],
  tier: 'normal', timed: false, completedAt: `${dateKey}T09:00:00.000Z`,
});

const profileWith = (over: Partial<AdventureV2Profile>): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW), ...over,
});

describe('activeDayKeys — あゆみと同じ集合（questLog∪mastery）', () => {
  it('questLogの日とmastery attemptの日を合わせて返す', () => {
    const p = profileWith({
      questLog: [{ dateKey: '2026-08-17', completedSteps: 2, totalSteps: 3 }],
      mastery: { 'u-1': [attempt('2026-08-18'), attempt('2026-08-19')] },
    });
    expect([...activeDayKeys(p)].sort()).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
    expect(hasActivityOn(p, '2026-08-19')).toBe(true);
    expect(hasActivityOn(p, '2026-08-16')).toBe(false);
  });
});

describe('advanceStreak — 冪等と加算', () => {
  it('今日まだ活動していなければ何も起きない（開いただけでは数えない）', () => {
    const p = profileWith({});
    expect(advanceStreak(p, '2026-08-19')).toBeNull();
  });

  it('**同日冪等**: lastActiveKeyが今日なら null（1日1回しか保存が増えない）', () => {
    const p = profileWith({
      questLog: [{ dateKey: '2026-08-19', completedSteps: 1, totalSteps: 3 }],
      streak: { current: 4, best: 6, lastActiveKey: '2026-08-19' },
    });
    expect(advanceStreak(p, '2026-08-19')).toBeNull();
  });

  it('前日から続いていれば +1、bestも追随する', () => {
    const p = profileWith({
      questLog: [{ dateKey: '2026-08-19', completedSteps: 1, totalSteps: 3 }],
      streak: { current: 6, best: 6, lastActiveKey: '2026-08-18' },
    });
    expect(advanceStreak(p, '2026-08-19')).toEqual({ current: 7, best: 7, lastActiveKey: '2026-08-19' });
  });

  it('**2日以上空いたら1へ戻るだけ。bestは失われない**（責めない）', () => {
    const p = profileWith({
      questLog: [{ dateKey: '2026-08-19', completedSteps: 1, totalSteps: 3 }],
      streak: { current: 9, best: 12, lastActiveKey: '2026-08-16' },
    });
    expect(advanceStreak(p, '2026-08-19')).toEqual({ current: 1, best: 12, lastActiveKey: '2026-08-19' });
  });

  it('壊れたlastActiveKey・未来日付では進めない（安全側＝null）', () => {
    const base = { questLog: [{ dateKey: '2026-08-19', completedSteps: 1, totalSteps: 3 }] };
    expect(advanceStreak(profileWith({
      ...base, streak: { current: 2, best: 2, lastActiveKey: 'broken' },
    }), '2026-08-19')).toBeNull();
    expect(advanceStreak(profileWith({
      ...base, streak: { current: 2, best: 2, lastActiveKey: '2026-08-20' },
    }), '2026-08-19')).toBeNull();
  });
});

describe('seedStreak — 履歴からの初期値（偽造なし）', () => {
  it('今日を含む連続日数だけを過去へ遡って数える（穴の手前で止まる）', () => {
    const days = new Set(['2026-08-14', '2026-08-17', '2026-08-18', '2026-08-19']);
    expect(seedStreak(days, '2026-08-19')).toEqual({ current: 3, best: 3, lastActiveKey: '2026-08-19' });
  });

  it('今日の活動が無ければ null（過去だけで数字を作らない）', () => {
    expect(seedStreak(new Set(['2026-08-18']), '2026-08-19')).toBeNull();
    expect(seedStreak(new Set(), '2026-08-19')).toBeNull();
  });

  it('**間引きは過小方向にしかズレない**: 履歴から日が欠けても数字は増えない', () => {
    const full = new Set(['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19']);
    const trimmed = new Set(['2026-08-17', '2026-08-18', '2026-08-19']); // 古い日が間引かれた
    expect(seedStreak(full, '2026-08-19')!.current).toBe(4);
    expect(seedStreak(trimmed, '2026-08-19')!.current).toBe(3); // 少なくなるだけ・多くならない
  });

  it('advanceStreak: streakが無ければ履歴からseedする', () => {
    const p = profileWith({
      questLog: [
        { dateKey: '2026-08-18', completedSteps: 3, totalSteps: 3 },
        { dateKey: '2026-08-19', completedSteps: 1, totalSteps: 3 },
      ],
    });
    expect(advanceStreak(p, '2026-08-19')).toEqual({ current: 2, best: 2, lastActiveKey: '2026-08-19' });
  });
});

describe('crossedMilestone — ちょうど到達した節目だけ', () => {
  it('節目は 3,7,14,30,50,100', () => {
    expect([...STREAK_MILESTONES]).toEqual([3, 7, 14, 30, 50, 100]);
  });

  it('+1でちょうど到達したら返す（3→祝う・4→祝わない）', () => {
    expect(crossedMilestone(
      { current: 2, best: 2, lastActiveKey: '2026-08-18' },
      { current: 3, best: 3, lastActiveKey: '2026-08-19' },
    )).toBe(3);
    expect(crossedMilestone(
      { current: 3, best: 3, lastActiveKey: '2026-08-18' },
      { current: 4, best: 4, lastActiveKey: '2026-08-19' },
    )).toBeNull();
    expect(crossedMilestone(
      { current: 6, best: 9, lastActiveKey: '2026-08-18' },
      { current: 7, best: 9, lastActiveKey: '2026-08-19' },
    )).toBe(7);
  });

  it('**seedが節目を飛び越えた場合は祝わない**（過去分を遡って祝う演出をしない）', () => {
    expect(crossedMilestone(null, { current: 5, best: 5, lastActiveKey: '2026-08-19' })).toBeNull();
  });

  it('リセット（1へ戻る）や同値では祝わない', () => {
    expect(crossedMilestone(
      { current: 9, best: 12, lastActiveKey: '2026-08-16' },
      { current: 1, best: 12, lastActiveKey: '2026-08-19' },
    )).toBeNull();
    expect(crossedMilestone(
      { current: 3, best: 3, lastActiveKey: '2026-08-19' },
      { current: 3, best: 3, lastActiveKey: '2026-08-19' },
    )).toBeNull();
  });
});
