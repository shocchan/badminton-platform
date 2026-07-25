// 言語切替ロジックの受入テスト（§22）

import { describe, it, expect } from 'vitest';
import { resolveInitialLang, otherLang, swapCourseLocaleInPath, isCoursePath } from './courseLanguage';

describe('resolveInitialLang', () => {
  it('URLの明示言語を最優先する', () => {
    expect(resolveInitialLang({ urlLang: 'zh', savedLang: 'ja' })).toBe('zh');
    expect(resolveInitialLang({ urlLang: 'ja', savedLang: 'zh' })).toBe('ja');
  });
  it('URLが無効なら保存設定を使う', () => {
    // urlLang は型上 ja/zh だが、保存優先の分岐を検証するため未知値を渡す
    expect(resolveInitialLang({ urlLang: 'xx' as 'ja', savedLang: 'zh' })).toBe('zh');
  });
  it('未設定時はブラウザ言語を参考にする', () => {
    expect(resolveInitialLang({ urlLang: 'xx' as 'ja', browserLang: 'zh-CN' })).toBe('zh');
    expect(resolveInitialLang({ urlLang: 'xx' as 'ja', browserLang: 'en-US' })).toBe('ja');
  });
});

describe('otherLang', () => {
  it('ja↔zh を反転する', () => {
    expect(otherLang('ja')).toBe('zh');
    expect(otherLang('zh')).toBe('ja');
  });
});

describe('swapCourseLocaleInPath', () => {
  it('AIコースの locale segment だけを差し替える', () => {
    expect(swapCourseLocaleInPath('/ja/ai-course', 'zh')).toBe('/zh/ai-course');
    expect(swapCourseLocaleInPath('/zh/ai-course', 'ja')).toBe('/ja/ai-course');
    expect(swapCourseLocaleInPath('/ja/ai-course/admin', 'zh')).toBe('/zh/ai-course/admin');
  });
  it('AIコース以外のURLは書き換えない（通常サイトを守る）', () => {
    expect(swapCourseLocaleInPath('/ja/activity', 'zh')).toBe('/ja/activity');
    expect(swapCourseLocaleInPath('/ja/', 'zh')).toBe('/ja/');
    expect(swapCourseLocaleInPath('/zh/mypage', 'ja')).toBe('/zh/mypage');
    expect(swapCourseLocaleInPath('/ja/ai-lesson-demo', 'zh')).toBe('/ja/ai-lesson-demo');
  });
});

describe('isCoursePath', () => {
  it('AIコース配下だけ true', () => {
    expect(isCoursePath('/ja/ai-course')).toBe(true);
    expect(isCoursePath('/zh/ai-course/admin')).toBe(true);
    expect(isCoursePath('/ja/activity')).toBe(false);
    expect(isCoursePath('/ja/ai-lesson-demo')).toBe(false);
  });
});
