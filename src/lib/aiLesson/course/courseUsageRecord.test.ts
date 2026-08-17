// @vitest-environment jsdom
// 利用量記録の二層防御（2026-08-17 総監査P1）の受入テスト。
//
// いちばん守りたいこと:
// - **RPC（加算専用）が使える環境では、絶対値で上書きできる直接upsertを一切呼ばない**
// - RPC未適用の旧環境では従来どおり動く（フォールバック）
// - どちらも失敗したら pending キューへ積み、学習データを失わない
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = {
  rpcError: null as null | { message: string },
  upsertError: null as null | { message: string },
  row: null as unknown,
  rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
  upsertCalls: [] as Record<string, unknown>[],
  fromCalls: 0,
};

vi.mock('../../../services/supabaseClient', () => ({
  supabase: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      state.rpcCalls.push({ fn, args });
      return { data: state.rpcError ? null : { ok: true }, error: state.rpcError };
    },
    from: () => {
      state.fromCalls += 1;
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.row, error: null }) }) }),
        }),
        upsert: async (row: Record<string, unknown>) => {
          state.upsertCalls.push(row);
          return { error: state.upsertError };
        },
      };
    },
  },
}));

import { courseRepository } from './courseRepository';
import { jstTodayISO } from './courseUsage';

const PENDING_KEY = 'kawabado.aiCourse.v1.pending';

beforeEach(() => {
  localStorage.clear();
  state.rpcError = null;
  state.upsertError = null;
  state.row = null;
  state.rpcCalls = [];
  state.upsertCalls = [];
  state.fromCalls = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('recordUsage の二層防御', () => {
  it('**RPCが成功したら直接upsertを呼ばない**（絶対値上書き経路を使わない）', async () => {
    await courseRepository.recordUsage('learner-1', 180, 0.08);
    expect(state.rpcCalls).toHaveLength(1);
    expect(state.rpcCalls[0].fn).toBe('ai_record_usage');
    expect(state.fromCalls).toBe(0);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('RPCへは秒を整数へ丸めて渡す（数値検証はサーバ側でも実施）', async () => {
    await courseRepository.recordUsage('learner-1', 179.6, 0.08);
    expect(state.rpcCalls[0].args).toEqual({ p_seconds: 180, p_cost_usd: 0.08 });
  });

  it('RPC未適用の旧環境ではフォールバックが従来どおり加算で書く', async () => {
    state.rpcError = { message: 'function public.ai_record_usage does not exist' };
    state.row = { sessions_count: 3, seconds_used: 100, estimated_cost_usd: 0.5 };
    await courseRepository.recordUsage('learner-1', 120, 0.05);
    expect(state.upsertCalls).toHaveLength(1);
    expect(state.upsertCalls[0]).toMatchObject({
      learner_id: 'learner-1', usage_date: jstTodayISO(),
      sessions_count: 3, seconds_used: 220, estimated_cost_usd: 0.55,
    });
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });

  it('RPCもフォールバックも失敗したら pending キューへ積む（データを失わない）', async () => {
    state.rpcError = { message: 'network down' };
    state.upsertError = { message: 'network down' };
    await courseRepository.recordUsage('learner-1', 120, 0.05);
    const q = JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as { kind: string; payload: unknown }[];
    expect(q).toHaveLength(1);
    expect(q[0].kind).toBe('usage');
    expect(q[0].payload).toEqual({ learnerId: 'learner-1', seconds: 120, costUsd: 0.05 });
  });
});

describe('jstTodayISO（利用量の「今日」はAsia/Tokyo）', () => {
  it('JST早朝はUTC前日でなくJST当日を返す（サーバ側の行と一致）', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-16T20:30:00Z')); // JST 2026-08-17 05:30
    expect(jstTodayISO()).toBe('2026-08-17');
    expect(new Date().toISOString().slice(0, 10)).toBe('2026-08-16'); // 従来のUTC日付とはずれる時間帯
  });

  it('JST日中はUTC日付と一致する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-17T03:00:00Z')); // JST 2026-08-17 12:00
    expect(jstTodayISO()).toBe('2026-08-17');
  });
});
