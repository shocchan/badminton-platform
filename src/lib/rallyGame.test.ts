// バド対決ゲーム（案A）の回帰テスト。
//
// 守りたいのは「操作を覚える前に終わらない」こと。
// 旧実装は 0ラリーのプレイを記録すらしておらず（RallyGamePage の
// `rallyCount < 1` ガード）、初球で空振りした人は数字に一切現れなかった。
// 記録を直したので、今後はここが崩れると実測で気づける。

import { describe, it, expect } from 'vitest';
import {
  OUT_X,
  WARMUP_RALLIES,
  computeReturnX,
  createRng,
  difficultyForRally,
  evaluateSwingTiming,
  isWarmupRally,
} from './rallyGame';

describe('練習球（最初の数球）', () => {
  it(`最初の${WARMUP_RALLIES}球だけが練習球`, () => {
    for (let r = 0; r < WARMUP_RALLIES; r++) expect(isWarmupRally(r)).toBe(true);
    expect(isWarmupRally(WARMUP_RALLIES)).toBe(false);
  });

  it('練習球は本番の球より遅く、判定窓も広い', () => {
    const rng = createRng(1);
    const warm = difficultyForRally(0, rng);
    const real = difficultyForRally(WARMUP_RALLIES, rng);
    expect(warm.flightMs).toBeGreaterThan(real.flightMs);
    expect(warm.hitWindowMs).toBeGreaterThan(real.hitWindowMs);
  });

  it('1球目は真ん中に来る（動かなくても届く）', () => {
    const d = difficultyForRally(0, createRng(1));
    expect(d.courseSpread).toBe(0);
    expect(d.cornerBias).toBe(0);
  });

  it('練習球のあいだは少しずつ散らばる（移動を覚えてもらう）', () => {
    const rng = createRng(1);
    let prev = -1;
    for (let r = 0; r < WARMUP_RALLIES; r++) {
      const d = difficultyForRally(r, rng);
      expect(d.courseSpread).toBeGreaterThan(prev);
      prev = d.courseSpread;
    }
  });

  it('練習球を抜けたら難易度は従来どおり上がっていく', () => {
    const rng = createRng(1);
    const a = difficultyForRally(WARMUP_RALLIES, rng);
    const b = difficultyForRally(25, rng);
    expect(b.flightMs).toBeLessThan(a.flightMs);
    expect(b.hitWindowMs).toBeLessThan(a.hitWindowMs);
    expect(b.courseSpread).toBeGreaterThan(a.courseSpread);
  });
});

describe('判定は緩めていない（窓に入れば大半は返る）', () => {
  // 「打てたのに横に流れて死ぬ」が起きていないことの固定。
  // 窓のどこで振っても、打点の左右によらず、8割以上はインに返る。
  const inRatio = (rally: number) => {
    const d = difficultyForRally(rally, createRng(7));
    let safe = 0;
    let total = 0;
    for (let step = 0; step <= 200; step++) {
      const remain = (step / 200) * d.hitWindowMs;
      for (let k = 0; k <= 20; k++) {
        const racketX = -1 + (2 * k) / 20;
        const t = evaluateSwingTiming(remain, d.hitWindowMs);
        total += 1;
        if (Math.abs(computeReturnX(racketX, t.deviation)) <= OUT_X) safe += 1;
      }
    }
    return safe / total;
  };

  it.each([0, 5, 15, 30])('ラリー%iでも窓の8割以上はインに返る', (rally) => {
    expect(inRatio(rally)).toBeGreaterThan(0.8);
  });

  it('スイートスポットで振れば必ずイン（どこで打っても）', () => {
    const d = difficultyForRally(10, createRng(7));
    const t = evaluateSwingTiming(d.hitWindowMs * 0.45, d.hitWindowMs);
    expect(t.perfect).toBe(true);
    for (let k = 0; k <= 20; k++) {
      const racketX = -1 + (2 * k) / 20;
      expect(Math.abs(computeReturnX(racketX, t.deviation))).toBeLessThanOrEqual(OUT_X);
    }
  });
});
