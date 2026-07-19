// Andyさん向けコースの受入テスト（vitest）
//
// 既存の courseEngine.test.ts はカリキュラム整合性と基本ロジックを見る。
// こちらは「完成版として渡す前に壊れていたら困る挙動」を、
// 復習スケジュールの実データ相当（日付を進めた ItemProgress）で検証する。
//
// 注意: RLS・RPC（ai_start_session / ai_redeem_invite など）はDB側の実装のため
// ここでは検証できない。それらは docs/ai-course-production-checklist.md の
// 手動確認項目として扱う。

import { describe, it, expect } from 'vitest';
import {
  selectDueReviews, buildLessonPlan, updateMasteryState, selectWeeklyPracticeItems,
  isWeeklyMission, missionById, courseEndDateISO, COURSE_TOTAL_DAYS,
} from './courseEngine';
import { isAiCourseRoute } from './courseRoutes';
import type { ItemProgress, Learner, LessonKind } from './types';

const iso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysFrom = (base: Date, n: number): Date => {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
};

const makeLearner = (over: Partial<Learner> = {}): Learner => ({
  id: 'L1', userId: 'U1', startedAtISO: null, displayName: 'Andy', preferredLanguage: 'zh',
  estimatedLevel: 'N3', difficultyLevel: 2, currentWeek: 1, isActive: true, hearing: {},
  settings: { zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null },
  adminOverrides: {}, ...over,
});

const progressOf = (over: Partial<ItemProgress> & { itemId: string }): ItemProgress => ({
  masteryState: 'initial', masteryScore: 0,
  firstLearnedAt: new Date().toISOString(), lastPracticedAt: new Date().toISOString(),
  nextReviewAt: null, reviewStage: 'none', successfulReviews: 0, failedReviews: 0,
  ...over,
});

