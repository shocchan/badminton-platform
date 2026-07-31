import { describe, it, expect, beforeEach } from 'vitest';
import { createFoundationProgressRepository, FOUNDATION_STORAGE_KEY } from './foundationProgress';
import { recommendToday } from './foundationRecommend';
import type { FoundationUnitMeta } from './foundationRegistry';

const makeStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    _map: m,
  };
};

const META: FoundationUnitMeta[] = [
  { id: 'u1', titleJa: '単元1', titleZh: '单元1', level: 'N5', recommendedWeek: 1, estimatedMinutes: 6, prerequisiteUnitIds: [], review: 'draft' },
  { id: 'u2', titleJa: '単元2', titleZh: '单元2', level: 'N5', recommendedWeek: 2, estimatedMinutes: 8, prerequisiteUnitIds: ['u1'], review: 'draft' },
  { id: 'u3', titleJa: '単元3', titleZh: '单元3', level: 'N5', recommendedWeek: 3, estimatedMinutes: 8, prerequisiteUnitIds: ['u2'], review: 'draft' },
];

describe('SessionFoundationProgressRepository（§14）', () => {
  let storage: ReturnType<typeof makeStorage>;
  beforeEach(() => { storage = makeStorage(); });

  it('attempt開始→回答→完了→軸別集計・リロード相当でも復元される', () => {
    const repo = createFoundationProgressRepository(storage);
    const a = repo.startAttempt('u1', 'ja', '2026-07-26T09:00:00.000Z');
    repo.recordAnswer(a.attemptId, { questionId: 'q1', targetId: 'i1', dimension: 'reading', correct: true, errorTag: 'e1', attemptedAt: '2026-07-26T09:01:00.000Z' });
    // 別インスタンス＝リロード相当
    const repo2 = createFoundationProgressRepository(storage);
    const resumed = repo2.startAttempt('u1', 'ja');
    expect(resumed.attemptId).toBe(a.attemptId);
    expect(resumed.answers.length).toBe(1);
    repo2.recordAnswer(a.attemptId, { questionId: 'q2', targetId: 'i2', dimension: 'meaning', correct: false, errorTag: 'e2', attemptedAt: '2026-07-26T09:02:00.000Z' });
    repo2.completeAttempt(a.attemptId, '2026-07-26T09:03:00.000Z');
    const sum = repo2.getUnitSummary('u1');
    expect(sum).toMatchObject({ completedCount: 1, inProgress: false, lastScore: { correct: 1, total: 2 } });
  });

  it('同一質問の二重記録を防ぎ、完了後のattemptには追記できない', () => {
    const repo = createFoundationProgressRepository(storage);
    const a = repo.startAttempt('u1', 'ja');
    const ans = { questionId: 'q1', targetId: 'i1', dimension: 'reading' as const, correct: true, errorTag: 'e', attemptedAt: '2026-07-26T09:00:00.000Z' };
    repo.recordAnswer(a.attemptId, ans);
    repo.recordAnswer(a.attemptId, ans);
    repo.completeAttempt(a.attemptId);
    repo.recordAnswer(a.attemptId, { ...ans, questionId: 'q9' });
    expect(repo.getAttempts()[0].answers.length).toBe(1);
  });

  it('schemaVersion不一致・不正JSONは黙って破棄する', () => {
    storage.setItem(FOUNDATION_STORAGE_KEY, JSON.stringify({ schemaVersion: 99, attempts: [{ bogus: true }] }));
    expect(createFoundationProgressRepository(storage).getAttempts()).toEqual([]);
    storage.setItem(FOUNDATION_STORAGE_KEY, '{broken json');
    expect(createFoundationProgressRepository(storage).getAttempts()).toEqual([]);
    expect(storage._map.has(FOUNDATION_STORAGE_KEY)).toBe(false);
  });

  it('v1→v2移行: 完了済みattemptは維持・入力式を含み得る未完了attemptは安全に破棄（§20）', () => {
    const done = { attemptId: 'u1:1', unitId: 'u1', attemptNumber: 1, attemptSeed: 1, startedAt: '2026-07-20T09:00:00.000Z', completedAt: '2026-07-20T09:05:00.000Z', locale: 'ja', answers: [{ questionId: 'q1', targetId: 'i1', dimension: 'reading', correct: true, errorTag: 'e', attemptedAt: '2026-07-20T09:01:00.000Z' }] };
    const incomplete = { ...done, attemptId: 'u1:2', attemptNumber: 2, completedAt: null };
    storage.setItem(FOUNDATION_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, attempts: [done, incomplete] }));
    const repo = createFoundationProgressRepository(storage);
    const attempts = repo.getAttempts();
    expect(attempts.length).toBe(1);
    expect(attempts[0].attemptId).toBe('u1:1'); // 完了済みの結果は維持
    expect(JSON.parse(storage.getItem(FOUNDATION_STORAGE_KEY)!).schemaVersion).toBe(2);
  });

  it('「あとで確認」（skipped）は誤答と別管理でday3候補になる（§13）', () => {
    const repo = createFoundationProgressRepository(storage);
    const a = repo.startAttempt('u1', 'ja');
    repo.recordAnswer(a.attemptId, { questionId: 'q1', targetId: 'i-skip', dimension: 'meaning', correct: false, skipped: true, errorTag: 'e', attemptedAt: '2026-07-26T09:00:00.000Z' });
    repo.completeAttempt(a.attemptId);
    const entry = repo.getReviewQueue('2026-07-26T10:00:00.000Z').find((e) => e.targetId === 'i-skip')!;
    expect(entry.candidateState).toBe('due_day3');
    expect(entry.suggestedInterval).toBe('day3');
  });

  it('attemptSeedは attempt ごとに変わり得る・キーと保存内容にPIIを含まない', () => {
    const repo = createFoundationProgressRepository(storage);
    const a1 = repo.startAttempt('u1', 'ja');
    repo.completeAttempt(a1.attemptId);
    const a2 = repo.startAttempt('u1', 'ja');
    expect(a2.attemptSeed).not.toBe(a1.attemptSeed);
    const raw = storage.getItem(FOUNDATION_STORAGE_KEY)!;
    expect(FOUNDATION_STORAGE_KEY).not.toMatch(/email|user|nick/i);
    expect(raw).not.toMatch(/@|email|nickname/i);
  });

  it('locale変更（zhでの再開）でも進捗は維持される', () => {
    const repo = createFoundationProgressRepository(storage);
    const a = repo.startAttempt('u1', 'ja');
    repo.recordAnswer(a.attemptId, { questionId: 'q1', targetId: 'i1', dimension: 'reading', correct: true, errorTag: 'e', attemptedAt: '2026-07-26T09:00:00.000Z' });
    const resumed = createFoundationProgressRepository(storage).startAttempt('u1', 'zh');
    expect(resumed.answers.length).toBe(1);
  });

  it('復習キュー: day1/day3/day7/retainedとdue判定（保存時刻から算出・日付偽装なし）', () => {
    const repo = createFoundationProgressRepository(storage);
    const a = repo.startAttempt('u1', 'ja');
    const base = '2026-07-20T09:00:00.000Z';
    repo.recordAnswer(a.attemptId, { questionId: 'q1', targetId: 'i-wrong', dimension: 'reading', correct: false, errorTag: 'e1', attemptedAt: base });
    repo.recordAnswer(a.attemptId, { questionId: 'q2', targetId: 'i-hint', dimension: 'meaning', correct: true, hintUsed: true, errorTag: 'e2', attemptedAt: base });
    repo.recordAnswer(a.attemptId, { questionId: 'q3', targetId: 'i-self', dimension: 'form', correct: true, errorTag: 'e3', attemptedAt: base });
    repo.completeAttempt(a.attemptId, base);
    const b = repo.startAttempt('u1', 'ja');
    repo.recordAnswer(b.attemptId, { questionId: 'q3', targetId: 'i-self', dimension: 'form', correct: true, errorTag: 'e3', attemptedAt: '2026-07-27T09:00:00.000Z' });
    repo.completeAttempt(b.attemptId, '2026-07-27T09:00:00.000Z');
    const queue = repo.getReviewQueue('2026-07-26T00:00:00.000Z');
    const by = (id: string) => queue.find((e) => e.targetId === id)!;
    expect(by('i-wrong')).toMatchObject({ candidateState: 'due_day1', suggestedInterval: 'day1', isDue: true });
    expect(by('i-hint')).toMatchObject({ candidateState: 'due_day3', suggestedInterval: 'day3', isDue: true });
    expect(by('i-self')).toMatchObject({ candidateState: 'retained', suggestedInterval: null, isDue: false });
  });

  it('リセットはfoundation専用キーのみ削除（他キーへ触れない）', () => {
    storage.setItem('other_key', 'keep');
    const repo = createFoundationProgressRepository(storage);
    repo.startAttempt('u1', 'ja');
    repo.reset();
    expect(storage._map.has(FOUNDATION_STORAGE_KEY)).toBe(false);
    expect(storage.getItem('other_key')).toBe('keep');
  });
});

