// アップセル案内（1か月 → 6か月）の判定テスト。
// いちばん守りたいのは **「対象外の人（6か月生徒・従来契約）に出さない」** と
// **「閉じたらしつこく出さない」**。
import { describe, it, expect } from 'vitest';
import { upsellMomentFor, UPSELL_COPY } from './planUpsell';

const base = {
  planId: 'ai-month' as string | null,
  nowISO: '2026-09-01T10:00:00.000Z',
  validFromISO: '2026-08-20T00:00:00.000Z',
  validUntilISO: '2026-09-19T00:00:00.000Z',
  sessionCount: 0,
  dismissedAtISO: null as string | null,
};

describe('対象者の絞り込み', () => {
  it('**plan_id が ai-month 以外（null含む）には出さない**', () => {
    expect(upsellMomentFor({ ...base, planId: null, sessionCount: 10 })).toBeNull();
    expect(upsellMomentFor({ ...base, planId: 'coach-6m', sessionCount: 10 })).toBeNull();
    expect(upsellMomentFor({ ...base, planId: 'ai-trial-pass', sessionCount: 10 })).toBeNull();
  });
});

describe('表示タイミング', () => {
  it('AI会話3回以上で出る', () => {
    expect(upsellMomentFor({ ...base, sessionCount: 3 })).toBe('after_sessions');
    expect(upsellMomentFor({ ...base, sessionCount: 2, nowISO: '2026-08-22T00:00:00.000Z' })).toBeNull();
  });

  it('利用開始から7日後に出る', () => {
    expect(upsellMomentFor({ ...base, nowISO: '2026-08-27T00:00:00.000Z' })).toBe('day7');
    expect(upsellMomentFor({ ...base, nowISO: '2026-08-24T00:00:00.000Z' })).toBeNull();
  });

  it('**有効期限7日前は他より優先して expiry_soon**', () => {
    expect(upsellMomentFor({ ...base, sessionCount: 10, nowISO: '2026-09-14T00:00:00.000Z' })).toBe('expiry_soon');
  });

  it('期限切れ後は expiry_soon にならない（会話3回の条件だけ残る）', () => {
    expect(upsellMomentFor({ ...base, sessionCount: 0, nowISO: '2026-09-25T00:00:00.000Z' })).toBe('day7');
  });
});

describe('閉じたあとの抑制', () => {
  it('**閉じてから7日間は出さない**', () => {
    const dismissed = { ...base, sessionCount: 10, dismissedAtISO: '2026-08-30T00:00:00.000Z' };
    expect(upsellMomentFor(dismissed)).toBeNull();
    // 7日経過後は再表示
    expect(upsellMomentFor({ ...dismissed, nowISO: '2026-09-07T00:00:01.000Z' })).toBe('after_sessions');
  });
});

describe('文言', () => {
  it('ja/zh がそろっていて、上達保証の表現を使わない', () => {
    for (const lang of ['ja', 'zh'] as const) {
      expect(UPSELL_COPY[lang].body.length).toBeGreaterThan(0);
      expect(UPSELL_COPY[lang].cta.length).toBeGreaterThan(0);
    }
    expect(UPSELL_COPY.ja.body).not.toMatch(/必ず|保証/);
    expect(UPSELL_COPY.zh.body).not.toMatch(/一定|保证/);
  });
});
