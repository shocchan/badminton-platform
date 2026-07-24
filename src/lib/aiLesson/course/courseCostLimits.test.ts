// コスト概算・利用上限・管理集計の不変条件（Phase 6 コスト管理 / Phase 5 管理集計）。
// 純関数のみを検証（DB非依存）。狙いは「二重計上しない」「上限を超えて残回数を出さない」
// 「推定コストが単調・非負」「管理集計の率が二重計上されない」の固定化。

import { describe, it, expect } from 'vitest';
import { estimateSessionCost, learnerStats } from './courseStats';
import { remainingSessionsToday } from './courseUsage';
import type { UsageLimits, TodayUsage } from './courseUsage';
import { DEFAULT_USAGE_LIMITS, REALTIME_COST } from './courseConfig';
import type { CourseSessionRecord } from './types';

const limits = (over: Partial<UsageLimits> = {}): UsageLimits => ({ ...DEFAULT_USAGE_LIMITS, ...over });
const usage = (over: Partial<TodayUsage> = {}): TodayUsage => ({ sessionsCount: 0, secondsUsed: 0, costUsd: 0, ...over });

const session = (over: Partial<CourseSessionRecord> = {}): CourseSessionRecord => ({
  id: 's', missionId: 'w01m1', mode: 'voice', lessonKind: 'new', difficulty: 2,
  startedAt: '2026-09-01T09:00:00Z', endedAt: '2026-09-01T09:03:00Z', durationSeconds: 180,
  completionStatus: 'completed', endReason: 'timeout', targetExpression: 'x', targetUsed: true,
  targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false, errorCode: null,
  estimatedCostUsd: 0.05, report: null, speechMetrics: undefined, ...over,
});

describe('estimateSessionCost（Phase 6.4 コスト概算）', () => {
  it('0秒は0コスト・負にならない', () => {
    expect(estimateSessionCost(0)).toBe(0);
    expect(estimateSessionCost(-100)).toBe(0);
  });
  it('時間が増えるとコストも増える（単調増加）', () => {
    expect(estimateSessionCost(180)).toBeGreaterThan(estimateSessionCost(60));
    expect(estimateSessionCost(240)).toBeGreaterThan(estimateSessionCost(180));
  });
  it('設定単価と一致する（推定値の透明性）', () => {
    const min = 3;
    const inTok = min * REALTIME_COST.approxInputTokensPerMin;
    const outTok = min * REALTIME_COST.approxOutputTokensPerMin;
    const expected = (inTok * REALTIME_COST.inputPerMillion + outTok * REALTIME_COST.outputPerMillion) / 1_000_000;
    expect(estimateSessionCost(180)).toBeCloseTo(expected, 10);
  });
});

describe('remainingSessionsToday（Phase 6.3/6.4 上限・二重計上防止）', () => {
  it('未使用なら日次上限そのもの', () => {
    expect(remainingSessionsToday(limits(), usage())).toBe(DEFAULT_USAGE_LIMITS.daily_max_sessions);
  });
  it('回数上限に達したら0（マイナスにしない）', () => {
    expect(remainingSessionsToday(limits({ daily_max_sessions: 3 }), usage({ sessionsCount: 3 }))).toBe(0);
    expect(remainingSessionsToday(limits({ daily_max_sessions: 3 }), usage({ sessionsCount: 5 }))).toBe(0);
  });
  it('時間上限に達したら回数が残っていても0（時間ガードが優先）', () => {
    const l = limits({ daily_max_sessions: 10, daily_max_seconds: 600 });
    expect(remainingSessionsToday(l, usage({ sessionsCount: 1, secondsUsed: 600 }))).toBe(0);
    expect(remainingSessionsToday(l, usage({ sessionsCount: 1, secondsUsed: 601 }))).toBe(0);
  });
  it('時間未達なら回数ベースの残数を返す', () => {
    const l = limits({ daily_max_sessions: 10, daily_max_seconds: 2700 });
    expect(remainingSessionsToday(l, usage({ sessionsCount: 4, secondsUsed: 600 }))).toBe(6);
  });
});

describe('learnerStats（Phase 5 管理集計・率の二重計上防止）', () => {
  it('自力とヒントは排他的にカウントされる（同一セッションを二重に数えない）', () => {
    const sessions = [
      session({ id: 'a', targetUsed: true, targetUsedIndependently: true }),   // self
      session({ id: 'b', targetUsed: true, targetUsedIndependently: false }),  // hint
      session({ id: 'c', targetUsed: false, targetUsedIndependently: false }), // none
    ];
    const st = learnerStats(sessions, []);
    expect(st.selfRate).toBeCloseTo(1 / 3, 5);
    expect(st.hintRate).toBeCloseTo(1 / 3, 5);
    // self と hint の合計は1を超えない（同一完了セッションを二重計上しない）
    expect(st.selfRate + st.hintRate).toBeLessThanOrEqual(1);
  });
  it('率は完了セッションのみを母数にする', () => {
    const sessions = [
      session({ id: 'a', completionStatus: 'completed', targetUsedIndependently: true }),
      session({ id: 'b', completionStatus: 'interrupted' }),
      session({ id: 'c', completionStatus: 'error' }),
    ];
    const st = learnerStats(sessions, []);
    expect(st.selfRate).toBe(1);          // 完了1件中1件が自力
    expect(st.interruptedCount).toBe(1);
    expect(st.errorCount).toBe(1);
    expect(st.totalSessions).toBe(3);
  });
  it('完了セッションが無ければ率は0（0除算しない）', () => {
    const st = learnerStats([session({ completionStatus: 'error' })], []);
    expect(st.selfRate).toBe(0);
    expect(st.hintRate).toBe(0);
    expect(st.zhRate).toBe(0);
  });
});