// ────────────────────────────────────────────────
// 復習サイクル: 新規 → day1 → day3 → day7 → day30
// 日付を実際に進めながら、状態と次回予定を追跡する
// ────────────────────────────────────────────────
describe('review lifecycle (day1 → day3 → day7 → day30)', () => {
  const T0 = new Date('2026-08-01T09:00:00');
  const itemId = 'w01m1';

  it('新規完了で翌日に復習が予約される', () => {
    const p = updateMasteryState(null, itemId, { kind: 'new', usage: 'self', succeeded: true }, T0);
    expect(p.masteryState).toBe('used_independently');
    expect(p.reviewStage).toBe('day1');
    expect(p.nextReviewAt).toBe(iso(daysFrom(T0, 1)));
  });

  it('翌日になるとホームで復習が最優先で出る', () => {
    const p = updateMasteryState(null, itemId, { kind: 'new', usage: 'self', succeeded: true }, T0);
    const tomorrow = daysFrom(T0, 1);
    const due = selectDueReviews([p], tomorrow);
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('review_day1');

    const plan = buildLessonPlan(makeLearner(), [p], tomorrow);
    expect(plan).not.toBeNull();
    // 復習はウォームアップに置かれ、新規がメインになる（バランス配分）
    expect(plan!.review?.kind).toBe('review_day1');
    expect(plan!.reasonKey).toBe('due_review_plus_new');
  });

  it('day1成功で reviewed_day1 へ昇格し、次回が3日後になる', () => {
    const day1 = daysFrom(T0, 1);
    const p0 = progressOf({ itemId, masteryState: 'used_independently', reviewStage: 'day1', nextReviewAt: iso(day1) });
    const p1 = updateMasteryState(p0, itemId, { kind: 'review_day1', usage: 'self', succeeded: true }, day1);
    expect(p1.masteryState).toBe('reviewed_day1');
    expect(p1.reviewStage).toBe('day3');
    expect(p1.nextReviewAt).toBe(iso(daysFrom(day1, 3)));
    expect(p1.successfulReviews).toBe(1);
  });

  it('day1失敗では状態を昇格させず、再復習日が設定される', () => {
    const day1 = daysFrom(T0, 1);
    const p0 = progressOf({ itemId, masteryState: 'used_independently', reviewStage: 'day1', nextReviewAt: iso(day1) });
    const p1 = updateMasteryState(p0, itemId, { kind: 'review_day1', usage: 'none', succeeded: false }, day1);
    expect(p1.masteryState).toBe('used_independently'); // 昇格しない
    expect(p1.failedReviews).toBe(1);
    expect(p1.reviewStage).toBe('extra');
    expect(p1.nextReviewAt).toBe(iso(daysFrom(day1, 2)));
  });

  it('day3成功で reviewed_day3、day7成功で retained_day7 へ昇格する', () => {
    const day3 = daysFrom(T0, 4);
    const p1 = progressOf({ itemId, masteryState: 'reviewed_day1', reviewStage: 'day3', nextReviewAt: iso(day3) });
    const p2 = updateMasteryState(p1, itemId, { kind: 'review_day3', usage: 'self', succeeded: true }, day3);
    expect(p2.masteryState).toBe('reviewed_day3');
    expect(p2.reviewStage).toBe('day7');

    const day7 = daysFrom(day3, 7);
    const p3 = updateMasteryState(p2, itemId, { kind: 'review_day7', usage: 'self', succeeded: true }, day7);
    expect(p3.masteryState).toBe('retained_day7');
    expect(p3.reviewStage).toBe('day30');
    expect(p3.nextReviewAt).toBe(iso(daysFrom(day7, 30)));
  });

  it('day7成功後の30日後復習がスケジュールに接続されている', () => {
    const day7 = daysFrom(T0, 11);
    const p2 = progressOf({ itemId, masteryState: 'reviewed_day3', reviewStage: 'day7', nextReviewAt: iso(day7) });
    const p3 = updateMasteryState(p2, itemId, { kind: 'review_day7', usage: 'self', succeeded: true }, day7);

    const day30 = daysFrom(day7, 30);
    const due = selectDueReviews([p3], day30);
    expect(due).toHaveLength(1);
    expect(due[0].kind).toBe('review_day30');
  });

  it('day30成功で retained_day30 になり、以降は復習を予約しない', () => {
    const day30 = daysFrom(T0, 41);
    const p3 = progressOf({ itemId, masteryState: 'retained_day7', reviewStage: 'day30', nextReviewAt: iso(day30) });
    const p4 = updateMasteryState(p3, itemId, { kind: 'review_day30', usage: 'self', succeeded: true }, day30);
    expect(p4.masteryState).toBe('retained_day30');
    expect(p4.reviewStage).toBe('none');
    expect(p4.nextReviewAt).toBeNull();
    expect(selectDueReviews([p4], daysFrom(day30, 60))).toHaveLength(0);
  });

  it('day30失敗では retained_day7 を維持し、追加復習を予約する', () => {
    const day30 = daysFrom(T0, 41);
    const p3 = progressOf({ itemId, masteryState: 'retained_day7', reviewStage: 'day30', nextReviewAt: iso(day30) });
    const p4 = updateMasteryState(p3, itemId, { kind: 'review_day30', usage: 'none', succeeded: false }, day30);
    expect(p4.masteryState).toBe('retained_day7'); // 未学習へ戻さない
    expect(p4.reviewStage).toBe('extra');
    expect(p4.nextReviewAt).toBe(iso(daysFrom(day30, 2)));
  });

  it('状態は誤って降格しない（低い結果でも維持される）', () => {
    const p = progressOf({ itemId, masteryState: 'retained_day7' });
    const after = updateMasteryState(p, itemId, { kind: 'new', usage: 'none', succeeded: false }, T0);
    expect(after.masteryState).toBe('retained_day7');
  });

  it('30日後復習がコース期間を越える項目には予約しない', () => {
    const start = new Date('2026-08-01T00:00:00');
    const learner = makeLearner({ startedAtISO: start.toISOString() });
    const courseEnd = courseEndDateISO(learner);
    expect(courseEnd).toBe(iso(daysFrom(start, COURSE_TOTAL_DAYS)));

    // コース終了10日前に day7 を成功 → 30日後はコース期間外
    const late = daysFrom(start, COURSE_TOTAL_DAYS - 10);
    const p2 = progressOf({ itemId, masteryState: 'reviewed_day3', reviewStage: 'day7' });
    const p3 = updateMasteryState(p2, itemId, { kind: 'review_day7', usage: 'self', succeeded: true }, late, courseEnd);
    expect(p3.masteryState).toBe('retained_day7');
    expect(p3.reviewStage).toBe('none');
    expect(p3.nextReviewAt).toBeNull();

    // コース序盤なら通常どおり30日後を予約する
    const early = daysFrom(start, 5);
    const p3b = updateMasteryState(p2, itemId, { kind: 'review_day7', usage: 'self', succeeded: true }, early, courseEnd);
    expect(p3b.reviewStage).toBe('day30');
  });
});

