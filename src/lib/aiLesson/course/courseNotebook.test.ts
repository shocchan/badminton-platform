import { describe, it, expect } from 'vitest';
import { buildNotebook, groupByDate, teacherLineKey } from './courseNotebook';
import { firstGrapheme, paletteIndexFor } from './learnerAvatarUtils';
import type { CourseSessionRecord, ItemProgress } from './types';

const sess = (over: Partial<CourseSessionRecord>): CourseSessionRecord => ({
  id: 's1', missionId: 'w01m1', mode: 'text', lessonKind: 'new', difficulty: 2,
  startedAt: '2026-07-25T10:00:00Z', endedAt: null, durationSeconds: 180,
  completionStatus: 'completed', endReason: null, targetExpression: '〜ので',
  targetUsed: true, targetUsedIndependently: false, hintsUsed: 0, chineseSupportUsed: false,
  errorCode: null, estimatedCostUsd: 0, report: null,
  ...over,
} as CourseSessionRecord);

describe('わたしの日本語ノート（実データのみ・決定的）', () => {
  it('完了セッションのみ掲載（interrupted/error/in_progressは除外）', () => {
    const entries = buildNotebook([
      sess({ id: 'a' }),
      sess({ id: 'b', completionStatus: 'interrupted' }),
      sess({ id: 'c', completionStatus: 'error' }),
      sess({ id: 'd', completionStatus: 'in_progress' }),
    ], []);
    expect(entries.map((e) => e.sessionId)).toEqual(['a']);
  });

  it('不正日付・不明ミッションは除外（ページを偽造しない）', () => {
    expect(buildNotebook([sess({ startedAt: 'broken' })], [])).toEqual([]);
    expect(buildNotebook([sess({ missionId: 'no-such' })], [])).toEqual([]);
  });

  it('correctionの文字列nullは言い直し行を出さない（cleanTurnText再利用）', () => {
    const withNull = sess({ report: { todaySummaryJa: '', todaySummaryZh: '', achievements: [], corrections: [{ original: 'x', improved: 'null', noteZh: '' }], naturalPhrases: [], targetUsage: 'hint', encouragementJa: '' } });
    expect(buildNotebook([withNull], [])[0].retriedText).toBeNull();
    const withReal = sess({ report: { todaySummaryJa: '', todaySummaryZh: '', achievements: [], corrections: [{ original: 'x', improved: '昨日、上司に説明しました', noteZh: '' }], naturalPhrases: [], targetUsage: 'hint', encouragementJa: '' } });
    expect(buildNotebook([withReal], [])[0].retriedText).toBe('昨日、上司に説明しました');
  });

  it('先生と一言は決定的（自力=self・言い直し=retried・復習=翔子/新規=悠斗）', () => {
    expect(teacherLineKey({ targetUsedIndependently: true, targetUsed: true, hasRetry: true })).toBe('self');
    expect(teacherLineKey({ targetUsedIndependently: false, targetUsed: true, hasRetry: true })).toBe('retried');
    expect(teacherLineKey({ targetUsedIndependently: false, targetUsed: true, hasRetry: false })).toBe('hint');
    expect(teacherLineKey({ targetUsedIndependently: false, targetUsed: false, hasRetry: false })).toBe('kept');
    const e = buildNotebook([sess({ lessonKind: 'review_day1' })], []);
    expect(e[0].teacher).toBe('shoko');
    expect(buildNotebook([sess({})], [])[0].teacher).toBe('yuto');
  });

  it('同日複数は同じ日付グループ・新しい順・復習日はprogressから', () => {
    const prog = [{ itemId: 'w01m1', nextReviewAt: '2026-07-27', reviewStage: 'day1', masteryState: 'used_with_hint', lastPracticedAt: null, successCount: 1, failedReviews: 0 } as unknown as ItemProgress];
    const days = groupByDate(buildNotebook([
      sess({ id: 'a', startedAt: '2026-07-25T10:00:00Z' }),
      sess({ id: 'b', startedAt: '2026-07-25T12:00:00Z' }),
      sess({ id: 'c', startedAt: '2026-07-24T09:00:00Z' }),
    ], prog));
    expect(days.length).toBe(2);
    expect(days[0].dateISO).toBe('2026-07-25');
    expect(days[0].entries.length).toBe(2);
    expect(days[0].entries[0].nextReviewISO).toBe('2026-07-27');
  });
});

describe('イニシャルアバター（grapheme・決定的パレット）', () => {
  it('日本語・英字・絵文字・サロゲートペアの先頭grapheme', () => {
    expect(firstGrapheme('安田翔')).toBe('安');
    expect(firstGrapheme(' Andy ')).toBe('A');
    expect(firstGrapheme('👨‍👩‍👧テスト').length).toBeGreaterThan(0); // 壊れない
    expect(firstGrapheme('𠮷田')).toBe('𠮷'); // サロゲートペアを切らない
    expect(firstGrapheme('')).toBe('');
  });

  it('同じ名前は毎回同じ色（決定的）', () => {
    expect(paletteIndexFor('小安')).toBe(paletteIndexFor('小安'));
    expect(paletteIndexFor('x')).toBeGreaterThanOrEqual(0);
    expect(paletteIndexFor('x')).toBeLessThan(4);
  });
});
