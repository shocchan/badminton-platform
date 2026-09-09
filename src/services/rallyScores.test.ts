import { describe, it, expect, vi, beforeEach } from 'vitest';

const getSession = vi.fn();
const rpc = vi.fn();
vi.mock('./supabaseClient', () => ({
  supabase: {
    auth: { getSession: () => getSession() },
    rpc: (...a: unknown[]) => rpc(...a),
  },
}));

import { fetchMyRallyBest } from './rallyScores';

const loggedIn = () => getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
const guest = () => getSession.mockResolvedValue({ data: { session: null } });

describe('fetchMyRallyBest', () => {
  beforeEach(() => { getSession.mockReset(); rpc.mockReset(); });

  it('本人の記録を返す（端末ではなくアカウント単位）', async () => {
    loggedIn(); rpc.mockResolvedValue({ data: 23, error: null });
    expect(await fetchMyRallyBest()).toBe(23);
    expect(rpc).toHaveBeenCalledWith('game_my_best', { p_mode: 'rally' });
  });

  it('記録が無ければ0。**localStorageで埋めない**（これが「全員19」の原因だった）', async () => {
    loggedIn(); rpc.mockResolvedValue({ data: 0, error: null });
    expect(await fetchMyRallyBest()).toBe(0);
  });

  it('未ログインは null。ゲストの端末記録を0で塗り潰さない', async () => {
    guest();
    expect(await fetchMyRallyBest()).toBe(null);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('RPCが無い・落ちたときは null（数字を作らない）', async () => {
    loggedIn(); rpc.mockResolvedValue({ data: null, error: { message: 'PGRST202' } });
    expect(await fetchMyRallyBest()).toBe(null);

    rpc.mockRejectedValue(new Error('network'));
    expect(await fetchMyRallyBest()).toBe(null);
  });

  it('壊れた値は null にする', async () => {
    loggedIn(); rpc.mockResolvedValue({ data: 'abc', error: null });
    expect(await fetchMyRallyBest()).toBe(null);
  });
});
