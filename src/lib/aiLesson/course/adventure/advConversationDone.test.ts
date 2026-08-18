// 会話完了の日付判定テスト（2026-08-19 CEO実害報告の回帰防止）。
// startedAt(UTC) をUTCのまま日付切りすると、現地の深夜〜朝9時(JST)に終えた会話が
// 「今日のもの」と認識されず、完了済みの会話がやり直しになっていた。
import { describe, it, expect } from 'vitest';

// AdvShell と同じ判定式（現地日付どうしの比較）
const dateKeyOf = (d = new Date()): string => d.toLocaleDateString('sv-SE');
const isTodaysSession = (startedAtISO: string, dateKey: string): boolean =>
  dateKeyOf(new Date(startedAtISO)) === dateKey;

describe('会話完了の日付判定（現地時間で比較する）', () => {
  it('現地の深夜0時台に終えた会話も「今日」と判定される', () => {
    // 現地 2026-08-19 00:40 に終えた会話（このテストが動く環境のTZで組み立てる）
    const local = new Date(2026, 7, 19, 0, 40, 0);   // 月は0起点: 7=8月
    const dateKey = dateKeyOf(local);
    expect(isTodaysSession(local.toISOString(), dateKey)).toBe(true);
    // 旧実装（UTCのまま切る）はTZがUTCより東の環境で false になっていたことを確認
    const utcSlice = local.toISOString().slice(0, 10);
    if (local.getTimezoneOffset() < 0 && local.getHours() < 9) {
      expect(utcSlice).not.toBe(dateKey);   // ここがバグの正体
    }
  });
  it('昨日の会話は今日と判定されない', () => {
    const yesterday = new Date(2026, 7, 18, 12, 0, 0);
    const todayKey = dateKeyOf(new Date(2026, 7, 19, 12, 0, 0));
    expect(isTodaysSession(yesterday.toISOString(), todayKey)).toBe(false);
  });
});
