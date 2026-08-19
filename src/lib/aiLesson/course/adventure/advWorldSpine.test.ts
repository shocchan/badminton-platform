// 世界地図の道ジオメトリ（advWorldSpine）の数値検査。
//
// jsdom不要（DOM APIを使わない設計の裏取り）。ここで確かめること:
//   - pointAt の端点一致: t=0 が港の桟橋（SPINE先頭）、t=1 がソラノ塔（SPINE末尾）
//   - pointAt の単調性: t を進めると道の上を必ず前進する（止まらない・逆走しない）
//   - 弧長の整合: サンプル間距離の総和 ≒ 全長（弧長パラメータ化が正しい）
//   - TARGET_END の単調性: 目標が上がるほど終点が先へ・地図の上方（yが小さい方）へ伸びる
//   - 環状路の周長 ≒ 706（会話12ノードの間隔≒59pxの前提）
import { describe, it, expect } from 'vitest';
import {
  SPINE, TARGET_END, spinePointAt, spineTotalLength, ringTotalLength,
} from './advWorldSpine';

describe('advWorldSpine — 背骨の弧長パラメータ化', () => {
  it('端点一致: t=0 は港の桟橋、t=1 はソラノ塔', () => {
    const start = spinePointAt(0);
    const end = spinePointAt(1);
    expect(Math.hypot(start.x - SPINE[0][0], start.y - SPINE[0][1])).toBeLessThan(0.5);
    const last = SPINE[SPINE.length - 1];
    expect(Math.hypot(end.x - last[0], end.y - last[1])).toBeLessThan(0.5);
  });

  it('単調性: tを進めると常に前進し、進んだ距離の総和が全長と一致する', () => {
    const N = 200;
    let prev = spinePointAt(0);
    let acc = 0;
    for (let k = 1; k <= N; k += 1) {
      const p = spinePointAt(k / N);
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      expect(d, `t=${k / N} で前進していない`).toBeGreaterThan(0);
      acc += d;
      prev = p;
    }
    const total = spineTotalLength();
    // 折れ線をさらに200分割した弦の総和なので全長よりわずかに短いだけのはず
    expect(Math.abs(acc - total)).toBeLessThan(total * 0.02);
  });

  it('TARGET_END: 目標が上がるほど道の終点が先へ、かつ地図の上方へ伸びる', () => {
    expect(TARGET_END.N5).toBeLessThan(TARGET_END.N4);
    expect(TARGET_END.N4).toBeLessThan(TARGET_END.N3);
    expect(TARGET_END.N3).toBeLessThan(TARGET_END.N2);
    expect(TARGET_END.N2).toBe(1);
    // 「N5=港周辺 → N2=塔」の縦積み: 終点のyが単調に小さくなる
    const y5 = spinePointAt(TARGET_END.N5).y;
    const y4 = spinePointAt(TARGET_END.N4).y;
    const y3 = spinePointAt(TARGET_END.N3).y;
    const y2 = spinePointAt(TARGET_END.N2).y;
    expect(y5).toBeGreaterThan(y4);
    expect(y4).toBeGreaterThan(y3);
    expect(y3).toBeGreaterThan(y2);
  });

  it('環状路（会話レーン）の周長は約706（12ノード間隔≒59pxの前提）', () => {
    expect(Math.abs(ringTotalLength() - 706)).toBeLessThan(3);
  });
});
