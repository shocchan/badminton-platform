import { describe, it, expect } from 'vitest';
import { reviewReasonKey } from './courseReviewReason';
import { aiCourseI18n } from '../../../locales/aiCourse';

describe('復習理由1行（決定的・復習ロジック非変更）', () => {
  it('遅延（overdue）が最優先', () => {
    expect(reviewReasonKey({ reasons: ['overdue', 'due'], masteryState: 'initial' })).toBe('overdue');
  });

  it('期日（due）: masteryStateから何日後の確認かを導出', () => {
    expect(reviewReasonKey({ reasons: ['due'], masteryState: 'initial' })).toBe('day1');
    expect(reviewReasonKey({ reasons: ['due'], masteryState: 'used_with_hint' })).toBe('day1');
    expect(reviewReasonKey({ reasons: ['due'], masteryState: 'used_independently' })).toBe('day1');
    expect(reviewReasonKey({ reasons: ['due'], masteryState: 'reviewed_day1' })).toBe('day3');
    expect(reviewReasonKey({ reasons: ['due'], masteryState: 'reviewed_day3' })).toBe('day7');
    expect(reviewReasonKey({ reasons: ['due'], masteryState: 'retained_day7' })).toBe('day7');
  });

  it('期日以外（もう一度タブ等）・不正データは general（安全fallback）', () => {
    expect(reviewReasonKey({ reasons: ['practice_again'], masteryState: 'initial' })).toBe('general');
    expect(reviewReasonKey({ reasons: [], masteryState: 'initial' })).toBe('general');
    expect(reviewReasonKey({ reasons: ['due'], masteryState: 'unknown_state' })).toBe('general');
    expect(reviewReasonKey({ reasons: undefined as unknown as string[], masteryState: 'initial' })).toBe('general');
  });

  it('全キーの文言が ja/zh 両方に存在し、否定的表現を含まない', () => {
    const banned = ['失敗', '忘れた', '失いました', 'ゼロになりました', '失败', '忘了'];
    for (const d of [aiCourseI18n.ja, aiCourseI18n.zh]) {
      for (const key of ['day1', 'day3', 'day7', 'overdue', 'general'] as const) {
        const text = d.records.reviewReasons[key];
        expect(text.length).toBeGreaterThan(0);
        banned.forEach((b) => expect(text).not.toContain(b));
      }
    }
  });
});
