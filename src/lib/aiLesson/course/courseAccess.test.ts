// 受講権判定の回帰テスト（2026-08-18）。
// 期限で止める仕組みはこれが初めてなので、境界（開始前・期限当日・期限翌日）を固定する。
import { describe, it, expect } from 'vitest';
import { accessStateOf } from './courseAccess';

const row = {
  validFromISO: '2026-09-01T00:00:00+09:00',
  validUntilISO: '2026-11-30T23:59:59+09:00',
  note: null,
};

describe('受講権の判定', () => {
  it('期間内は active', () => {
    expect(accessStateOf(row, '2026-10-01T12:00:00+09:00', false).kind).toBe('active');
  });
  it('開始前は not_started（kanaさん: 9月からの3ヶ月）', () => {
    expect(accessStateOf(row, '2026-08-20T12:00:00+09:00', false).kind).toBe('not_started');
  });
  it('期限最終日の23時台はまだ使える', () => {
    expect(accessStateOf(row, '2026-11-30T23:30:00+09:00', false).kind).toBe('active');
  });
  it('期限の翌日は expired', () => {
    expect(accessStateOf(row, '2026-12-01T00:30:00+09:00', false).kind).toBe('expired');
  });
  it('行が無い人は none（未開通）', () => {
    expect(accessStateOf(null, '2026-10-01T00:00:00+09:00', false).kind).toBe('none');
  });
  it('管理者は行が無くても・期限が切れていても通る', () => {
    expect(accessStateOf(null, '2026-10-01T00:00:00+09:00', true).kind).toBe('admin');
    expect(accessStateOf(row, '2027-06-01T00:00:00+09:00', true).kind).toBe('admin');
  });
});
