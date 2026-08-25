// タイミングゲージの回帰テスト。
//
// 縮むリングは着地点＝指を置く場所に描かれるので、スマホでは一番見たい
// 瞬間を自分の指が隠す。ゲージはそれを指の当たらない位置に出すためのもの。
// 「指より上にある」「Perfect帯が判定式と一致する」の2つが崩れたら意味が無い。

import { describe, it, expect } from 'vitest';
import { drawTimingGauge } from './courtRender';
import { PERFECT_ZONE, evaluateSwingTiming } from './rallyGame';

interface Rect { x: number; y: number; w: number; h: number; fill: string }

/** fillRect と fillStyle だけを記録する最小のダミー */
function recorder() {
  const rects: Rect[] = [];
  const ctx = {
    fillStyle: '',
    beginPath() {},
    rect() {},
    roundRect() {},
    fill() {},
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, fill: String(this.fillStyle) });
    },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, rects };
}

const CX = 200;
const CY = 500;
const SCALE = 1;
const WINDOW = 300;

describe('タイミングゲージ', () => {
  it('着地点より上に描かれる（指で隠れない）', () => {
    const { ctx, rects } = recorder();
    drawTimingGauge(ctx, CX, CY, SCALE, WINDOW * 0.5, WINDOW, PERFECT_ZONE);
    expect(rects.length).toBeGreaterThan(0);
    for (const r of rects) {
      expect(r.y + r.h).toBeLessThan(CY - 30);
    }
  });

  it('Perfect帯の範囲が、実際のPerfect判定と一致する', () => {
    const { ctx, rects } = recorder();
    drawTimingGauge(ctx, CX, CY, SCALE, WINDOW * 0.5, WINDOW, PERFECT_ZONE);
    const band = rects.find((r) => r.fill.includes('253,224,71'));
    expect(band).toBeDefined();

    const gw = 96 * SCALE;
    const gx = CX - gw / 2;
    const loT = (band!.x - gx) / gw;
    const hiT = (band!.x + band!.w - gx) / gw;

    // 帯の内側で振れば Perfect、外側なら Perfect でない
    expect(evaluateSwingTiming(WINDOW * ((loT + hiT) / 2), WINDOW).perfect).toBe(true);
    expect(evaluateSwingTiming(WINDOW * (loT + 0.01), WINDOW).perfect).toBe(true);
    expect(evaluateSwingTiming(WINDOW * (hiT - 0.01), WINDOW).perfect).toBe(true);
    expect(evaluateSwingTiming(WINDOW * (loT - 0.02), WINDOW).perfect).toBe(false);
    expect(evaluateSwingTiming(WINDOW * (hiT + 0.02), WINDOW).perfect).toBe(false);
  });

  it('残り時間が減ると、印は左へ進む', () => {
    const markerX = (remain: number) => {
      const { ctx, rects } = recorder();
      drawTimingGauge(ctx, CX, CY, SCALE, remain, WINDOW, PERFECT_ZONE);
      return rects.find((r) => r.fill === '#fff')!.x;
    };
    expect(markerX(WINDOW)).toBeGreaterThan(markerX(WINDOW * 0.5));
    expect(markerX(WINDOW * 0.5)).toBeGreaterThan(markerX(0));
  });

  it('窓を外れた値でもゲージからはみ出さない', () => {
    const gw = 96 * SCALE;
    const gx = CX - gw / 2;
    for (const remain of [-500, 0, WINDOW * 2]) {
      const { ctx, rects } = recorder();
      drawTimingGauge(ctx, CX, CY, SCALE, remain, WINDOW, PERFECT_ZONE);
      const mark = rects.find((r) => r.fill === '#fff')!;
      expect(mark.x).toBeGreaterThanOrEqual(gx - 2);
      expect(mark.x + mark.w).toBeLessThanOrEqual(gx + gw + 2);
    }
  });

  it('roundRect が無い環境でも落ちない', () => {
    const { ctx, rects } = recorder();
    (ctx as unknown as { roundRect?: unknown }).roundRect = undefined;
    expect(() => drawTimingGauge(ctx, CX, CY, SCALE, 100, WINDOW, PERFECT_ZONE)).not.toThrow();
    expect(rects.length).toBeGreaterThan(0);
  });

  it('hitWindowMs が0なら何も描かない（ゼロ除算を出さない）', () => {
    const { ctx, rects } = recorder();
    drawTimingGauge(ctx, CX, CY, SCALE, 0, 0, PERFECT_ZONE);
    expect(rects).toHaveLength(0);
  });
});
