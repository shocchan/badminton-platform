// 学習記録→復習の計画層の検証（今日の復習抽出・優先度・分類・重複除外）。
import { describe, it, expect } from 'vitest';
import { buildReviewPlan } from './courseReviewPlan';
import { COURSE_MISSIONS } from './courseData';
import type { CourseSessionRecord, ItemProgress } from './types';

const m1 = COURSE_MISSIONS[0].id;
const m2 = COURSE_MISSIONS[1].id;
const m3 = COURSE_MISSIONS[2].id;
const NOW = new Date('2026-09-10T09:00:00');

const prog = (over: Partial<ItemProgress> & { itemId: string }): ItemProgress => ({
  masteryState: 'used_independently', masteryScore: 0,
  firstLearnedAt: '2026-09-01', lastPracticedAt: '2026-09-08',
  nextReviewAt: null, reviewStage: 'none', successfulReviews: 0, failedReviews: 0, ...over,
});
const sess = (over: Partial<CourseSessionRecord> & { id: string; missionId: string }): CourseSessionRecord => ({
  mode: 'voice', lessonKind: 'new', difficulty: 2, startedAt: '2026-09-08T09:00:00Z', endedAt: null,
  durationSeconds: 180, completionStatus: 'completed', endReason: 'timeout', targetExpression: 'x',
  targetUsed: true, targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false,
  errorCode: null, estimatedCostUsd: 0, report: null, ...over,
});

describe('buildReviewPlan: 今日の復習', () => {
  it('期限到来（nextReviewAt<=today）の表現を今日の復習に入れる', () => {
    const plan = buildReviewPlan([
      prog({ itemId: m1, reviewStage: 'day1', nextReviewAt: '2026-09-10' }),   // due today
      prog({ itemId: m2, reviewStage: 'day3', nextReviewAt: '2026-09-05' }),   // overdue
      prog({ itemId: m3, reviewStage: 'day7', nextReviewAt: '2026-09-20' }),   // future
    ], [], [], NOW);
    const ids = plan.today.map((i) => i.missionId);
    expect(ids).toContain(m1);
    expect(ids).toContain(m2);
    expect(ids).not.toContain(m3);
  });

  it('期限切れ(overdue)が期限当日(due)より優先される', () => {
    const plan = buildReviewPlan([
      prog({ itemId: m1, reviewStage: 'day1', nextReviewAt: '2026-09-10' }),
      prog({ itemId: m2, reviewStage: 'day3', nextReviewAt: '2026-09-05' }),
    ], [], [], NOW);
    expect(plan.today[0].missionId).toBe(m2); // overdue 先頭
    expect(plan.today[0].reasons).toContain('overdue');
  });

  it('期限が無くても、ヒント多用/自力未達を今日の復習に補充する', () => {
    const plan = buildReviewPlan([
      prog({ itemId: m1, masteryState: 'used_with_hint' }), // 自力未達
    ], [sess({ id: 's1', missionId: m1, targetUsedIndependently: false, targetUsed: true })], [], NOW);
    expect(plan.today.map((i) => i.missionId)).toContain(m1);
    expect(plan.today[0].reasons.some((r) => r === 'notIndependent' || r === 'hint')).toBe(true);
  });

  it('同じ表現を今日の復習に重複表示しない', () => {
    const plan = buildReviewPlan([
      prog({ itemId: m1, masteryState: 'used_with_hint', reviewStage: 'day1', nextReviewAt: '2026-09-05' }),
    ], [sess({ id: 's1', missionId: m1 })], [m1], NOW);
    const ids = plan.today.map((i) => i.missionId);
    expect(ids.filter((x) => x === m1).length).toBe(1);
  });

  it('復習対象が無ければ today は空・estMinutes=0', () => {
    const plan = buildReviewPlan([
      prog({ itemId: m1, masteryState: 'retained_day30' }),
    ], [sess({ id: 's1', missionId: m1, targetUsedIndependently: true })], [], NOW);
    expect(plan.today).toEqual([]);
    expect(plan.estMinutes).toBe(0);
  });

  it('estMinutes は今日の件数に応じる（3件→約2分）', () => {
    const plan = buildReviewPlan([
      prog({ itemId: m1, reviewStage: 'day1', nextReviewAt: '2026-09-10' }),
      prog({ itemId: m2, reviewStage: 'day1', nextReviewAt: '2026-09-10' }),
      prog({ itemId: m3, reviewStage: 'day1', nextReviewAt: '2026-09-10' }),
    ], [], [], NOW);
    expect(plan.estMinutes).toBe(2);
  });
});

describe('buildReviewPlan: 分類', () => {
  it('未来予定は「復習待ち」に入る', () => {
    const plan = buildReviewPlan([prog({ itemId: m3, reviewStage: 'day7', nextReviewAt: '2026-09-20' })], [], [], NOW);
    expect(plan.waiting.map((i) => i.missionId)).toContain(m3);
    expect(plan.today.map((i) => i.missionId)).not.toContain(m3);
  });

  it('「もう一度」選択は practiceAgain に入り reason を持つ', () => {
    const plan = buildReviewPlan([prog({ itemId: m1, masteryState: 'retained_day7' })], [sess({ id: 's1', missionId: m1 })], [m1], NOW);
    expect(plan.practiceAgain.map((i) => i.missionId)).toContain(m1);
    expect(plan.practiceAgain[0].reasons).toContain('practiceAgain');
  });

  it('all は完了セッション単位・最新の sessionId を各 item が持つ（復習ノートを開ける）', () => {
    const plan = buildReviewPlan(
      [prog({ itemId: m1 })],
      [sess({ id: 's-old', missionId: m1, startedAt: '2026-09-01T09:00:00Z' }), sess({ id: 's-new', missionId: m1, startedAt: '2026-09-08T09:00:00Z' })],
      [], NOW);
    expect(plan.all.length).toBe(2);
    // today の item は最新セッション s-new に紐づく
    const it = plan.recent.find((i) => i.missionId === m1);
    expect(it?.sessionId).toBe('s-new');
  });

  it('未完了セッションは all に含めない', () => {
    const plan = buildReviewPlan([], [sess({ id: 's1', missionId: m1, completionStatus: 'interrupted' })], [], NOW);
    expect(plan.all).toEqual([]);
  });
});
