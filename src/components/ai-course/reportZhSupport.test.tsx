// @vitest-environment jsdom
// UX-004: レッスンレポートの中国語補助。
// 「zh localeで日本語だけになる正常系」を無くし、旧sessionデータでは壊れず
// ja表示のみへfallbackすることを固定する。
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CourseReviewNote } from './CourseReviewNote';
import { aiCourseI18n } from '../../locales/aiCourse';
import { buildReviewNote } from '../../lib/aiLesson/course/courseReviewNote';
import { COURSE_MISSIONS } from '../../lib/aiLesson/course/courseData';
import type { LessonReport } from '../../lib/aiLesson/course/types';

afterEach(cleanup);

const mission = COURSE_MISSIONS[0];

const newReport: LessonReport = {
  todaySummaryJa: '今日は自己紹介を練習しました。', todaySummaryZh: '今天练习了自我介绍。',
  achievements: ['「〜といいます」が言えました'], corrections: [], naturalPhrases: [],
  targetUsage: 'self', encouragementJa: 'この調子です！',
  achievementsZh: ['说出了「〜といいます」'], encouragementZh: '就是这个状态！',
};

// 旧session（zh補助フィールドが存在しない）
const oldReport: LessonReport = {
  todaySummaryJa: '練習しました。', todaySummaryZh: '练习了。',
  achievements: ['言えました'], corrections: [], naturalPhrases: [],
  targetUsage: 'hint', encouragementJa: 'よくできました。',
};

const renderNote = (t: typeof aiCourseI18n.ja, report: LessonReport) => {
  const note = buildReviewNote({
    sessionId: 's1', dateISO: '2026-07-31', mission, report,
    myUtterances: [], isReview: false, nextReviewISO: '2026-08-01',
  });
  return render(<CourseReviewNote t={t} note={note} onBack={() => {}} />);
};

describe('レポートの中国語補助（UX-004）', () => {
  it('zh locale: 励ましと達成に中国語補助が併記される（日本語も残る）', () => {
    renderNote(aiCourseI18n.zh, newReport);
    expect(screen.getByText('この調子です！')).toBeTruthy();
    expect(screen.getByText('就是这个状态！')).toBeTruthy();
    expect(screen.getByText('「〜といいます」が言えました')).toBeTruthy();
    expect(screen.getByText('说出了「〜といいます」')).toBeTruthy();
  });

  it('ja locale: 中国語補助は表示しない', () => {
    renderNote(aiCourseI18n.ja, newReport);
    expect(screen.getByText('この調子です！')).toBeTruthy();
    expect(screen.queryByText('就是这个状态！')).toBeNull();
    expect(screen.queryByText('说出了「〜といいます」')).toBeNull();
  });

  it('旧session（zh欠損）: zh localeでも壊れず、todaySummaryZhへfallbackし null/undefined を出さない', () => {
    const { container } = renderNote(aiCourseI18n.zh, oldReport);
    expect(screen.getByText('よくできました。')).toBeTruthy();
    // encouragementZh欠損時は todaySummaryZh がfallbackとして出る（既存挙動を維持）
    expect(screen.getByText('练习了。')).toBeTruthy();
    expect(container.textContent).not.toMatch(/null|undefined/);
  });

  it('長文でもoverflowしない（横スクロールを作らない）', () => {
    const long: LessonReport = {
      ...newReport,
      encouragementJa: 'とても'.repeat(60), encouragementZh: '非常'.repeat(60),
      achievements: ['あ'.repeat(120)], achievementsZh: ['长'.repeat(120)],
    };
    const { container } = renderNote(aiCourseI18n.zh, long);
    expect(container.querySelector('[style*="overflow-x"]')).toBeNull();
  });
});
