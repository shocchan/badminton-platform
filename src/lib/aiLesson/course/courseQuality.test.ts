// 品質改善パスで追加した純ロジックのテスト（§10）
// - 現在地の「今できる会話レベル」表示
// - 会話力スキルの見せ方（スコア競争にしない）
// - ホーム主要CTAの優先順位（復習日は復習CTA）

import { describe, it, expect } from 'vitest';
import { weekLevelCanDo, WEEK_CATEGORY } from './courseCanDo';
import { skillLevel } from './courseGrowth';
import type { SpeakingSkill } from './courseGrowth';
import { isReviewKind } from './courseEngine';
import type { LessonKind } from './types';

describe('weekLevelCanDo（現在地＝今できる会話レベル）', () => {
  it('Week番号ではなく会話能力の文を返す', () => {
    expect(weekLevelCanDo(3, 'ja')).toBe('以前と今の変化を説明できる');
    expect(weekLevelCanDo(5, 'ja')).toBe('相手に丁寧にお願い・許可を求められる');
  });
  it('中国語版も返す', () => {
    expect(weekLevelCanDo(3, 'zh')).toBe('能说明以前和现在的变化');
  });
  it('全12週にカテゴリが定義されている', () => {
    for (let w = 1; w <= 12; w++) {
      expect(WEEK_CATEGORY[w], `week ${w}`).toBeDefined();
      expect(weekLevelCanDo(w, 'ja').length).toBeGreaterThan(0);
      expect(weekLevelCanDo(w, 'zh').length).toBeGreaterThan(0);
    }
  });
});

describe('skillLevel（スコア競争にしない・失敗を作らない）', () => {
  const skill = (score: number, grounded: boolean): SpeakingSkill => ({ key: 'experience', score, grounded });
  it('根拠が無ければ分析中', () => {
    expect(skillLevel(skill(0.9, false))).toBe('analyzing');
    expect(skillLevel(skill(0, false))).toBe('analyzing');
  });
  it('十分できていれば強み', () => {
    expect(skillLevel(skill(0.7, true))).toBe('strength');
    expect(skillLevel(skill(1, true))).toBe('strength');
  });
  it('それ以外は「伸びている途中」（低くても失敗にしない）', () => {
    expect(skillLevel(skill(0.1, true))).toBe('growing');
    expect(skillLevel(skill(0.69, true))).toBe('growing');
  });
  it('返すのは strength / growing / analyzing の3種だけ', () => {
    const levels = new Set([0, 0.3, 0.7, 1].map((s) => skillLevel(skill(s, true))));
    expect([...levels].every((l) => ['strength', 'growing', 'analyzing'].includes(l))).toBe(true);
  });
});

describe('isReviewKind（ホーム主要CTAの優先順位）', () => {
  it('復習系は true（→「今日の復習を始める」）', () => {
    (['review_day1', 'review_day3', 'review_day7', 'review_day30', 'extra'] as LessonKind[])
      .forEach((k) => expect(isReviewKind(k), k).toBe(true));
  });
  it('新規・週間総合実践は false（→「今日のレッスンを始める」）', () => {
    expect(isReviewKind('new')).toBe(false);
    expect(isReviewKind('weekly_practice')).toBe(false);
  });
});
