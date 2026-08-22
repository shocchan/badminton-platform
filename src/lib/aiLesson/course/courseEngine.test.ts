// カリキュラム整合性 + 学習エンジンの自動テスト（vitest）
// 実行: npx vitest run
import { describe, it, expect } from 'vitest';
import { COURSE_MISSIONS, COURSE_WEEKS } from './courseData';
import {
  selectDueReviews, calculateWeakItems, selectNextMission, buildLessonPlan,
  updateMasteryState, adjustDifficulty, missionById,
} from './courseEngine';
import type { CourseSessionRecord, ItemProgress, Learner } from './types';

const REQUIRED_FIELDS: (keyof typeof COURSE_MISSIONS[number])[] = [
  'id', 'week', 'order', 'titleJa', 'titleZh', 'category', 'difficulty', 'targetExpression',
  'targetExpressionReading', 'meaningJa', 'meaningZh', 'usageNotesJa', 'usageNotesZh',
  'naturalExample', 'simpleExample', 'commonMistakes', 'openingQuestion', 'followUpQuestions',
  'hintLevels', 'chineseSupport', 'correctionPriority', 'completionCriteria', 'reviewPrompts',
  'alternateScenes', 'requiredPreviousItems', 'estimatedMinutes', 'isPublished', 'curriculumVersion',
];

const makeLearner = (over: Partial<Learner> = {}): Learner => ({
  id: 'L1', userId: 'U1', startedAtISO: null, displayName: 'Andy', preferredLanguage: 'zh', estimatedLevel: 'N3',
  difficultyLevel: 2, currentWeek: 1, isActive: true, hearing: {},
  settings: { zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null },
  adminOverrides: {}, ...over,
});

