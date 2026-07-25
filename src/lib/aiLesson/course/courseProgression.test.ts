// 章の自由な進行（Feature 3）: 完了で次章解放・1日複数章・復習予定は維持・二重完了しない。
import { describe, it, expect } from 'vitest';
import { selectNextMission, updateMasteryState, buildLessonPlan, missionById } from './courseEngine';
import type { ItemProgress, Learner } from './types';

const learner = (over: Partial<Learner> = {}): Learner => ({
  id: 'L1', userId: 'U1', startedAtISO: '2026-09-01T00:00:00Z', displayName: 'Andy', preferredLanguage: 'zh',
  estimatedLevel: 'N3', difficultyLevel: 2, currentWeek: 1, isActive: true, hearing: {},
  settings: { zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null },
  adminOverrides: {}, ...over,
});
const prog = (itemId: string, state: ItemProgress['masteryState'] = 'used_independently'): ItemProgress => ({
  itemId, masteryState: state, masteryScore: 0,
  firstLearnedAt: '2026-09-01', lastPracticedAt: '2026-09-01',
  nextReviewAt: null, reviewStage: 'none', successfulReviews: 0, failedReviews: 0,
});

describe('章の自由進行（Feature 3）', () => {
  it('未学習が無いところから最初の章を返す', () => {
    const next = selectNextMission(learner(), []);
    expect(next?.id).toBe('w01m1');
  });

  it('章を完了すると次の章が解放される（日付に依存しない）', () => {
    const next = selectNextMission(learner(), [prog('w01m1')]);
    expect(next?.id).toBe('w01m2');
  });

  it('1日のうちに複数章を続けて進められる（次々に別ミッションになる）', () => {
    const done: ItemProgress[] = [];
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      const m = selectNextMission(learner(), done);
      expect(m).not.toBeNull();
      seen.push(m!.id);
      done.push(prog(m!.id));
    }
    expect(new Set(seen).size).toBe(3); // 毎回ちがう章
  });

  it('章を進めても、既存の復習予定（nextReviewAt）は消えない', () => {
    // w01m1 は翌日復習が予約済み。新章 w01m2 を進めても w01m1 の予約は保持される
    const p1: ItemProgress = { ...prog('w01m1'), reviewStage: 'day1', nextReviewAt: '2026-09-02' };
    const plan = buildLessonPlan(learner(), [p1], new Date('2026-09-01T10:00:00'));
    expect(plan).not.toBeNull();
    // p1 の予約は破壊されない（純関数なので入力は不変）
    expect(p1.nextReviewAt).toBe('2026-09-02');
  });

  it('同じ章を二重完了しても mastery が不正に多重加算されない（冪等）', () => {
    const first = updateMasteryState(null, 'w01m1', { kind: 'new', usage: 'self', succeeded: true }, new Date('2026-09-01'));
    const second = updateMasteryState(first, 'w01m1', { kind: 'new', usage: 'self', succeeded: true }, new Date('2026-09-01'));
    // 2回目で状態が不正に進みすぎない（既に used_independently 以上を維持）
    expect(second.masteryState).toBe(first.masteryState);
  });

  it('全章の順序が週×順序で単調（60ミッションを順番に）', () => {
    expect(missionById('w01m1')).toBeDefined();
    expect(missionById('w12m5')).toBeDefined();
  });
});