// ────────────────────────────────────────────────
// 復習の優先順位（§8）
// ────────────────────────────────────────────────
describe('review prioritisation', () => {
  const NOW = new Date('2026-09-01T09:00:00');

  it('期限超過の復習が最優先になる', () => {
    const overdue = progressOf({
      itemId: 'w01m2', masteryState: 'reviewed_day1',
      reviewStage: 'day3', nextReviewAt: iso(daysFrom(NOW, -5)),
    });
    const dueToday = progressOf({
      itemId: 'w01m1', masteryState: 'used_independently',
      reviewStage: 'day1', nextReviewAt: iso(NOW),
    });
    const due = selectDueReviews([dueToday, overdue], NOW);
    expect(due[0].progress.itemId).toBe('w01m2');
    expect(due[0].overdue).toBe(true);

    const plan = buildLessonPlan(makeLearner(), [dueToday, overdue], NOW);
    expect(plan!.reasonKey).toBe('overdue_review');
    expect(plan!.main.mission.id).toBe('w01m2');
  });

  it('複数の期限超過は、より古いステージ順で並ぶ', () => {
    const items = [
      progressOf({ itemId: 'w01m3', masteryState: 'reviewed_day3', reviewStage: 'day7', nextReviewAt: iso(daysFrom(NOW, -2)) }),
      progressOf({ itemId: 'w01m1', masteryState: 'used_independently', reviewStage: 'day1', nextReviewAt: iso(daysFrom(NOW, -3)) }),
      progressOf({ itemId: 'w01m2', masteryState: 'reviewed_day1', reviewStage: 'day3', nextReviewAt: iso(daysFrom(NOW, -1)) }),
    ];
    const due = selectDueReviews(items, NOW);
    expect(due.map((d) => d.progress.reviewStage)).toEqual(['day1', 'day3', 'day7']);
  });

  it('復習があっても新規ミッションが完全には消えない', () => {
    const dueToday = progressOf({
      itemId: 'w01m1', masteryState: 'used_independently',
      reviewStage: 'day1', nextReviewAt: iso(NOW),
    });
    const plan = buildLessonPlan(makeLearner(), [dueToday], NOW);
    expect(plan!.main.kind).toBe('new');       // メインは新規
    expect(plan!.review?.kind).toBe('review_day1'); // 復習はウォームアップ
  });

  it('未来の復習はまだ出さない', () => {
    const future = progressOf({
      itemId: 'w01m1', masteryState: 'used_independently',
      reviewStage: 'day1', nextReviewAt: iso(daysFrom(NOW, 3)),
    });
    expect(selectDueReviews([future], NOW)).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────
// 週間総合実践（§9）
// ────────────────────────────────────────────────
describe('weekly practice', () => {
  it('各週の5番目が週間総合実践として判定される', () => {
    for (let w = 1; w <= 12; w++) {
      const m5 = missionById(`w${String(w).padStart(2, '0')}m5`);
      expect(m5, `week ${w} order 5`).toBeDefined();
      expect(isWeeklyMission(m5!)).toBe(true);
      const m1 = missionById(`w${String(w).padStart(2, '0')}m1`);
      expect(isWeeklyMission(m1!)).toBe(false);
    }
  });

  it('週の5番目に到達すると weekly_practice 種別のプランになる', () => {
    // 週1の1〜4を学習済みにする
    const progresses = [1, 2, 3, 4].map((o) =>
      progressOf({ itemId: `w01m${o}`, masteryState: 'used_independently' }));
    const plan = buildLessonPlan(makeLearner(), progresses, new Date('2026-09-01T09:00:00'));
    expect(plan!.main.mission.id).toBe('w01m5');
    expect(plan!.main.kind).toBe<LessonKind>('weekly_practice');
  });

  it('週間総合実践では目標表現名を先に見せない', () => {
    const progresses = [1, 2, 3, 4].map((o) =>
      progressOf({ itemId: `w01m${o}`, masteryState: 'used_independently' }));
    const plan = buildLessonPlan(makeLearner(), progresses, new Date('2026-09-01T09:00:00'));
    expect(plan!.main.hideTarget).toBe(true);
  });

  it('扱う表現は2〜4個に収まる', () => {
    const progresses = [1, 2, 3, 4].map((o) =>
      progressOf({ itemId: `w01m${o}`, masteryState: 'used_independently' }));
    const picked = selectWeeklyPracticeItems(1, progresses);
    expect(picked.length).toBeGreaterThanOrEqual(2);
    expect(picked.length).toBeLessThanOrEqual(4);
    expect(picked.every((m) => m.week === 1 && m.order < 5)).toBe(true);
  });

  it('苦手な表現（失敗が多い・状態が低い）が優先される', () => {
    const progresses = [
      progressOf({ itemId: 'w01m1', masteryState: 'retained_day7' }),
      progressOf({ itemId: 'w01m2', masteryState: 'understood', failedReviews: 3 }),
      progressOf({ itemId: 'w01m3', masteryState: 'reviewed_day3' }),
      progressOf({ itemId: 'w01m4', masteryState: 'used_with_hint', failedReviews: 1 }),
    ];
    const picked = selectWeeklyPracticeItems(1, progresses);
    // 最も弱い w01m2 が先頭、最も定着している w01m1 は後ろ（または除外）
    expect(picked[0].id).toBe('w01m2');
    expect(picked[picked.length - 1].id).not.toBe('w01m2');
  });

  it('プランに週の対象表現が添えられる', () => {
    const progresses = [1, 2, 3, 4].map((o) =>
      progressOf({ itemId: `w01m${o}`, masteryState: 'used_independently' }));
    const plan = buildLessonPlan(makeLearner(), progresses, new Date('2026-09-01T09:00:00'));
    expect(plan!.main.weeklyTargets).toBeDefined();
    expect(plan!.main.weeklyTargets!.length).toBeGreaterThanOrEqual(2);
  });
});

// ────────────────────────────────────────────────
// ルート別ヘッダー表示（§4）
// ────────────────────────────────────────────────
describe('AI course route detection', () => {
  it('AIコース配下では通常会員ヘッダーを出さない', () => {
    expect(isAiCourseRoute('/ja/ai-course')).toBe(true);
    expect(isAiCourseRoute('/zh/ai-course')).toBe(true);
    expect(isAiCourseRoute('/ja/ai-course/admin')).toBe(true);
    expect(isAiCourseRoute('/zh/ai-course/admin')).toBe(true);
  });

  it('通常会員ページには影響しない', () => {
    for (const p of ['/ja/', '/ja/mypage', '/ja/activity', '/zh/join', '/ja/admin', '/ja/ai-lesson-demo']) {
      expect(isAiCourseRoute(p), p).toBe(false);
    }
  });
});

// ────────────────────────────────────────────────
// 旧データ互換（§20）
// ────────────────────────────────────────────────
describe('backward compatibility', () => {
  it('reviewStage が none の古い進捗は復習対象にならない', () => {
    const legacy = progressOf({ itemId: 'w01m1', masteryState: 'used_independently', nextReviewAt: '2026-01-01' });
    expect(selectDueReviews([legacy], new Date('2026-09-01'))).toHaveLength(0);
  });

  it('未知のミッションIDを含む進捗があっても落ちない', () => {
    const orphan = progressOf({
      itemId: 'removed-mission', masteryState: 'used_independently',
      reviewStage: 'day1', nextReviewAt: '2026-01-01',
    });
    expect(() => selectDueReviews([orphan], new Date('2026-09-01'))).not.toThrow();
    expect(selectDueReviews([orphan], new Date('2026-09-01'))).toHaveLength(0);
  });

  it('開始日が無い learner でもコース終了日計算で落ちない', () => {
    expect(courseEndDateISO(makeLearner({ startedAtISO: null }))).toBeNull();
    expect(courseEndDateISO(makeLearner({ startedAtISO: 'not-a-date' }))).toBeNull();
  });
});