describe('今日の決定的推薦（§20）', () => {
  const emptySum = (id: string, over: Partial<{ completedCount: number; inProgress: boolean }> = {}) => ({
    unitId: id, attemptCount: 0, completedCount: over.completedCount ?? 0, inProgress: over.inProgress ?? false, lastCompletedAt: null, lastScore: null,
  });
  it('due復習が最優先', () => {
    const r = recommendToday(META, { u1: emptySum('u1'), u2: emptySum('u2'), u3: emptySum('u3') }, 3);
    expect(r.kind).toBe('review_due');
    expect(r.estimatedMinutes).toBeGreaterThan(0);
  });
  it('途中の単元→前提済み未着手→最初の未着手の順', () => {
    expect(recommendToday(META, { u1: emptySum('u1', { inProgress: true }), u2: emptySum('u2'), u3: emptySum('u3') }, 0))
      .toMatchObject({ kind: 'resume_unit', unitId: 'u1' });
    expect(recommendToday(META, { u1: emptySum('u1', { completedCount: 1 }), u2: emptySum('u2'), u3: emptySum('u3') }, 0))
      .toMatchObject({ kind: 'next_unit', unitId: 'u2' });
    expect(recommendToday(META, { u1: emptySum('u1'), u2: emptySum('u2'), u3: emptySum('u3') }, 0))
      .toMatchObject({ kind: 'first_unit', unitId: 'u1' });
  });
  it('全完了時は復習へ・推定時間は固定値からの決定的算出', () => {
    const done = { u1: emptySum('u1', { completedCount: 1 }), u2: emptySum('u2', { completedCount: 1 }), u3: emptySum('u3', { completedCount: 2 }) };
    expect(recommendToday(META, done, 0).kind).toBe('all_done_review');
    expect(recommendToday(META, done, 6)).toMatchObject({ kind: 'review_due', estimatedMinutes: 4 });
  });
});
