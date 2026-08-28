// 参加費の表示ロジック。ダブルスはペア単位で登録されているため、
// 1人あたりへの換算を間違えると表示金額が倍/半分になる。
import { describe, it, expect } from 'vitest';
import { isDoublesEvent, feePerPerson, feeDisplay, isShuttleFree } from './fee';
import type { Tournament } from '../types';

const t = (over: Partial<Tournament>): Tournament =>
  ({ event_type: 'シングルス', entry_fee: 1000, level: '初級', ...over }) as Tournament;

describe('isDoublesEvent', () => {
  it('ダブルスを含む種目はダブルス扱い', () => {
    expect(isDoublesEvent(t({ event_type: '男子ダブルス' }))).toBe(true);
    expect(isDoublesEvent(t({ event_type: '混合ダブルス' }))).toBe(true);
  });

  it('シングルスはダブルスではない', () => {
    expect(isDoublesEvent(t({ event_type: 'シングルス' }))).toBe(false);
  });

  it('種目が未設定でも落ちない', () => {
    expect(isDoublesEvent(t({ event_type: undefined }))).toBe(false);
  });
});

describe('feePerPerson: 1人あたりの参加費', () => {
  it('シングルスはそのままの金額', () => {
    expect(feePerPerson(t({ entry_fee: 1500 }))).toBe(1500);
  });

  it('ダブルスはペア料金を半額にする', () => {
    expect(feePerPerson(t({ event_type: '女子ダブルス', entry_fee: 3000 }))).toBe(1500);
  });

  it('割り切れないペア料金は四捨五入する', () => {
    expect(feePerPerson(t({ event_type: '男子ダブルス', entry_fee: 2500 }))).toBe(1250);
    expect(feePerPerson(t({ event_type: '男子ダブルス', entry_fee: 2501 }))).toBe(1251);
  });

  it('無料イベントは0のまま', () => {
    expect(feePerPerson(t({ event_type: '男子ダブルス', entry_fee: 0 }))).toBe(0);
  });
});

describe('feeDisplay: 表示文字列', () => {
  it('シングルスは「/人」を付けない', () => {
    expect(feeDisplay(t({ entry_fee: 1500 }))).toBe('¥1,500');
  });

  it('ダブルスは日本語で「/人」を付ける', () => {
    expect(feeDisplay(t({ event_type: '男子ダブルス', entry_fee: 3000 }))).toBe('¥1,500 /人');
  });

  it('ダブルスは中国語で「/人」を付ける（スペースなし）', () => {
    expect(feeDisplay(t({ event_type: '男子ダブルス', entry_fee: 3000 }), 'zh')).toBe('¥1,500/人');
  });

  it('4桁以上はカンマ区切りにする', () => {
    expect(feeDisplay(t({ entry_fee: 12000 }))).toBe('¥12,000');
  });
});

describe('isShuttleFree: シャトル持参不要の判定', () => {
  it('超初級ダブルスのみ持参不要', () => {
    expect(isShuttleFree(t({ level: '超初級', event_type: '男子ダブルス' }))).toBe(true);
  });

  it('超初級でもシングルスなら持参が必要', () => {
    expect(isShuttleFree(t({ level: '超初級', event_type: 'シングルス' }))).toBe(false);
  });

  it('初級ダブルスは持参が必要', () => {
    expect(isShuttleFree(t({ level: '初級', event_type: '男子ダブルス' }))).toBe(false);
  });
});
