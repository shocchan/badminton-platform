import { describe, it, expect } from 'vitest';
import {
  displayWeekOfMission, currentDisplayWeek, chapterOfInternalWeek, displayWeeksOfChapter,
  accessTierOf, isMissionLockedByTier, TOTAL_DISPLAY_WEEKS,
} from './courseWeekMapping';
import type { Learner } from './types';

const learnerWith = (settings: object, admin: object = {}) =>
  ({ settings, adminOverrides: admin } as unknown as Learner);

describe('24学習週マッピング（DB制約1..12・60ミッション本文は不変）', () => {
  it('内部1週=表示2週（m1-m2=前半・m3-m5=後半）・週2/3配分', () => {
    expect(displayWeekOfMission({ week: 1, order: 1 })).toBe(1);
    expect(displayWeekOfMission({ week: 1, order: 2 })).toBe(1);
    expect(displayWeekOfMission({ week: 1, order: 3 })).toBe(2);
    expect(displayWeekOfMission({ week: 1, order: 5 })).toBe(2);
    expect(displayWeekOfMission({ week: 12, order: 5 })).toBe(TOTAL_DISPLAY_WEEKS);
  });

  it('章=内部2週=表示4週=10ミッション（6章構成）', () => {
    expect(chapterOfInternalWeek(1)).toBe(1);
    expect(chapterOfInternalWeek(6)).toBe(3);   // 第3章まで=3か月範囲
    expect(chapterOfInternalWeek(7)).toBe(4);
    expect(chapterOfInternalWeek(12)).toBe(6);
    expect(displayWeeksOfChapter(1)).toEqual([1, 4]);
    expect(displayWeeksOfChapter(4)).toEqual([13, 16]);
    expect(displayWeeksOfChapter(6)).toEqual([21, 24]);
  });

  it('現在表示週: 完了0〜1=前半・2以上=後半・24上限', () => {
    expect(currentDisplayWeek(1, 0)).toBe(1);
    expect(currentDisplayWeek(1, 2)).toBe(2);
    expect(currentDisplayWeek(3, 1)).toBe(5);
    expect(currentDisplayWeek(12, 5)).toBe(24);
  });

  it('アクセス層: admin優先・不正/未設定はfull_24w（既存受講生を誤ロックしない）', () => {
    expect(accessTierOf(learnerWith({}))).toBe('full_24w');
    expect(accessTierOf(learnerWith({ accessTier: 'starter_12w' }))).toBe('starter_12w');
    expect(accessTierOf(learnerWith({ accessTier: 'starter_12w' }, { accessTier: 'full_24w' }))).toBe('full_24w');
    expect(accessTierOf(learnerWith({ accessTier: 'hacked_tier' }))).toBe('full_24w');
  });

  it('鍵判定: starterは内部7週以降（表示Week13〜=第4章〜）のみロック', () => {
    expect(isMissionLockedByTier('starter_12w', { week: 6 })).toBe(false);
    expect(isMissionLockedByTier('starter_12w', { week: 7 })).toBe(true);
    expect(isMissionLockedByTier('full_24w', { week: 12 })).toBe(false);
    expect(isMissionLockedByTier('graduated', { week: 12 })).toBe(false);
  });
});
