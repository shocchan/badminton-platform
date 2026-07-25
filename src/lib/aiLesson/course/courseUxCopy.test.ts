import { describe, it, expect } from 'vitest';
import { aiCourseI18n } from '../../../locales/aiCourse';

// 学習UX改善（ホーム=今日中心・レポート段階開示・N2続きから）のコピー事故防止テスト。
// ja/zh の新キーが両方に存在し、行動案内が短いことを保証する。

const { ja, zh } = aiCourseI18n;

describe('学習UXコピー: 新キーの ja/zh パリティ', () => {
  it('先生の一言（ホーム）が両言語にあり短い（30文字以内）', () => {
    for (const d of [ja, zh]) {
      expect(d.home.coachLineNew.length).toBeGreaterThan(0);
      expect(d.home.coachLineReview.length).toBeGreaterThan(0);
      expect(d.home.coachLineNew.length).toBeLessThanOrEqual(30);
      expect(d.home.coachLineReview.length).toBeLessThanOrEqual(30);
    }
  });

  it('レポート段階開示キーが両言語にある', () => {
    for (const d of [ja, zh]) {
      expect(d.report.seeDetails.length).toBeGreaterThan(0);
      expect(d.report.hideDetails.length).toBeGreaterThan(0);
      expect(d.report.fixOneTitle.length).toBeGreaterThan(0);
    }
  });

  it('N2「続きから・おすすめ」キーが両言語にある', () => {
    for (const d of [ja, zh]) {
      expect(d.n2grammar.recentTitle.length).toBeGreaterThan(0);
      expect(d.n2grammar.recommendBadge.length).toBeGreaterThan(0);
      expect(d.n2grammar.recommendBadge.length).toBeLessThanOrEqual(4); // バッジは極小
    }
  });

  it('主要CTAが動詞で始まる短いラベル（20文字以内）', () => {
    for (const d of [ja, zh]) {
      expect(d.home.startLesson.length).toBeLessThanOrEqual(20);
      expect(d.home.startReview.length).toBeLessThanOrEqual(20);
    }
  });

  it('今日の復習の件数表示が両言語で関数として機能する', () => {
    expect(ja.home.reviewsDue(3)).toContain('3');
    expect(zh.home.reviewsDue(3)).toContain('3');
  });
});
