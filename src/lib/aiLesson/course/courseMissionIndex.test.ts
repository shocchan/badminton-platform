// 会話カリキュラム目次の番人（P0）。
//
// 守ること:
//   1. 目次に本文が漏れていない（漏れたら client bundle に教材が入る）
//   2. 目次が教材本体（courseData）と同期している（ズレたらレッスンが壊れる）
//
// このテスト自体は courseData を import するが、テストは bundle に入らない。
import { describe, it, expect } from 'vitest';
import { COURSE_MISSIONS as INDEX, COURSE_WEEKS as INDEX_WEEKS } from './courseMissionIndex.generated';
import { COURSE_MISSIONS as FULL, COURSE_WEEKS as FULL_WEEKS } from './courseData';

describe('会話カリキュラム目次（courseMissionIndex.generated）', () => {
  it('本文フィールドがすべて空（clientへ教材を渡さない）', () => {
    for (const m of INDEX) {
      expect(m.usageNotesJa, m.id).toBe('');
      expect(m.usageNotesZh, m.id).toBe('');
      expect(m.naturalExample, m.id).toBe('');
      expect(m.simpleExample, m.id).toBe('');
      expect(m.commonMistakes, m.id).toEqual([]);
      expect(m.openingQuestion, m.id).toBe('');
      expect(m.followUpQuestions, m.id).toEqual([]);
      expect(m.hintLevels, m.id).toEqual([]);
      expect(m.completionCriteria, m.id).toBe('');
      expect(m.reviewPrompts, m.id).toEqual({ day1: '', day3: '', day7: '' });
      expect(m.alternateScenes, m.id).toEqual([]);
    }
  });

  it('本体と同期している（id・順序・メタデータ一致）', () => {
    expect(INDEX.length).toBe(FULL.length);
    expect(INDEX_WEEKS).toEqual(FULL_WEEKS);
    for (let i = 0; i < FULL.length; i++) {
      const a = INDEX[i]; const b = FULL[i];
      expect(a.id).toBe(b.id);
      expect(a.titleJa).toBe(b.titleJa);
      expect(a.titleZh).toBe(b.titleZh);
      expect(a.week).toBe(b.week);
      expect(a.order).toBe(b.order);
      expect(a.category).toBe(b.category);
      expect(a.targetExpression).toBe(b.targetExpression);
      expect(a.detect).toBe(b.detect);
      expect(a.estimatedMinutes).toBe(b.estimatedMinutes);
      expect(a.requiredPreviousItems).toEqual(b.requiredPreviousItems);
      expect(a.isPublished).toBe(b.isPublished);
    }
  });

  it('本体には本文がある（空目次を本体と取り違えていない）', () => {
    const withOpening = FULL.filter((m) => m.openingQuestion.length > 0).length;
    expect(withOpening).toBeGreaterThan(50);
  });
});
