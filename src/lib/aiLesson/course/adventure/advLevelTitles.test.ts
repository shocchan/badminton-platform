// レベル称号の受入テスト（2026-08-19）。
// 守りたいこと: しきい値の単調性／全称号のja/zh完備／禁止表現（「合格」「保証」）を含まない。
import { describe, it, expect } from 'vitest';
import { LEVEL_TITLES, titleOf, TITLE_DISCLAIMER } from './advLevelTitles';

describe('LEVEL_TITLES', () => {
  it('minLevel が 1 から始まり狭義単調増加（titleOfの探索が壊れない）', () => {
    expect(LEVEL_TITLES[0].minLevel).toBe(1);
    for (let i = 1; i < LEVEL_TITLES.length; i += 1) {
      expect(LEVEL_TITLES[i].minLevel).toBeGreaterThan(LEVEL_TITLES[i - 1].minLevel);
    }
  });

  it('全称号が ja/zh を持つ', () => {
    for (const t of LEVEL_TITLES) {
      expect(t.ja.length, `minLevel=${t.minLevel}`).toBeGreaterThan(0);
      expect(t.zh.length, `minLevel=${t.minLevel}`).toBeGreaterThan(0);
    }
  });

  it('**「合格」「保証」を含む称号が無い**（合格保証表現の禁止）', () => {
    for (const t of LEVEL_TITLES) {
      expect(t.ja).not.toMatch(/合格|保証/);
      expect(t.zh).not.toMatch(/合格|保证/);
    }
  });
});

describe('titleOf', () => {
  it('しきい値どおりに引ける（範囲内は据え置き・超えたら次へ）', () => {
    expect(titleOf(1).ja).toBe('見習いの旅人');
    expect(titleOf(2).ja).toBe('見習いの旅人');
    expect(titleOf(3).ja).toBe('かけだし冒険者');
    expect(titleOf(4).ja).toBe('かけだし冒険者');
    expect(titleOf(12).ja).toBe('歴戦の冒険者');
    expect(titleOf(16).ja).toBe('伝説の冒険者');
    expect(titleOf(99).ja).toBe('伝説の冒険者'); // 上限を超えても最後の称号で安定
  });

  it('壊れた入力（0以下）でも先頭へ倒れて落ちない', () => {
    expect(titleOf(0).ja).toBe('見習いの旅人');
    expect(titleOf(-5).zh).toBe('见习旅人');
  });
});

describe('TITLE_DISCLAIMER', () => {
  it('注記がja/zhとも「学力判定ではない」ことを言っている', () => {
    expect(TITLE_DISCLAIMER.ja).toContain('学力の判定ではありません');
    expect(TITLE_DISCLAIMER.zh).toContain('不代表学力判定');
  });
});
