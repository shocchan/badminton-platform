// 週のまとめ・今日のまとめの受入テスト（PRODUCT_CANON §6・原則8/13）。
//
// ここで守りたいのは「盛らないこと」。有料商品なので、
// 測っていない伸びを表示すると学習者を欺くことになる。
import { describe, it, expect } from 'vitest';
import { buildWeeklySummary, buildDailySummary, weekStartOf } from './advWeekly';
import { defaultAdvProfile } from './advProfile';
import type { AdventureV2Profile, AdvMasteryAttempt } from './advTypes';

const NOW = '2026-08-05T09:00:00.000Z'; // 水曜
const THIS_WEEK = '2026-08-03'; // 月曜
const LAST_WEEK = '2026-07-27';

const att = (dateKey: string, skill: string, correct: number, total: number): AdvMasteryAttempt => ({
  dateKey,
  scorePct: total === 0 ? 0 : Math.round((correct / total) * 100),
  unseenRatio: 1,
  questionKeys: [`k-${dateKey}-${skill}-${total}`],
  tier: 'normal',
  timed: false,
  completedAt: `${dateKey}T10:00:00.000Z`,
  skills: [skill],
  bySkill: { [skill]: { correct, total, unseen: total } },
});

const profileWith = (over: Partial<AdventureV2Profile> = {}): AdventureV2Profile => ({
  ...defaultAdvProfile(NOW),
  targetJlpt: 'N2',
  dailyMinutes: 15,
  ...over,
});

describe('週の開始日', () => {
  it('月曜はじまりで週を切る', () => {
    expect(weekStartOf('2026-08-05T00:00:00.000Z')).toBe('2026-08-03'); // 水 → 月
    expect(weekStartOf('2026-08-03T00:00:00.000Z')).toBe('2026-08-03'); // 月 → 同日
    expect(weekStartOf('2026-08-09T00:00:00.000Z')).toBe('2026-08-03'); // 日 → 同じ週
  });
});

describe('週のまとめ — 盛らない', () => {
  it('記録が無い週は「まだ記録がありません」と言い、0%を並べない', () => {
    const wk = buildWeeklySummary(profileWith(), NOW);
    expect(wk.studyDays).toBe(0);
    expect(wk.insufficientData).toBe(true);
    expect(wk.headlineJa).toContain('まだ学習の記録がありません');
    // 技能行は出すが、すべて未判定（deltaPct=null）であること
    expect(wk.skillChanges.every((c) => c.deltaPct === null)).toBe(true);
  });

  it('**母数が少ない週の変化は「未判定」にする**（3問で伸びたと言わない）', () => {
    const prof = profileWith({
      mastery: {
        g: [att(LAST_WEEK, 'grammar', 1, 3), att(THIS_WEEK, 'grammar', 3, 3)],
      },
      questLog: [{ dateKey: THIS_WEEK, completedSteps: 3, totalSteps: 3 }],
    });
    const wk = buildWeeklySummary(prof, NOW);
    const g = wk.skillChanges.find((c) => c.skill === 'grammar')!;
    expect(g.thisWeekPct).toBe(100);
    expect(g.lastWeekPct).toBe(33);
    // 母数10未満なので変化として出さない
    expect(g.deltaPct).toBeNull();
    expect(wk.headlineJa).not.toContain('上がりました');
  });

  it('2週続けて十分な母数があれば変化を出す', () => {
    const prof = profileWith({
      mastery: {
        g: [att(LAST_WEEK, 'grammar', 6, 12), att(THIS_WEEK, 'grammar', 9, 12)],
      },
      questLog: [{ dateKey: THIS_WEEK, completedSteps: 3, totalSteps: 3 }],
    });
    const wk = buildWeeklySummary(prof, NOW);
    const g = wk.skillChanges.find((c) => c.skill === 'grammar')!;
    expect(g.deltaPct).toBe(75 - 50);
    expect(wk.headlineJa).toContain('上がりました');
  });

  it('先週の記録が無ければ、今週だけでは変化を出さない', () => {
    const prof = profileWith({
      mastery: { g: [att(THIS_WEEK, 'grammar', 12, 12)] },
      questLog: [{ dateKey: THIS_WEEK, completedSteps: 3, totalSteps: 3 }],
    });
    const g = buildWeeklySummary(prof, NOW).skillChanges.find((c) => c.skill === 'grammar')!;
    expect(g.thisWeekPct).toBe(100);
    expect(g.lastWeekPct).toBeNull();
    expect(g.deltaPct).toBeNull();
  });

  it('学習時間は「目安」であることが分かる形でしか出さない（実測していない）', () => {
    const prof = profileWith({
      dailyMinutes: 15,
      questLog: [
        { dateKey: THIS_WEEK, completedSteps: 3, totalSteps: 3 },
        { dateKey: '2026-08-04', completedSteps: 2, totalSteps: 3 },
      ],
    });
    const wk = buildWeeklySummary(prof, NOW);
    expect(wk.studyDays).toBe(2);
    expect(wk.completedQuests).toBe(1); // 全step完了は1日だけ
    expect(wk.estimatedMinutes).toBe(30);
  });

  it('来週の重点は「今週いちばん低い技能」。母数が足りなければ決めない', () => {
    const thin = profileWith({ mastery: { g: [att(THIS_WEEK, 'grammar', 2, 4)] } });
    expect(buildWeeklySummary(thin, NOW).focusSkillNextWeek).toBeNull();

    const enough = profileWith({
      mastery: {
        g: [att(THIS_WEEK, 'grammar', 11, 12)],
        r: [att(THIS_WEEK, 'reading', 4, 12)],
      },
    });
    expect(buildWeeklySummary(enough, NOW).focusSkillNextWeek).toBe('reading');
  });

  it('ja/zh どちらの文面も生成され、空にならない', () => {
    const wk = buildWeeklySummary(profileWith(), NOW);
    for (const s of [wk.headlineJa, wk.headlineZh, wk.nextWeekJa, wk.nextWeekZh]) {
      expect(s.length).toBeGreaterThan(0);
    }
  });
});

describe('今日のまとめ — 解いていない技能を0%で並べない', () => {
  it('今日解いた技能だけを返す', () => {
    const prof = profileWith({
      mastery: {
        g: [att('2026-08-05', 'grammar', 4, 5)],
        r: [att('2026-08-01', 'reading', 1, 5)],   // 別の日 → 今日には出さない
      },
    });
    const d = buildDailySummary(prof, '2026-08-05', NOW);
    expect(d.skillResults.map((x) => x.skill)).toEqual(['grammar']);
    expect(d.skillResults[0].pct).toBe(80);
    expect(d.noRecord).toBe(false);
  });

  it('今日の記録が無ければ noRecord で、伸びを語らせない', () => {
    const d = buildDailySummary(profileWith(), '2026-08-05', NOW);
    expect(d.skillResults).toEqual([]);
    expect(d.noRecord).toBe(true);
    expect(d.newlyMasteredToday).toBe(0);
  });
});
