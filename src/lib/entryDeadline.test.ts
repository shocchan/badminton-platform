import { describe, it, expect } from 'vitest';
import {
  standardEntryDeadline,
  effectiveEntryDeadline,
  isEntryClosed,
  isLateEntryWindow,
  isCreditOnly,
  formatDeadline,
} from './entryDeadline';

// 大会28（8/13開催）を追加受付する想定。共通ルールの締切は 7/30 23:59:59 JST
const T28 = { event_date: '2026-08-13', late_entry_until: '2026-08-10T23:59:59+09:00' };
// override が無い通常の大会（8/27開催 → 共通ルールで 8/13 23:59:59 JST 締切）
const T30 = { event_date: '2026-08-27', late_entry_until: null };

const jst = (s: string) => new Date(`${s}+09:00`);

describe('共通ルール（開催14日前 23:59:59 JST）', () => {
  it('開催14日前の23:59:59 JST になる', () => {
    expect(standardEntryDeadline('2026-08-13').toISOString()).toBe('2026-07-30T14:59:59.000Z');
    expect(standardEntryDeadline('2026-08-27').toISOString()).toBe('2026-08-13T14:59:59.000Z');
  });

  it('月をまたぐ場合も正しく14日引く', () => {
    expect(standardEntryDeadline('2026-03-05').toISOString()).toBe('2026-02-19T14:59:59.000Z');
  });
});

describe('override が無い大会は一切影響を受けない（要件3）', () => {
  it('締切前は申込可能', () => {
    expect(isEntryClosed(T30, jst('2026-08-13T23:59:58'))).toBe(false);
  });

  it('14日前を過ぎたら申込不可のまま', () => {
    expect(isEntryClosed(T30, jst('2026-08-14T00:00:00'))).toBe(true);
  });

  it('追加受付ウィンドウには入らない＝クレジット限定にもならない', () => {
    expect(isLateEntryWindow(T30, jst('2026-08-20T12:00:00'))).toBe(false);
    expect(isCreditOnly(T30, jst('2026-08-20T12:00:00'))).toBe(false);
  });

  it('適用される締切は共通ルールのまま', () => {
    expect(effectiveEntryDeadline(T30).toISOString()).toBe('2026-08-13T14:59:59.000Z');
  });
});

describe('大会28の追加受付（要件1・2）', () => {
  it('8月10日23:59:59までは申込可能', () => {
    expect(isEntryClosed(T28, jst('2026-08-10T23:59:59'))).toBe(false);
    expect(isEntryClosed(T28, jst('2026-08-10T23:00:00'))).toBe(false);
    expect(isEntryClosed(T28, jst('2026-08-02T12:00:00'))).toBe(false);
  });

  it('8月11日0:00以降は申込不可', () => {
    expect(isEntryClosed(T28, jst('2026-08-11T00:00:00'))).toBe(true);
    expect(isEntryClosed(T28, jst('2026-08-11T00:00:01'))).toBe(true);
    expect(isEntryClosed(T28, jst('2026-08-12T09:00:00'))).toBe(true);
  });

  it('共通締切(7/30)を過ぎてから8/10までが追加受付ウィンドウ', () => {
    expect(isLateEntryWindow(T28, jst('2026-07-30T23:59:58'))).toBe(false); // まだ通常受付
    expect(isLateEntryWindow(T28, jst('2026-08-02T12:00:00'))).toBe(true);
    expect(isLateEntryWindow(T28, jst('2026-08-10T23:59:59'))).toBe(true);
    expect(isLateEntryWindow(T28, jst('2026-08-11T00:00:00'))).toBe(false);
  });

  it('追加受付中はクレジットカードのみ（要件4）', () => {
    expect(isCreditOnly(T28, jst('2026-08-02T12:00:00'))).toBe(true);
    // 通常受付期間中は従来どおり全ての支払い方法
    expect(isCreditOnly(T28, jst('2026-07-20T12:00:00'))).toBe(false);
  });

  it('閲覧者のタイムゾーンに左右されない（絶対時刻で判定）', () => {
    // UTC 2026-08-10T14:59:59Z = JST 2026-08-10T23:59:59 → まだ受付中
    expect(isEntryClosed(T28, new Date('2026-08-10T14:59:59Z'))).toBe(false);
    // UTC 2026-08-10T15:00:00Z = JST 2026-08-11T00:00:00 → 締切
    expect(isEntryClosed(T28, new Date('2026-08-10T15:00:00Z'))).toBe(true);
  });
});

describe('override は締切の前倒しには使えても緩和にはならない', () => {
  it('共通ルールより手前の日時なら、そちらで締め切る', () => {
    const early = { event_date: '2026-08-27', late_entry_until: '2026-08-01T23:59:59+09:00' };
    expect(isEntryClosed(early, jst('2026-08-02T00:00:00'))).toBe(true);
  });
});

describe('締切の表示', () => {
  it('日本語は「8月10日（月）23:59」', () => {
    expect(formatDeadline(new Date('2026-08-10T23:59:59+09:00'), 'ja')).toBe('8月10日（月）23:59');
  });

  it('中国語は簡体字の曜日で出す', () => {
    expect(formatDeadline(new Date('2026-08-10T23:59:59+09:00'), 'zh')).toBe('8月10日（周一）23:59');
  });
});
