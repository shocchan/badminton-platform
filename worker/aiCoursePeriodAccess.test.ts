// 期間制の利用権を、サーバーが台帳で確かめること。
//
// ここが緩むと「払っていない人が教材を取れる」。逆に厳しすぎると
// 「払った人が使えない」。どちらも売り物として成立しないので境界を固定する。

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hasActivePeriodAccess } from './aiCoursePeriodAccess';

const ENV = { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
const NOW = Date.parse('2026-11-01T00:00:00Z');

const HALF_YEAR = {
  granted_at: '2026-08-01T00:00:00Z',
  expires_at: '2027-02-01T00:00:00Z',
  period_ends_at: '2027-02-01T00:00:00Z',
  active_seconds: null,
};

/** ai_learners → ai_plan_entitlements の順で応答を返す */
const mockDb = (learner: unknown[], entitlements: unknown[] | 'error') => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    if (String(url).includes('ai_learners')) {
      return new Response(JSON.stringify(learner), { status: 200 });
    }
    if (entitlements === 'error') return new Response('boom', { status: 500 });
    return new Response(JSON.stringify(entitlements), { status: 200 });
  }));
};

beforeEach(() => vi.unstubAllGlobals());

describe('サーバー側の期間制チェック', () => {
  it('期間中なら通す', async () => {
    mockDb([{ id: 'L1' }], [HALF_YEAR]);
    expect(await hasActivePeriodAccess(ENV, 'U1', NOW)).toBe(true);
  });

  it('期間が終わっていたら通さない', async () => {
    mockDb([{ id: 'L1' }], [HALF_YEAR]);
    expect(await hasActivePeriodAccess(ENV, 'U1', Date.parse('2027-03-01T00:00:00Z'))).toBe(false);
  });

  it('開始前は通さない', async () => {
    mockDb([{ id: 'L1' }], [HALF_YEAR]);
    expect(await hasActivePeriodAccess(ENV, 'U1', Date.parse('2026-07-01T00:00:00Z'))).toBe(false);
  });

  it('利用権が1件も無ければ通さない', async () => {
    mockDb([{ id: 'L1' }], []);
    expect(await hasActivePeriodAccess(ENV, 'U1', NOW)).toBe(false);
  });

  it('learner が居なければ通さない', async () => {
    mockDb([], [HALF_YEAR]);
    expect(await hasActivePeriodAccess(ENV, 'U1', NOW)).toBe(false);
  });

  it('時間制（60分パス）は期間制として通さない', async () => {
    mockDb([{ id: 'L1' }], [{ ...HALF_YEAR, active_seconds: 3600 }]);
    expect(await hasActivePeriodAccess(ENV, 'U1', NOW)).toBe(false);
  });

  it('台帳が引けなかったら通さない — 失敗して開くほうが危ない', async () => {
    mockDb([{ id: 'L1' }], 'error');
    expect(await hasActivePeriodAccess(ENV, 'U1', NOW)).toBe(false);
  });

  it('service_role が設定されていない環境では通さない', async () => {
    mockDb([{ id: 'L1' }], [HALF_YEAR]);
    expect(await hasActivePeriodAccess({ SUPABASE_URL: ENV.SUPABASE_URL }, 'U1', NOW)).toBe(false);
  });

  it('期限切れの1件があっても、有効な1件があれば通す', async () => {
    mockDb([{ id: 'L1' }], [
      { ...HALF_YEAR, granted_at: '2025-01-01T00:00:00Z', period_ends_at: '2025-07-01T00:00:00Z' },
      HALF_YEAR,
    ]);
    expect(await hasActivePeriodAccess(ENV, 'U1', NOW)).toBe(true);
  });
});