describe('curriculum integrity', () => {
  // 2026-08-23: 上級パート（第13〜18週・30本）を足したので固定値をやめた。
  // 意図は「教材が減っていないこと」なので、基礎60本が丸ごと残っているかを見る
  it('基礎60本（第1〜12週）が減っていない', () => {
    expect(COURSE_MISSIONS.filter((m) => m.week <= 12).length).toBe(60);
    expect(COURSE_MISSIONS.length).toBeGreaterThanOrEqual(60);
  });
  it('基礎12週が定義されている', () => {
    expect(COURSE_WEEKS.filter((w) => w.week <= 12).length).toBe(12);
    expect(COURSE_WEEKS.length).toBeGreaterThanOrEqual(12);
  });
  it('has no duplicate ids', () => {
    const ids = COURSE_MISSIONS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('covers week 1..12 with order 1..5 each (no gaps)', () => {
    for (let w = 1; w <= 12; w++) {
      const orders = COURSE_MISSIONS.filter((m) => m.week === w).map((m) => m.order).sort();
      expect(orders).toEqual([1, 2, 3, 4, 5]);
    }
  });
  it('has no missing required fields', () => {
    for (const m of COURSE_MISSIONS) {
      for (const f of REQUIRED_FIELDS) {
        expect(m[f], `${m.id}.${String(f)}`).toBeDefined();
      }
      expect(m.hintLevels.length).toBeGreaterThanOrEqual(6);
      expect(m.followUpQuestions.length).toBeGreaterThan(0);
      expect(m.commonMistakes.length).toBeGreaterThan(0);
      expect(m.detect.length).toBeGreaterThan(0);
    }
  });
  it('requiredPreviousItems reference existing missions', () => {
    for (const m of COURSE_MISSIONS) {
      for (const req of m.requiredPreviousItems) {
        expect(missionById(req), `${m.id} requires ${req}`).toBeTruthy();
      }
    }
  });
  it('detect patterns are valid regex', () => {
    for (const m of COURSE_MISSIONS) {
      expect(() => new RegExp(m.detect)).not.toThrow();
    }
  });
});

describe('selectNextMission', () => {
  it('returns first mission when no progress', () => {
    const next = selectNextMission(makeLearner(), []);
    expect(next?.id).toBe('w01m1');
  });
  it('skips learned missions', () => {
    const progress: ItemProgress[] = [{
      itemId: 'w01m1', masteryState: 'understood', masteryScore: 0.35,
      firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: null, reviewStage: 'none',
      successfulReviews: 0, failedReviews: 0,
    }];
    expect(selectNextMission(makeLearner(), progress)?.id).toBe('w01m2');
  });
  it('respects admin override', () => {
    const learner = makeLearner({ adminOverrides: { nextMissionId: 'w05m1' } });
    expect(selectNextMission(learner, [])?.id).toBe('w05m1');
  });
  it('does not offer a mission whose prerequisites are unmet', () => {
    // w01m5 requires w01m1..4; with none learned it must not be picked before them
    const next = selectNextMission(makeLearner(), []);
    expect(next?.id).not.toBe('w01m5');
  });
});

describe('review scheduling and mastery', () => {
  const base = new Date('2026-07-18T09:00:00');
  it('new lesson sets day1 review for tomorrow', () => {
    const p = updateMasteryState(null, 'w03m1', { kind: 'new', usage: 'self', succeeded: true }, base);
    expect(p.masteryState).toBe('used_independently');
    expect(p.reviewStage).toBe('day1');
    expect(p.nextReviewAt).toBe('2026-07-19');
  });
  it('does not downgrade state', () => {
    const prev: ItemProgress = {
      itemId: 'w03m1', masteryState: 'used_independently', masteryScore: 0.65,
      firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: '2026-07-19', reviewStage: 'day1',
      successfulReviews: 0, failedReviews: 0,
    };
    const p = updateMasteryState(prev, 'w03m1', { kind: 'new', usage: 'none', succeeded: true }, base);
    expect(p.masteryState).toBe('used_independently'); // stays, not back to 'understood'
  });
  it('failed review reschedules without promoting', () => {
    const prev: ItemProgress = {
      itemId: 'w03m1', masteryState: 'reviewed_day1', masteryScore: 0.75,
      firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: '2026-07-18', reviewStage: 'day3',
      successfulReviews: 1, failedReviews: 0,
    };
    const p = updateMasteryState(prev, 'w03m1', { kind: 'review_day3', usage: 'none', succeeded: false }, base);
    expect(p.masteryState).toBe('reviewed_day1'); // not promoted
    expect(p.failedReviews).toBe(1);
    expect(p.reviewStage).toBe('extra');
    expect(p.nextReviewAt).toBe('2026-07-20'); // +2 days
  });
  it('successful day7 review reaches retained_day7', () => {
    const prev: ItemProgress = {
      itemId: 'w03m1', masteryState: 'reviewed_day3', masteryScore: 0.85,
      firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: '2026-07-18', reviewStage: 'day7',
      successfulReviews: 2, failedReviews: 0,
    };
    const p = updateMasteryState(prev, 'w03m1', { kind: 'review_day7', usage: 'self', succeeded: true }, base);
    expect(p.masteryState).toBe('retained_day7');
    expect(p.reviewStage).toBe('day30');
  });
  it('overdue reviews are prioritized', () => {
    const progresses: ItemProgress[] = [
      { itemId: 'w01m1', masteryState: 'reviewed_day1', masteryScore: 0.75, firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: '2026-07-10', reviewStage: 'day3', successfulReviews: 1, failedReviews: 0 },
      { itemId: 'w01m2', masteryState: 'understood', masteryScore: 0.35, firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: '2026-07-18', reviewStage: 'day1', successfulReviews: 0, failedReviews: 0 },
    ];
    const due = selectDueReviews(progresses, base);
    expect(due[0].mission.id).toBe('w01m1');
    expect(due[0].overdue).toBe(true);
  });
});

describe('buildLessonPlan', () => {
  const base = new Date('2026-07-18T09:00:00');
  it('gives a plain new mission when nothing is due', () => {
    const plan = buildLessonPlan(makeLearner(), [], base);
    expect(plan?.main.kind).toBe('new');
    expect(plan?.reasonKey).toBe('next_new');
  });
  it('pairs a due review with a new mission (balance)', () => {
    const progresses: ItemProgress[] = [
      { itemId: 'w01m1', masteryState: 'used_independently', masteryScore: 0.65, firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: '2026-07-18', reviewStage: 'day1', successfulReviews: 0, failedReviews: 0 },
    ];
    const plan = buildLessonPlan(makeLearner(), progresses, base);
    expect(plan?.review?.mission.id).toBe('w01m1');
    expect(plan?.main.kind).toBe('new');
  });
  it('hides target on day7 review', () => {
    const progresses: ItemProgress[] = [
      { itemId: 'w01m1', masteryState: 'reviewed_day3', masteryScore: 0.85, firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: '2026-07-10', reviewStage: 'day7', successfulReviews: 2, failedReviews: 0 },
    ];
    const plan = buildLessonPlan(makeLearner(), progresses, base);
    expect(plan?.main.kind).toBe('review_day7');
    expect(plan?.main.hideTarget).toBe(true);
  });
});

describe('adjustDifficulty', () => {
  const mkSession = (indep: boolean): CourseSessionRecord => ({
    id: 's', missionId: 'w01m1', mode: 'voice', lessonKind: 'new', difficulty: 2,
    startedAt: '', endedAt: '', durationSeconds: 180, completionStatus: 'completed',
    endReason: 'completed', targetExpression: 'x', targetUsed: indep, targetUsedIndependently: indep,
    hintsUsed: 0, chineseSupportUsed: false, errorCode: null, estimatedCostUsd: 0, report: null,
  });
  it('does not change on a single result', () => {
    expect(adjustDifficulty(2, [mkSession(false)]).changed).toBe(false);
  });
  it('raises after consistent independent success', () => {
    const r = adjustDifficulty(2, [mkSession(true), mkSession(true)]);
    expect(r.direction).toBe('up');
    expect(r.level).toBe(3);
  });
  it('lowers after consistent failure', () => {
    const r = adjustDifficulty(3, [mkSession(false), mkSession(false)]);
    expect(r.direction).toBe('down');
    expect(r.level).toBe(2);
  });
  it('never goes below 1 or above 5', () => {
    expect(adjustDifficulty(1, [mkSession(false), mkSession(false)]).level).toBe(1);
    expect(adjustDifficulty(5, [mkSession(true), mkSession(true)]).level).toBe(5);
  });
});

describe('calculateWeakItems', () => {
  it('lists learned-but-not-independent items by failure count', () => {
    const progresses: ItemProgress[] = [
      { itemId: 'w01m1', masteryState: 'used_with_hint', masteryScore: 0.5, firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: null, reviewStage: 'none', successfulReviews: 0, failedReviews: 2 },
      { itemId: 'w01m2', masteryState: 'used_independently', masteryScore: 0.65, firstLearnedAt: '', lastPracticedAt: '', nextReviewAt: null, reviewStage: 'none', successfulReviews: 1, failedReviews: 0 },
    ];
    const weak = calculateWeakItems(progresses);
    expect(weak.map((w) => w.itemId)).toEqual(['w01m1']);
  });
});
