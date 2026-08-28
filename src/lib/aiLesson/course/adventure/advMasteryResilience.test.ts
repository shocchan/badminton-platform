// 壊れた定着記録があっても学習画面を落とさない。
//
// 実際に起きた事故: 項目の欠けた試行が1件あるだけで
// `a.questionKeys.length` が落ち、AdvRuntimeGate ごと画面が真っ白になった。
// その生徒はリロードしても同じ場所で落ちるので、二度と入れない。
//
// 直し方の方針: **判定できないものは「合格していない」に倒す**。
// 甘く数えて先へ進ませるより、記録が減るほうが安全。

import { describe, it, expect } from 'vitest';
import { readAdvProfile } from './advProfile';
import { computeMastery, masteredTargetIds, isQualifyingAttempt } from './advMastery';
import type { AdvMasteryAttempt } from './advTypes';
import type { LearnerSettings } from '../types';

const NOW = '2026-08-04T00:00:00Z';

/** 正しい形の試行 */
const good = (dateKey: string): AdvMasteryAttempt => ({
  dateKey, scorePct: 95, unseenRatio: 1,
  questionKeys: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'],
  tier: 'normal', timed: false, completedAt: `${dateKey}T00:00:00Z`,
});

const settingsWith = (mastery: unknown): LearnerSettings => ({
  adventureV2: { schemaVersion: 1, enabled: true, createdAt: NOW, updatedAt: NOW, mastery },
} as unknown as LearnerSettings);

describe('壊れた定着記録で落ちない', () => {
  it('項目が欠けた試行を渡しても例外を投げない', () => {
    const broken = { dateKey: '2026-08-01', scorePct: 90 } as unknown as AdvMasteryAttempt;
    expect(() => isQualifyingAttempt(broken, true)).not.toThrow();
    expect(isQualifyingAttempt(broken, true)).toBe(false);   // 甘く数えない
  });

  it('questionKeys が無くても computeMastery が動く', () => {
    const attempts = [{ dateKey: '2026-08-01', scorePct: 95, unseenRatio: 1 }] as unknown as AdvMasteryAttempt[];
    expect(() => computeMastery(attempts, NOW)).not.toThrow();
    expect(computeMastery(attempts, NOW).state).not.toBe('mastered');
  });

  it('壊れた記録が混ざった台帳でも masteredTargetIds が動く', () => {
    const ledger = {
      't-ok': [good('2026-08-01'), good('2026-08-02'), good('2026-08-03')],
      't-broken': [{ scorePct: 100 }] as unknown as AdvMasteryAttempt[],
    };
    expect(() => masteredTargetIds(ledger, NOW)).not.toThrow();
  });
});

describe('読み込みの入口で壊れた記録を捨てる', () => {
  it('形の合わない試行は落とす', () => {
    const p = readAdvProfile(settingsWith({
      't-1': [good('2026-08-01'), { scorePct: 100 }, null, 'こわれ'],
    }));
    expect(p).not.toBeNull();
    expect(p!.mastery['t-1']).toHaveLength(1);
  });

  it('全部壊れている対象は、対象ごと落とす', () => {
    const p = readAdvProfile(settingsWith({ 't-1': [{ scorePct: 100 }], 't-2': 'こわれ' }));
    expect(Object.keys(p!.mastery)).toHaveLength(0);
  });

  it('正しい記録はそのまま残る', () => {
    const p = readAdvProfile(settingsWith({ 't-1': [good('2026-08-01'), good('2026-08-02')] }));
    expect(p!.mastery['t-1']).toHaveLength(2);
  });

  it('mastery が配列やnullでも落ちない', () => {
    for (const v of [null, [], 'x', 42]) {
      expect(() => readAdvProfile(settingsWith(v)), String(v)).not.toThrow();
    }
  });
});
