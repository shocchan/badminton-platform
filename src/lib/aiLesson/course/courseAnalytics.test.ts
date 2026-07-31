// @vitest-environment jsdom
// 検証モード（sandbox）中はanalyticsを送らない（CEO指示 2026-07-28 §9）。
// 検証操作が本物の学習データとして集計に混ざらないことを担保する。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { trackCourse, trackCourseOnce } from './courseAnalytics';
import { JOURNEY_SANDBOX_KEY } from './courseStorageRegistry';

type GtagWindow = Window & { gtag?: (...a: unknown[]) => void; dataLayer?: unknown[] };
const w = window as GtagWindow;
let sent: unknown[][];

beforeEach(() => {
  window.sessionStorage.clear();
  sent = [];
  w.gtag = (...a: unknown[]) => { sent.push(a); };
});
afterEach(() => { delete w.gtag; });

describe('通常モード', () => {
  it('gtagがあれば送信する', () => {
    trackCourse('view_ai_course_test', { a: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0][1]).toBe('view_ai_course_test');
  });
});

describe('検証モード（sandboxキーが存在する間）', () => {
  beforeEach(() => { window.sessionStorage.setItem(JOURNEY_SANDBOX_KEY, '{}'); });

  it('trackCourseは送信しない', () => {
    trackCourse('start_ai_course_first_run');
    expect(sent).toHaveLength(0);
  });

  it('trackCourseOnceは送信せず「送信済み」印も付けない（検証終了後の正規操作を逃さない）', () => {
    trackCourseOnce('complete_ai_course_sandbox_case');
    expect(sent).toHaveLength(0);
    // 検証を終了（sandboxキー削除）した後の同じイベントは正しく送信される
    window.sessionStorage.removeItem(JOURNEY_SANDBOX_KEY);
    trackCourseOnce('complete_ai_course_sandbox_case');
    expect(sent).toHaveLength(1);
  });

  it('検証終了後は通常どおり送信する', () => {
    window.sessionStorage.removeItem(JOURNEY_SANDBOX_KEY);
    trackCourse('view_ai_course_after_sandbox');
    expect(sent).toHaveLength(1);
  });
});
