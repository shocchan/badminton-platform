// 管理者向け利用状況集計（advAdminUsage）の受入テスト。
// いちばん守りたいこと: 実記録だけから数える（原則13）・未オンボーディングを正直に出す
import { describe, it, expect } from 'vitest';
import { advLearnerUsageOf } from './advAdminUsage';
import { defaultAdvProfile, writeAdvProfile } from './advProfile';
import type { LearnerSettings } from '../types';
import type { AdvMasteryAttempt } from './advTypes';

const NOW = '2026-08-15T12:00:00.000Z';
const daysAgoKey = (n: number): string =>
  new Date(Date.parse('2026-08-15') - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

const attempt = (dateKey: string): AdvMasteryAttempt => ({
  dateKey, scorePct: 85, unseenRatio: 1, questionKeys: ['q:a'],
  tier: 'normal', timed: false, completedAt: `${dateKey}T10:00:00.000Z`,
});

describe('advLearnerUsageOf', () => {
  it('未オンボーディング（settingsなし・ルートなし）は準備前として全部0', () => {
    const u = advLearnerUsageOf({} as LearnerSettings, NOW);
    expect(u.onboarded).toBe(false);
    expect(u.totalStudyDays).toBe(0);
    expect(u.lastStudyDateKey).toBeNull();
  });

  it('questLogとmasteryの日付キーの和集合で学習日数を数える（同日は1日）', () => {
    const prof = {
      ...defaultAdvProfile(NOW),
      enabled: true,
      questLog: [
        { dateKey: daysAgoKey(0), completedSteps: 3, totalSteps: 3 },
        { dateKey: daysAgoKey(2), completedSteps: 1, totalSteps: 3 },
        { dateKey: daysAgoKey(20), completedSteps: 4, totalSteps: 4 },
      ] as never,
      mastery: {
        u1: [attempt(daysAgoKey(0)), attempt(daysAgoKey(9))], // 今日はquestLogと同日=重複しない
      },
    };
    const settings = writeAdvProfile({} as LearnerSettings, prof, NOW);
    const u = advLearnerUsageOf(settings, NOW);
    expect(u.totalStudyDays).toBe(4);      // 今日・2日前・9日前・20日前
    expect(u.studyDays7).toBe(2);          // 今日・2日前
    expect(u.studyDays30).toBe(4);
    expect(u.lastStudyDateKey).toBe(daysAgoKey(0));
    expect(u.completedQuests).toBe(2);     // 3/3 と 4/4
    expect(u.battleAttempts).toBe(2);
  });
});
