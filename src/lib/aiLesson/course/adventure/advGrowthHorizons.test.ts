// 成長の4段階（2026-08-23 実生徒監査）。
// 監査で「半年コースなのに、見えるのは今日のことだけ」だったので4段階に固定した。
// ここで守るのは **数えられる事実しか出さないこと**（原則13）。
import { describe, it, expect } from 'vitest';
import { buildGrowthHorizons } from './advGrowthHorizons';

const TODAY = '2026-08-23';
const day = (n: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

const profileWith = (questDays: number[], ledgerDays: { d: number; score: number }[]) => ({
  questLog: questDays.map((n) => ({ dateKey: day(n), completedSteps: 1, totalSteps: 1 })),
  mastery: {
    't1': ledgerDays.map(({ d, score }) => ({
      dateKey: day(d), scorePct: score, unseenRatio: 1, questionKeys: ['k'],
      tier: 'normal' as const, timed: false, completedAt: `${day(d)}T09:00:00.000Z`,
    })),
  },
} as never);

describe('buildGrowthHorizons', () => {
  it('記録がまったく無い人には、どの段も「数えられない」と返す（0日と言わない）', () => {
    const h = buildGrowthHorizons(profileWith([], []), TODAY);
    for (const k of ['today', 'week', 'month', 'halfYear'] as const) {
      expect(h[k].measured, k).toBe(false);
      expect(h[k].studyDays, k).toBe(0);
    }
    expect(h.firstStudyDateKey).toBeNull();
  });

  it('学習日数は questLog と台帳の**和集合**（バトルだけの日・冒険だけの日を落とさない）', () => {
    // 0日前=冒険のみ / 1日前=バトルのみ / 2日前=両方
    const h = buildGrowthHorizons(profileWith([0, 2], [{ d: 1, score: 80 }, { d: 2, score: 50 }]), TODAY);
    expect(h.month.studyDays).toBe(3);
    expect(h.today.studyDays).toBe(1);
  });

  it('30日と半年で範囲が変わる（40日前は30日の段に入らない）', () => {
    const h = buildGrowthHorizons(profileWith([0, 40], []), TODAY);
    expect(h.month.studyDays).toBe(1);
    expect(h.halfYear.studyDays).toBe(2);
  });

  it('合格回数は7割以上の挑戦だけを数える（挑戦した回数と混ぜない）', () => {
    const h = buildGrowthHorizons(profileWith([], [
      { d: 0, score: 100 }, { d: 0, score: 40 }, { d: 3, score: 71 },
    ]), TODAY);
    expect(h.month.attempts).toBe(3);
    expect(h.month.passedCount).toBe(2);   // 100 と 71（40は不合格）
  });

  it('半年より前の記録は半年の段にも入らない（180日で切る）', () => {
    const h = buildGrowthHorizons(profileWith([200], []), TODAY);
    expect(h.halfYear.measured).toBe(false);
  });

  it('最初の学習日を返す（半年の段で「いつから」を言うため）', () => {
    const h = buildGrowthHorizons(profileWith([10, 3], []), TODAY);
    expect(h.firstStudyDateKey).toBe(day(10));
  });

  it('questLogが上限まで貯まっていたら logTruncated（「記録に残っている範囲」と断るため）', () => {
    const many = Array.from({ length: 60 }, (_, i) => i);
    expect(buildGrowthHorizons(profileWith(many, []), TODAY).logTruncated).toBe(true);
    expect(buildGrowthHorizons(profileWith([0], []), TODAY).logTruncated).toBe(false);
  });
});
