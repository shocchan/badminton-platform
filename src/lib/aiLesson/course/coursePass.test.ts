// 通行証の取得。**いちばん守りたいのは「失敗しても学習が止まらないこと」。**
// 門は既定でOFFなので、取得に失敗しても教材は配られる。ここで例外を投げたり
// 例外を伝播させたりすると、教材が読めるのに学習画面が動かない、という最悪の壊れ方になる。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const getAccessToken = vi.fn<() => Promise<string | null>>();
vi.mock('./courseAuth', () => ({ getAccessToken: () => getAccessToken() }));

const { ensureCoursePass, renewCoursePass, resetCoursePassCacheForTest } =
  await import('./coursePass');

const originalFetch = globalThis.fetch;

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  resetCoursePassCacheForTest();
  getAccessToken.mockReset();
  getAccessToken.mockResolvedValue('token-abc');
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('失敗しても学習を止めない', () => {
  it('通信できないときは例外にせず unavailable を返す', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(ensureCoursePass()).resolves.toBe('unavailable');
  });

  it('getAccessToken が投げても例外にせず error を返す', async () => {
    getAccessToken.mockRejectedValue(new Error('boom'));
    globalThis.fetch = vi.fn();
    await expect(ensureCoursePass()).resolves.toBe('error');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('JSONが壊れていても例外にせず error を返す', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    await expect(ensureCoursePass()).resolves.toBe('error');
  });

  it('500 系は unavailable（利用者のせいにしない）', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    await expect(ensureCoursePass()).resolves.toBe('unavailable');
  });
});

describe('正常系', () => {
  it('exp を受け取れば granted', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ ok: true, exp: Date.now() + 3_600_000 }));
    await expect(ensureCoursePass()).resolves.toBe('granted');
  });

  it('Worker が「門は無効」と言えば disabled（正常応答として扱う）', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonRes({ ok: true, gate: 'disabled' }));
    await expect(ensureCoursePass()).resolves.toBe('disabled');
  });

  it('Bearer と credentials を付けて POST する', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes({ ok: true, exp: Date.now() + 3_600_000 }));
    globalThis.fetch = f;
    await ensureCoursePass();
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('/_course/pass');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer token-abc');
    expect(init.credentials).toBe('same-origin');
  });

  it('未ログインならリクエストを出さず unauthorized', async () => {
    getAccessToken.mockResolvedValue(null);
    const f = vi.fn();
    globalThis.fetch = f;
    await expect(ensureCoursePass()).resolves.toBe('unauthorized');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('無駄な再取得をしない', () => {
  it('有効な通行証がある間は再リクエストしない', async () => {
    const now = 1_700_000_000_000;
    const f = vi.fn().mockResolvedValue(jsonRes({ ok: true, exp: now + 6 * 3_600_000 }));
    globalThis.fetch = f;
    await ensureCoursePass(now);
    await ensureCoursePass(now + 1000);
    await ensureCoursePass(now + 60_000);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('期限の10分前を切ったら取り直す（学習中に403になるのを避ける）', async () => {
    const now = 1_700_000_000_000;
    const exp = now + 11 * 60 * 1000; // 残り11分
    const f = vi.fn().mockResolvedValue(jsonRes({ ok: true, exp }));
    globalThis.fetch = f;
    await ensureCoursePass(now);
    await ensureCoursePass(now + 2 * 60 * 1000); // 残り9分 → 取り直す
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('同時に複数から呼ばれてもリクエストは1本にまとまる', async () => {
    let resolveIt: (r: Response) => void = () => {};
    const f = vi.fn().mockReturnValue(new Promise<Response>((r) => { resolveIt = r; }));
    globalThis.fetch = f;
    const a = ensureCoursePass();
    const b = ensureCoursePass();
    const c = ensureCoursePass();
    resolveIt(jsonRes({ ok: true, exp: Date.now() + 3_600_000 }));
    expect(await Promise.all([a, b, c])).toEqual(['granted', 'granted', 'granted']);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('disabled のあとも覚え込まない（門をONにしたら次で取りに行ける）', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(jsonRes({ ok: true, gate: 'disabled' }))
      .mockResolvedValueOnce(jsonRes({ ok: true, exp: Date.now() + 3_600_000 }));
    globalThis.fetch = f;
    await expect(ensureCoursePass()).resolves.toBe('disabled');
    await expect(ensureCoursePass()).resolves.toBe('granted');
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe('403 からの復帰', () => {
  it('renewCoursePass は覚え書きを捨てて必ず取り直す', async () => {
    const f = vi.fn().mockResolvedValue(jsonRes({ ok: true, exp: Date.now() + 6 * 3_600_000 }));
    globalThis.fetch = f;
    await ensureCoursePass();
    await renewCoursePass();
    expect(f).toHaveBeenCalledTimes(2);
  });
});
