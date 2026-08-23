// AI会話の枠に達したときの文言（2026-08-23）。
// 守るのは1つだけ:「使えません」で終わらせない。止まるのは音声会話だけで、
// 冒険・文法バトル・ミニ模試・復習は続けられる＝それを必ず書く（行き止まりを作らない）。
import { describe, it, expect } from 'vitest';
import { aiCourseI18n } from '../../../../locales/aiCourse';

const CODES = ['plan_voice_daily_limit', 'plan_voice_total_exhausted', 'plan_text_daily_limit'] as const;

describe('枠に達したときの案内', () => {
  it.each(CODES)('%s は日本語・中国語の両方にある', (code) => {
    expect(aiCourseI18n.ja.limits[code]).toBeTruthy();
    expect(aiCourseI18n.zh.limits[code]).toBeTruthy();
  });

  it.each(CODES)('%s は「いま何ができるか」を書いている（行き止まりにしない）', (code) => {
    expect(aiCourseI18n.ja.limits[code]).toMatch(/冒険/);
    expect(aiCourseI18n.zh.limits[code]).toMatch(/冒险/);
  });

  it('日本語の案内に中国語だけの表記が混ざっていない', () => {
    for (const code of CODES) expect(aiCourseI18n.ja.limits[code]).not.toMatch(/继续|方案/);
  });
});
