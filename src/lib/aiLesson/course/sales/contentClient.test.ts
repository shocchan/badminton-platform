import { describe, it, expect } from 'vitest';
import { fetchStepContent, isRetryable, type ContentFetchDenial } from './contentClient';

const okBody = {
  stageId: 'area01-minato', stepIndex: 0, hasNextStep: true,
  items: [{
    deliveryId: 'sess-1:0', prompt: '問題', choices: ['あ', 'い', 'う', 'え'],
    correctChoiceId: 'c1', explanationJa: '解説', explanationZh: '说明',
    promptZh: null, passageJa: null,
  }],
};

const stubFetch = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  (async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json', ...headers },
  })) as unknown as typeof fetch;

const input = { accessToken: 'jwt', sessionToken: 'sess', stepIndex: 0 };

describe('教材の取得（client 側の入口）', () => {
  it('200 なら今のstepぶんを返す', async () => {
    const r = await fetchStepContent(input, { fetchFn: stubFetch(200, okBody) });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.step.items).toHaveLength(1);
      expect(r.step.items[0].choices).toEqual(['あ', 'い', 'う', 'え']);
    }
  });

  it('認証を Authorization ヘッダで送る', async () => {
    let seen: RequestInit | undefined;
    const spy = (async (_u: string, init: RequestInit) => {
      seen = init;
      return new Response(JSON.stringify(okBody), { status: 200 });
    }) as unknown as typeof fetch;
    await fetchStepContent(input, { fetchFn: spy });
    expect((seen?.headers as Record<string, string>).Authorization).toBe('Bearer jwt');
  });

  // 断られる理由は、そのまま学習者に見せる意味がある。潰さずに返す
  const denials: [number, string, ContentFetchDenial][] = [
    [401, 'unauthenticated', 'unauthenticated'],
    [403, 'no_entitlement', 'no_entitlement'],
    [403, 'trial_expired', 'trial_expired'],
    [403, 'trial_consumed', 'trial_consumed'],
    [403, 'stage_locked', 'stage_locked'],
    [403, 'session_not_owned', 'session_not_owned'],
    [403, 'step_out_of_range', 'step_out_of_range'],
  ];
  it.each(denials)('status %i / %s をそのまま返す', async (status, error, expected) => {
    const r = await fetchStepContent(input, { fetchFn: stubFetch(status, { error }) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial).toBe(expected);
  });

  it('429 は Retry-After を拾う', async () => {
    const r = await fetchStepContent(input, {
      fetchFn: stubFetch(429, { error: 'rate_limited' }, { 'Retry-After': '30' }),
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.denial).toBe('rate_limited');
      expect(r.retryAfterSeconds).toBe(30);
    }
  });

  it('通信断は例外にせず network として返す（学習中に普通に起きる）', async () => {
    const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
    const r = await fetchStepContent(input, { fetchFn: boom });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial).toBe('network');
  });

  it('401 は本文が壊れていても unauthenticated になる', async () => {
    const broken = (async () => new Response('<html>', { status: 401 })) as unknown as typeof fetch;
    const r = await fetchStepContent(input, { fetchFn: broken });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.denial).toBe('unauthenticated');
  });

  it('再試行してよいのは通信と混雑だけ（利用権切れで再試行ループを作らない）', () => {
    expect(isRetryable('network')).toBe(true);
    expect(isRetryable('rate_limited')).toBe(true);
    expect(isRetryable('no_entitlement')).toBe(false);
    expect(isRetryable('trial_expired')).toBe(false);
    expect(isRetryable('stage_locked')).toBe(false);
  });
});
