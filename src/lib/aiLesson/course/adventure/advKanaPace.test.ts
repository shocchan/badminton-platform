// かな道場のペース（2026-08-18 CEO指摘「43行・22日はだるくないか」）。
//
// 拡張前は20行だったので1日2行=10日で終わったが、濁音・拗音・促音・長音を足して43行になり、
// 全行終わるまで今日の冒険が「かな道場1本」に絞られる作りのままだったため、
// **ことばも文法も22日間まったく出ない**状態になっていた。
// 清音が読めた時点で本編を始め、残りは本編と並走させる。
import { describe, it, expect } from 'vitest';
import {
  KANA_ROWS, kanaRowsPerDay, isKanaReadable, isKanaGraduated, todaysKanaRowIds,
} from './advKana';

const NOW = '2026-08-18T00:00:00.000Z';
const seionRows = KANA_ROWS.filter((r) => (r.group ?? 'seion') === 'seion');
const state = (doneRowIds: string[]) => ({ needed: true as const, doneRowIds, checkedAt: NOW });

describe('清音が読めたら本編を始められる', () => {
  it('清音20行を終えた時点で「読める」になる（卒業はまだ）', () => {
    const s = state(seionRows.map((r) => r.rowId));
    expect(isKanaReadable(s)).toBe(true);
    expect(isKanaGraduated(s), '濁音以降が残っているので卒業ではない').toBe(false);
  });

  it('清音が1行でも残っていれば「読める」にならない', () => {
    const s = state(seionRows.slice(0, -1).map((r) => r.rowId));
    expect(isKanaReadable(s)).toBe(false);
  });

  it('全行終えれば卒業', () => {
    expect(isKanaGraduated(state(KANA_ROWS.map((r) => r.rowId)))).toBe(true);
  });

  it('チェック未実施・対象外の扱いは従来どおり', () => {
    expect(isKanaReadable(null)).toBe(true);                                   // 対象外
    expect(isKanaReadable({ needed: false, doneRowIds: [], checkedAt: NOW })).toBe(true);
    expect(isKanaReadable({ needed: null, doneRowIds: [], checkedAt: NOW })).toBe(false); // 未チェック
  });
});

describe('1日に進む行数が学習時間に合う', () => {
  it('5分<15分<30分 の順に増える', () => {
    expect(kanaRowsPerDay(5)).toBeLessThan(kanaRowsPerDay(15));
    expect(kanaRowsPerDay(15)).toBeLessThan(kanaRowsPerDay(30));
  });

  it('どの設定でも清音は10日以内に終わる（本編開始が遠すぎない）', () => {
    for (const m of [5, 15, 30] as const) {
      const days = Math.ceil(seionRows.length / kanaRowsPerDay(m));
      expect(days, `1日${m}分だと本編開始まで${days}日`).toBeLessThanOrEqual(10);
    }
  });

  it('todaysKanaRowIds が指定した行数を返す', () => {
    expect(todaysKanaRowIds(state([]), 3)).toHaveLength(3);
    expect(todaysKanaRowIds(state([]), 5)).toHaveLength(5);
    // 残りが少なければ残りぶんだけ
    expect(todaysKanaRowIds(state(KANA_ROWS.slice(0, -2).map((r) => r.rowId)), 5)).toHaveLength(2);
  });
});
