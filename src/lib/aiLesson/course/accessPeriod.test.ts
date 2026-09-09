import { describe, it, expect } from 'vitest';
import { accessPeriodNotice, daysLeft, hoursLeft, levelOf } from './accessPeriod';

const NOW = '2026-09-09T10:00:00.000Z';

describe('daysLeft / hoursLeft', () => {
  it('今日を1日と数える（切り上げ）', () => {
    expect(daysLeft('2026-09-10T10:00:00.000Z', NOW)).toBe(1);
    expect(daysLeft('2026-09-10T11:00:00.000Z', NOW)).toBe(2);
    expect(daysLeft('2026-09-16T10:00:00.000Z', NOW)).toBe(7);
  });

  it('過ぎていたら0（マイナスにしない）', () => {
    expect(daysLeft('2026-09-01T10:00:00.000Z', NOW)).toBe(0);
    expect(hoursLeft('2026-09-01T10:00:00.000Z', NOW)).toBe(0);
  });

  it('壊れた日付でも落ちない', () => {
    expect(daysLeft('not-a-date', NOW)).toBe(0);
    expect(hoursLeft('2026-09-10T10:00:00.000Z', 'not-a-date')).toBe(0);
  });
});

describe('levelOf', () => {
  it('7日以下で注意、3日以下で強め', () => {
    expect(levelOf(30)).toBe('normal');
    expect(levelOf(8)).toBe('normal');
    expect(levelOf(7)).toBe('soon');
    expect(levelOf(4)).toBe('soon');
    expect(levelOf(3)).toBe('last');
    expect(levelOf(0)).toBe('last');
  });
});

describe('accessPeriodNotice', () => {
  const base = { nowISO: NOW, lang: 'ja' as const };

  it('期限と残り日数を出す（これまで9人には何も出ていなかった）', () => {
    const n = accessPeriodNotice({ ...base, validUntilISO: '2026-10-09T10:00:00.000Z' })!;
    expect(n.headline).toContain('2026/10/9');
    expect(n.headline).toContain('あと30日');
    expect(n.level).toBe('normal');
  });

  it('**始めていない体験は残り日数を数えない**（時計が動いていないのに減らさない）', () => {
    const n = accessPeriodNotice({
      ...base, validUntilISO: '2026-10-09T10:00:00.000Z',
      trialDays: 7, trialStartedAtISO: null,
    })!;
    expect(n.headline).toContain('7日間');
    expect(n.headline).not.toContain('あと');
    expect(n.sub).toContain('開始できるのは');
  });

  it('体験を始めていれば、通常どおり残りを数える', () => {
    const n = accessPeriodNotice({
      ...base, validUntilISO: '2026-09-14T10:00:00.000Z',
      trialDays: 7, trialStartedAtISO: '2026-09-07T10:00:00.000Z',
    })!;
    expect(n.headline).toContain('あと5日');
    expect(n.level).toBe('soon');
  });

  it('最終日は時間で言う（「あと1日」だと粗い）', () => {
    const n = accessPeriodNotice({ ...base, validUntilISO: '2026-09-09T18:00:00.000Z' })!;
    expect(n.headline).toContain('時間');
    expect(n.level).toBe('last');
  });

  it('過ぎていたら、次にどうすればいいかを添える', () => {
    const n = accessPeriodNotice({ ...base, validUntilISO: '2026-09-01T10:00:00.000Z' })!;
    expect(n.headline).toContain('過ぎました');
    expect(n.sub).toContain('先生に言って');
  });

  it('日付が壊れている行では何も出さない（推測した日付を書かない）', () => {
    expect(accessPeriodNotice({ ...base, validUntilISO: 'not-a-date' })).toBe(null);
  });

  it('中国語版がある。かなが混ざらない', () => {
    const kana = /[ぁ-んァ-ヴ]/;
    for (const until of ['2026-10-09T10:00:00.000Z', '2026-09-09T18:00:00.000Z', '2026-09-01T10:00:00.000Z']) {
      const n = accessPeriodNotice({ nowISO: NOW, lang: 'zh', validUntilISO: until })!;
      expect(kana.test(n.headline), n.headline).toBe(false);
      if (n.sub) expect(kana.test(n.sub), n.sub).toBe(false);
    }
    const notStarted = accessPeriodNotice({
      nowISO: NOW, lang: 'zh', validUntilISO: '2026-10-09T10:00:00.000Z',
      trialDays: 7, trialStartedAtISO: null,
    })!;
    expect(kana.test(notStarted.headline)).toBe(false);
  });

  it('煽らない（急かす言葉を入れない）', () => {
    for (const until of ['2026-09-10T10:00:00.000Z', '2026-09-11T10:00:00.000Z']) {
      const n = accessPeriodNotice({ ...base, validUntilISO: until })!;
      for (const ng of ['急い', '今すぐ', '注意！', '警告']) {
        expect(n.headline.includes(ng), n.headline).toBe(false);
      }
    }
  });
});
