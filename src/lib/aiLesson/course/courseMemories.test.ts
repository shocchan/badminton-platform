import { describe, it, expect } from 'vitest';
import { deriveCourseMemories } from './courseMemories';
import { missionById } from './courseEngine';
import type { CourseSessionRecord } from './types';

const sess = (id: string, over: Partial<CourseSessionRecord> = {}): CourseSessionRecord => ({
  id, missionId: 'w01m1', mode: 'text', lessonKind: 'new', difficulty: 2,
  startedAt: '2026-06-01T10:00:00Z', endedAt: null, durationSeconds: 180,
  completionStatus: 'completed', endReason: null, targetExpression: '〜ので',
  targetUsed: true, targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false,
  errorCode: null, estimatedCostUsd: 0, report: null,
  ...over,
} as CourseSessionRecord);
const NOW = new Date('2026-07-26T00:00:00Z');

describe('思い出アルバム判定（決定的・未達成は出さない・偽造なし）', () => {
  it('completed以外・不正日付・不明ミッション・重複idを除外', () => {
    const ms = deriveCourseMemories([
      sess('a'),
      sess('b', { completionStatus: 'interrupted' }),
      sess('c', { completionStatus: 'error' }),
      sess('d', { completionStatus: 'in_progress' }),
      sess('e', { startedAt: 'broken' }),
      sess('f', { missionId: 'nope' }),
      sess('a'), // 重複id
    ], NOW);
    expect(ms.find((m) => m.type === 'firstConversation')?.achievedAtISO).toBe('2026-06-01');
    expect(ms.find((m) => m.type === 'tenthConversation')).toBeUndefined(); // 有効1件のみ
  });

  it('順序がバラバラでも同じ結果（最古判定・安定）', () => {
    const a = [sess('a', { startedAt: '2026-06-03T10:00:00Z' }), sess('b', { startedAt: '2026-06-01T10:00:00Z' })];
    const r1 = deriveCourseMemories(a, NOW);
    const r2 = deriveCourseMemories([...a].reverse(), NOW);
    expect(r1).toEqual(r2);
    expect(r1.find((m) => m.type === 'firstConversation')?.achievedAtISO).toBe('2026-06-01');
  });

  it('自力使用・翌日復習は最古の該当日（表現つき/なしの制御）', () => {
    const ms = deriveCourseMemories([
      sess('a', { startedAt: '2026-06-01T10:00:00Z' }),
      sess('b', { startedAt: '2026-06-02T10:00:00Z', lessonKind: 'review_day1' }),
      sess('c', { startedAt: '2026-06-03T10:00:00Z', targetUsedIndependently: true }),
    ], NOW);
    expect(ms.find((m) => m.type === 'firstSelfUse')?.achievedAtISO).toBe('2026-06-03');
    expect(ms.find((m) => m.type === 'firstSelfUse')?.targetExpression).toBe(missionById('w01m1')!.targetExpression); // 実ミッションの表現
    expect(ms.find((m) => m.type === 'firstNextDayReview')?.achievedAtISO).toBe('2026-06-02');
    expect(ms.find((m) => m.type === 'firstConversation')?.targetExpression).toBeNull();
  });

  it('10回目: 10件未満は出ない・10件以上は10件目の実日付', () => {
    const nine = Array.from({ length: 9 }, (_, i) => sess(`s${i}`, { startedAt: `2026-06-0${(i % 9) + 1}T10:00:00Z` }));
    expect(deriveCourseMemories(nine, NOW).find((m) => m.type === 'tenthConversation')).toBeUndefined();
    const ten = [...nine, sess('s10', { startedAt: '2026-06-15T10:00:00Z' })];
    expect(deriveCourseMemories(ten, NOW).find((m) => m.type === 'tenthConversation')?.achievedAtISO).toBe('2026-06-15');
  });

  it('1か月: 30日未満は出ない・30日以上は経過事実（未来日付なし・継続断定はi18n側でもしない）', () => {
    expect(deriveCourseMemories([sess('a', { startedAt: '2026-07-10T10:00:00Z' })], NOW)
      .find((m) => m.type === 'oneMonth')).toBeUndefined();
    const m = deriveCourseMemories([sess('a', { startedAt: '2026-06-01T10:00:00Z' })], NOW)
      .find((x) => x.type === 'oneMonth');
    expect(m?.achievedAtISO).toBe('2026-07-01');
    expect(m!.achievedAtISO <= '2026-07-26').toBe(true);
  });

  it('naturalFind: correctionsの擬似空値（文字列null）は無効・実在すれば最古日', () => {
    const rep = (improved: string) => ({ todaySummaryJa: '', todaySummaryZh: '', achievements: [], corrections: [{ original: 'x', improved, noteZh: '' }], naturalPhrases: [], targetUsage: 'hint' as const, encouragementJa: '' });
    expect(deriveCourseMemories([sess('a', { report: rep('null') })], NOW).find((m) => m.type === 'naturalFind')).toBeUndefined();
    expect(deriveCourseMemories([sess('a', { report: rep('昨日、上司に説明しました') })], NOW)
      .find((m) => m.type === 'naturalFind')?.achievedAtISO).toBe('2026-06-01');
  });

  it('stableKey安定・最大6件・空入力は空', () => {
    expect(deriveCourseMemories([], NOW)).toEqual([]);
    const ms = deriveCourseMemories([sess('a')], NOW);
    expect(ms.every((m) => m.stableKey === m.type)).toBe(true);
    expect(ms.length).toBeLessThanOrEqual(6);
  });
});

describe('アバターpath検証（signed URL発行前ガード）', () => {
  it('正しい形式のみ許可・traversal/外部URL/SVG拒否', async () => {
    const { isValidAvatarPath } = await import('./avatarStorage');
    const uid = '123e4567-e89b-12d3-a456-426614174000';
    expect(isValidAvatarPath(`${uid}/candidates/avatar-1.png`)).toBe(true);
    expect(isValidAvatarPath(`${uid}/approved/a.webp`)).toBe(true);
    expect(isValidAvatarPath(`${uid}/../other/a.png`)).toBe(false);
    expect(isValidAvatarPath('https://evil.example/a.png')).toBe(false);
    expect(isValidAvatarPath(`${uid}/approved/a.svg`)).toBe(false);
    expect(isValidAvatarPath('not-a-uuid/approved/a.png')).toBe(false);
  });
});
