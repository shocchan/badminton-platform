/*
 * 個人専用URL（学習コード）でのログイン。
 *
 * いちばん守りたいこと（2026-09-09 実機で壊れていた）:
 *   **先に誰かがログインしている端末でも、コードの持ち主に入れ替わること。**
 *   以前は「セッションがあればコードを使わない」近道があり、8人ぶんのどのURLを
 *   開いても先客のアカウントに着いていた。共用端末では他人の学習記録が見える。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const verifyOtp = vi.fn();
const signOut = vi.fn();
const getSessionMock = vi.fn();
vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    auth: {
      verifyOtp: (...a: unknown[]) => verifyOtp(...a),
      signOut: (...a: unknown[]) => signOut(...a),
      getSession: () => getSessionMock(),
    },
  },
}));

import { signInWithLearningCode } from './courseAuth';

const CODE = 'K7PX-29QM-4T6B';
const okResponse = (body: unknown) => ({ ok: true, json: async () => body });

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  getSessionMock.mockReset().mockResolvedValue({ data: { session: { user: { id: 'someone-else' } } } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse({ ok: true, tokenHash: 'th_abc' })));
});

describe('signInWithLearningCode', () => {
  it('**別の人が入っている端末でも、コードを必ず使ってセッションを入れ替える**', async () => {
    const r = await signInWithLearningCode(CODE);
    expect(r.ok).toBe(true);
    // コードをサーバーへ出している（近道で素通りしていない）
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'th_abc', type: 'magiclink' });
  });

  it('signOut は**トークンを受け取ったあと**（先に消すと、失敗時に元のセッションまで失う）', async () => {
    const order: string[] = [];
    (fetch as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push('fetch'); return okResponse({ ok: true, tokenHash: 'th_abc' });
    });
    signOut.mockImplementation(async () => { order.push('signOut'); return { error: null }; });
    verifyOtp.mockImplementation(async () => { order.push('verifyOtp'); return { error: null }; });

    await signInWithLearningCode(CODE);
    expect(order).toEqual(['fetch', 'signOut', 'verifyOtp']);
  });

  it('コードが通らなければ signOut しない（入れないうえに追い出さない）', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: false, json: async () => ({ ok: false, code: 'invalid_code' }) },
    );
    const r = await signInWithLearningCode(CODE);
    expect(r).toEqual({ ok: false, code: 'invalid_code', retryAfter: undefined });
    expect(signOut).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('形が違うコードはサーバーへ送らない', async () => {
    const r = await signInWithLearningCode('andy');
    expect(r).toEqual({ ok: false, code: 'invalid_code' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('通信が落ちたら network（原因を作り話しない）', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('offline'));
    expect(await signInWithLearningCode(CODE)).toEqual({ ok: false, code: 'network' });
  });
});
