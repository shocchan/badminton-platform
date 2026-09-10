/*
 * 自分で選べる話す場面（2026-09-10 CEO要望「AI会話の中に話す場面を選べるように」）。
 *
 * いちばん守りたいこと:
 *  - **並べたものは必ず開始できる**（前提を満たさない場面を並べて、選んでから断らない）
 *  - 選んだ場面が、実際に話す場面になる（一覧だけ変えて中身が変わらない、をしない）
 *  - 先生の指定（adminOverrides）を学習者が上書きできない
 */
import { describe, it, expect } from 'vitest';
import { selectMissionCandidates, selectNextMission, missionById } from './courseEngine';
import type { Learner, ItemProgress } from './types';

const learner = (over: Partial<Learner> = {}): Learner => ({
  id: 'L1', userId: 'U1', startedAtISO: null, displayName: 'テスト', preferredLanguage: 'zh',
  estimatedLevel: 'N3', difficultyLevel: 2, currentWeek: 1, isActive: true, hearing: {},
  settings: { zhSupport: 'whenStuck', correction: 'summary', weeklyTarget: 5, sessionMinutes: 3, examDateISO: null },
  adminOverrides: {}, ...over,
});

const progressFor = (ids: string[]): ItemProgress[] => ids.map((itemId) => ({
  itemId, masteryState: 'initial' as const, masteryScore: 20,
  firstLearnedAt: '2026-01-01T00:00:00.000Z', lastPracticedAt: '2026-01-01T00:00:00.000Z',
  nextReviewAt: null, reviewStage: 'none', successfulReviews: 1, failedReviews: 0,
}));

describe('selectMissionCandidates', () => {
  it('候補を複数返す', () => {
    const c = selectMissionCandidates(learner(), []);
    expect(c.length).toBeGreaterThan(1);
  });

  it('**先頭は、選ばなかったときに出る場面と同じ**（迷ったら上でいい、が本当になる）', () => {
    const l = learner();
    const auto = selectNextMission(l, []);
    const c = selectMissionCandidates(l, []);
    expect(c[0]?.id).toBe(auto?.id);
  });

  it('並べたものはすべて前提を満たしている＝選べば必ず始められる', () => {
    const done = ['w01m1'];
    const c = selectMissionCandidates(learner(), progressFor(done));
    for (const m of c) {
      expect(m.isPublished, m.id).toBe(true);
      for (const req of m.requiredPreviousItems) {
        expect(done, `${m.id} の前提 ${req} が未習得なのに並んでいる`).toContain(req);
      }
    }
  });

  it('学習済みの場面は「新しい場面」として並べない', () => {
    const c0 = selectMissionCandidates(learner(), []);
    const first = c0[0]!.id;
    const c1 = selectMissionCandidates(learner(), progressFor([first]));
    expect(c1.map((m) => m.id)).not.toContain(first);
  });

  it('件数の上限を守る', () => {
    expect(selectMissionCandidates(learner(), [], 3).length).toBeLessThanOrEqual(3);
  });
});

describe('選んだ場面が実際に使われる', () => {
  it('forcedMissionId を渡すと、その場面になる', () => {
    const c = selectMissionCandidates(learner(), []);
    const pick = c[1] ?? c[0]!;
    const got = selectNextMission(learner(), [], { forcedMissionId: pick.id });
    expect(got?.id).toBe(pick.id);
  });

  it('**先生の指定のほうが強い**（学習者が上書きできない）', () => {
    const c = selectMissionCandidates(learner(), []);
    const teacherPick = c[c.length - 1]!;
    const learnerPick = c[0]!;
    const got = selectNextMission(
      learner({ adminOverrides: { nextMissionId: teacherPick.id } }),
      [], { forcedMissionId: learnerPick.id },
    );
    expect(got?.id).toBe(teacherPick.id);
  });

  it('知らないIDを渡されても落ちない（通常の選択に戻る）', () => {
    const got = selectNextMission(learner(), [], { forcedMissionId: 'no-such-mission' });
    expect(got).not.toBe(null);
    expect(missionById('no-such-mission')).toBeFalsy();
  });
});
