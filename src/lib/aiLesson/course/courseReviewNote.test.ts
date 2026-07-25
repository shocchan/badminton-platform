// 「今回の復習」ノート（Feature 5）の純ロジック検証。
// 既存データのみから組む・冪等・実発話のみ・捏造しない。
import { describe, it, expect } from 'vitest';
import { buildReviewNote } from './courseReviewNote';
import type { BuildReviewNoteInput } from './courseReviewNote';
import { COURSE_MISSIONS } from './courseData';
import type { LessonReport } from './types';

const mission = COURSE_MISSIONS[0];

const report: LessonReport = {
  todaySummaryJa: '今日は「疲れています」を練習しました。',
  todaySummaryZh: '今天练习了「疲れています」。',
  achievements: ['自分の力で使えました'],
  corrections: [{ original: '今日はちょっと疲れました', improved: '今日はちょっと疲れています', noteZh: '状态用ています更自然' }],
  naturalPhrases: ['お疲れさまです'],
  targetUsage: 'self',
  encouragementJa: 'よくがんばりました。',
};

const base = (over: Partial<BuildReviewNoteInput> = {}): BuildReviewNoteInput => ({
  sessionId: 'sess-1', dateISO: '2026-09-01', mission, report,
  myUtterances: ['今日はちょっと疲れました', 'はい', '', '仕事のあとです'],
  isReview: false, nextReviewISO: '2026-09-02', ...over,
});

describe('buildReviewNote', () => {
  it('Mission静的データを転記する（テーマ・目標・読み方・意味・使う場面）', () => {
    const n = buildReviewNote(base());
    expect(n.themeJa).toBe(mission.titleJa);
    expect(n.themeZh).toBe(mission.titleZh);
    expect(n.expression.targetExpression).toBe(mission.targetExpression);
    expect(n.expression.reading).toBe(mission.targetExpressionReading);
    expect(n.expression.meaningZh).toBe(mission.meaningZh);
    expect(n.expression.usageJa).toBe(mission.usageNotesJa);
  });

  it('実発話のみを載せ、短断片・空は除外する（捏造しない）', () => {
    const n = buildReviewNote(base());
    // '' と 'はい'(短すぎ) は除外、意味のある発話だけ
    expect(n.expression.myUtterances).toContain('今日はちょっと疲れました');
    expect(n.expression.myUtterances).toContain('仕事のあとです');
    expect(n.expression.myUtterances).not.toContain('');
    expect(n.expression.myUtterances).not.toContain('はい');
  });

  it('実発話が無ければ空配列（AIが発話を作らない）', () => {
    const n = buildReviewNote(base({ myUtterances: [] }));
    expect(n.expression.myUtterances).toEqual([]);
  });

  it('より自然な言い方は corrections.improved と naturalPhrases から作る', () => {
    const n = buildReviewNote(base());
    const improved = n.expression.betterPhrasings.map((b) => b.improved);
    expect(improved).toContain('今日はちょっと疲れています');
    expect(improved).toContain('お疲れさまです');
  });

  it('冪等: 同じ入力からは同じノート（二重生成防止の裏付け）', () => {
    expect(buildReviewNote(base())).toEqual(buildReviewNote(base()));
  });

  it('report が無くても Mission だけで成立し、既定の励ましを使う', () => {
    const n = buildReviewNote(base({ report: null, myUtterances: [] }));
    expect(n.encouragementJa).toBeTruthy();
    expect(n.encouragementZh).toBeTruthy();
    expect(n.achievements).toEqual([]);
    expect(n.expression.betterPhrasings).toEqual([]);
    expect(n.expression.targetExpression).toBe(mission.targetExpression);
  });

  it('次の復習予定を保持する', () => {
    expect(buildReviewNote(base()).nextReviewISO).toBe('2026-09-02');
    expect(buildReviewNote(base({ nextReviewISO: null })).nextReviewISO).toBeNull();
  });
});
