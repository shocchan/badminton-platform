// 期間制の利用権（半年伴走コースなど）の判定。
//
// ここを間違えると、払った人が使えない／払っていない人が使える のどちらかになる。
// 開始前・期間中・終了後の境界と、通信が失敗したときの倒れ方を固定する。

import { describe, it, expect, vi, beforeEach } from 'vitest';

const select = vi.fn();
vi.mock('../../../../services/supabaseClient', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: select }) }) }) }) },
}));

const { currentPeriodEntitlement } = await import('./periodEntitlement');

const ok = (rows: unknown[]) => { select.mockResolvedValue({ data: rows, error: null }); };
const fail = () => { select.mockResolvedValue({ data: null, error: { message: 'network' } }); };

const HALF_YEAR = {
  id: 'e1', plan_id: 'six_month_coaching',
  granted_at: '2026-08-01T00:00:00Z',
  expires_at: '2027-02-01T00:00:00Z',
  period_ends_at: '2027-02-01T00:00:00Z',
  active_seconds: null, status: 'active',
};
const at = (iso: string) => Date.parse(iso);

beforeEach(() => select.mockReset());

describe('期間制の利用権', () => {
  it('期間中は使える', async () => {
    ok([HALF_YEAR]);
    const r = await currentPeriodEntitlement('L1', at('2026-11-01T00:00:00Z'));
    expect(r.kind).toBe('active');
  });

  it('開始日ちょうどから使える', async () => {
    ok([HALF_YEAR]);
    expect((await currentPeriodEntitlement('L1', at('2026-08-01T00:00:00Z'))).kind).toBe('active');
  });

  it('開始日より前は before_start（料金ページへは送らない）', async () => {
    ok([HALF_YEAR]);
    const r = await currentPeriodEntitlement('L1', at('2026-07-31T23:59:00Z'));
    expect(r.kind).toBe('before_start');
  });

  it('終了日時ちょうどで終わる', async () => {
    ok([HALF_YEAR]);
    expect((await currentPeriodEntitlement('L1', at('2027-02-01T00:00:00Z'))).kind).toBe('expired');
  });

  it('60分パス（時間制）は拾わない — 終了条件が違うため', async () => {
    ok([{ ...HALF_YEAR, active_seconds: 3600 }]);
    expect((await currentPeriodEntitlement('L1', at('2026-11-01T00:00:00Z'))).kind).toBe('none');
  });

  it('通信に失敗したら「利用権なし」に倒す — 失敗して教材が開くほうが危ない', async () => {
    fail();
    expect((await currentPeriodEntitlement('L1'))).toEqual({ kind: 'none' });
  });

  it('複数あるときは、いま使えるものを選ぶ', async () => {
    ok([
      { ...HALF_YEAR, id: 'old', granted_at: '2025-01-01T00:00:00Z', period_ends_at: '2025-07-01T00:00:00Z', expires_at: '2025-07-01T00:00:00Z' },
      HALF_YEAR,
    ]);
    const r = await currentPeriodEntitlement('L1', at('2026-11-01T00:00:00Z'));
    expect(r.kind).toBe('active');
    expect(r.kind === 'active' && r.entitlement.id).toBe('e1');
  });

  it('全部終わっていたら expired', async () => {
    ok([HALF_YEAR]);
    expect((await currentPeriodEntitlement('L1', at('2030-01-01T00:00:00Z'))).kind).toBe('expired');
  });
});
