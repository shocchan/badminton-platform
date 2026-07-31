// 同期つきStoragePort（H2準備）のガード。
// - probeが失敗する環境（remote未適用の現在）では配線されず、従来挙動が変わらないこと
// - 有効時: local一次保存＋サーバ送出、サーバ空なら既存local進捗の引き上げ、サーバ断でも学習継続
import { describe, it, expect } from 'vitest';
import {
  probeUnitProgressTable, probeUnitProgressSync, createSyncedUnitStorage,
  type ProbeClient, type FullProbeClient,
} from './syncedUnitStorage';
import { createLocalStorageCachePort } from './localStorageCachePort';
import { localUnitStorageKey } from '../n3unit/localUnitStorage';
import { emptyRunState } from '../n3unit/unitRuntime';
import type { SupabaseLike } from './supabaseUnitProgressServer';
import type { OutboxEntry, StoredProgress } from './unitProgressRepository';

/** Map実装のStorage（localStorage相当） */
const memStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  } as Storage;
};

/** in-memory の ai_course_unit_progress ＋ RPC（本物のRPC仕様を最小再現） */
const fakeServer = (opts: { tableExists: boolean; down?: boolean }) => {
  const rows = new Map<string, { learner_id: string; unit_id: string; state: unknown; row_version: number; last_mutation_id: string; updated_at: string }>();
  const key = (l: string, u: string) => `${l}/${u}`;
  const client: SupabaseLike & ProbeClient = {
    from: (table: string) => ({
      select: (col: string, selectOpts?: { count: 'exact'; head: true }) => {
        void col; void selectOpts;
        // GET probe: テーブルが有れば data:[]（RLSで0行でも配列）、無ければ PGRST205 相当のerror
        const probeResult = { limit: async (n: number) => { void n; return opts.tableExists && !opts.down ? { data: [], error: null } : { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } }; } };
        const chain = {
          ...probeResult,
          eq: (_c1: string, l: string) => ({
            eq: (_c2: string, u: string) => ({
              maybeSingle: async () => {
                if (opts.down) return { data: null, error: { message: 'fetch failed' } };
                if (!opts.tableExists) return { data: null, error: { code: '42P01', message: 'missing' } };
                const r = rows.get(key(l, u));
                return { data: r ? { ...r, state: r.state as never } : null, error: null };
              },
            }),
          }),
        };
        void table;
        return chain as never;
      },
    }),
    rpc: async (_fn: string, args: Record<string, unknown>) => {
      if (opts.down) return { data: null, error: { message: 'fetch failed' } };
      if (!opts.tableExists) return { data: null, error: { code: '42P01', message: 'missing' } };
      const l = args.p_learner_id as string, u = args.p_unit_id as string;
      const expected = args.p_expected_row_version as number, mid = args.p_mutation_id as string;
      const cur = rows.get(key(l, u));
      if (!cur) {
        if (expected !== 0) return { data: null, error: { code: 'P0409', message: 'conflict' } };
        const row = { learner_id: l, unit_id: u, state: args.p_state, row_version: 1, last_mutation_id: mid, updated_at: new Date().toISOString() };
        rows.set(key(l, u), row);
        return { data: row as never, error: null };
      }
      if (cur.last_mutation_id === mid) return { data: cur as never, error: null };
      if (cur.row_version !== expected) return { data: null, error: { code: 'P0409', message: 'conflict' } };
      const row = { ...cur, state: args.p_state, row_version: cur.row_version + 1, last_mutation_id: mid, updated_at: new Date().toISOString() };
      rows.set(key(l, u), row);
      return { data: row as never, error: null };
    },
  };
  return { client, rows };
};

const L = 'learner-1';
const U = 'n3u-01-self';

describe('probeUnitProgressTable', () => {
  it('テーブルが無い（PGRST205）／例外はfalse、読めればtrue', async () => {
    expect(await probeUnitProgressTable(fakeServer({ tableExists: false }).client)).toBe(false);
    expect(await probeUnitProgressTable(fakeServer({ tableExists: true }).client)).toBe(true);
    const throwing = { from: () => { throw new Error('boom'); } } as unknown as ProbeClient;
    expect(await probeUnitProgressTable(throwing)).toBe(false);
  });
  it('HEAD風の error:null / data:null では有効化しない（staging実測 2026-07-29 の回帰）', async () => {
    const headLike = {
      from: () => ({ select: () => ({ limit: async () => ({ data: null, error: null }) }) }),
    } as unknown as ProbeClient;
    expect(await probeUnitProgressTable(headLike)).toBe(false);
  });
});

describe('probeUnitProgressSync（完全probe・GATE①）', () => {
  /** 列・行・RPCの応答を差し替えられるprobe用client */
  const probeClient = (o: {
    selectError?: { code?: string };
    rows?: unknown[];
    rpcError?: { code?: string } | null;
    throwOnFrom?: boolean;
  }): FullProbeClient => ({
    from: () => {
      if (o.throwOnFrom) throw new Error('boom');
      return {
        select: () => ({
          limit: async () => (o.selectError
            ? { data: null, error: { ...o.selectError, message: 'x' } }
            : { data: o.rows ?? [], error: null }),
        }),
      };
    },
    rpc: async () => (o.rpcError ? { data: null, error: { ...o.rpcError, message: 'x' } } : { data: {}, error: null }),
  });

  it('すべて満たせば enabled=true（RPCはP0409＝存在＋楽観ロックが効いている）', async () => {
    const r = await probeUnitProgressSync(probeClient({ rows: [], rpcError: { code: 'P0409' } }), L);
    expect(r.enabled).toBe(true);
    expect(r.checks).toEqual({ table: true, columns: true, rls: true, rpc: true, version: true });
  });
  it('列不足（42703）は無効化する = tableだけでは有効化しない', async () => {
    const r = await probeUnitProgressSync(probeClient({ selectError: { code: '42703' } }), L);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('select:42703');
    expect(r.checks.columns).toBe(false);
  });
  it('テーブル無し（PGRST205）は無効化する', async () => {
    const r = await probeUnitProgressSync(probeClient({ selectError: { code: 'PGRST205' } }), L);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('select:PGRST205');
  });
  it('他人の行が見えたら無効化する（RLSが効いていない疑い）', async () => {
    const r = await probeUnitProgressSync(probeClient({
      rows: [{ learner_id: 'someone-else', state: { version: 1 } }], rpcError: { code: 'P0409' },
    }), L);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('rls:foreign-rows-visible');
    expect(r.checks.rls).toBe(false);
  });
  it('サーバのstateが新しいschema versionなら無効化する（新しいデータを壊さない）', async () => {
    const r = await probeUnitProgressSync(probeClient({
      rows: [{ learner_id: L, state: { version: 99 } }], rpcError: { code: 'P0409' },
    }), L);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('version:server-newer');
  });
  it('RPCが存在しない（PGRST202）なら無効化する', async () => {
    const r = await probeUnitProgressSync(probeClient({ rows: [], rpcError: { code: 'PGRST202' } }), L);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('rpc:PGRST202');
    expect(r.checks.rpc).toBe(false);
  });
  it('HEAD風の data:null / error:null では有効化しない', async () => {
    const headLike = {
      from: () => ({ select: () => ({ limit: async () => ({ data: null, error: null }) }) }),
      rpc: async () => ({ data: null, error: null }),
    } as unknown as FullProbeClient;
    const r = await probeUnitProgressSync(headLike, L);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('select:not-array');
  });
  it('例外は無効化（学習を止めない）', async () => {
    const r = await probeUnitProgressSync(probeClient({ throwOnFrom: true }), L);
    expect(r.enabled).toBe(false);
    expect(r.reason).toBe('exception');
  });
  it('probeはサーバへ書き込まない（RPC成功でも行を作らない引数を使う）', async () => {
    const seen: Record<string, unknown>[] = [];
    const client = {
      from: () => ({ select: () => ({ limit: async () => ({ data: [], error: null }) }) }),
      rpc: async (_fn: string, args: Record<string, unknown>) => { seen.push(args); return { data: null, error: { code: 'P0409', message: 'conflict' } }; },
    } as unknown as FullProbeClient;
    await probeUnitProgressSync(client, L);
    expect(seen).toHaveLength(1);
    // expected=-1 は「行なし→P0409」分岐に必ず入る（0だけがinsertに進む）
    expect(seen[0].p_expected_row_version).toBe(-1);
    expect(seen[0].p_unit_id).toBe('__sync_probe__');
  });
});

describe('createSyncedUnitStorage', () => {
  it('save: 従来キーへの一次保存＋サーバ送出。loadはサーバ値を返しつつミラーする', async () => {
    const { client, rows } = fakeServer({ tableExists: true });
    const store = memStorage();
    let n = 0;
    const s = createSyncedUnitStorage({ learnerId: L, supabase: client, localStore: store, newMutationId: () => `m-${n++}`, now: () => 1000 });
    const state = { ...emptyRunState(U, 1), phase: 'diagnostic' as const, clearedQuestionIds: ['q1'] };
    const r = await s.save(state);
    expect(r.ok).toBe(true);
    expect(rows.get(`${L}/${U}`)?.row_version).toBe(1);                    // サーバ確定
    expect(store.getItem(localUnitStorageKey(U))).toContain('"q1"');       // 従来キー（庭園集計互換）
    const loaded = await s.load(U);
    expect(loaded?.clearedQuestionIds).toEqual(['q1']);
  });

  it('サーバが空で端末に既存進捗がある場合、loadで引き上げる（学習を失わない）', async () => {
    const { client, rows } = fakeServer({ tableExists: true });
    const store = memStorage();
    const legacy = { ...emptyRunState(U, 1), phase: 'stage2' as const, clearedQuestionIds: ['old1'] };
    store.setItem(localUnitStorageKey(U), JSON.stringify(legacy));
    const s = createSyncedUnitStorage({ learnerId: L, supabase: client, localStore: store, newMutationId: () => 'up-1', now: () => 1000 });
    const loaded = await s.load(U);
    expect(loaded?.phase).toBe('stage2');
    expect(rows.get(`${L}/${U}`)?.row_version).toBe(1);                    // 引き上げ済み
  });

  it('サーバ断でも ok（端末保存成功）で学習を止めず、outboxに未送信が残る', async () => {
    const { client } = fakeServer({ tableExists: true, down: true });
    const store = memStorage();
    const s = createSyncedUnitStorage({ learnerId: L, supabase: client, localStore: store, newMutationId: () => 'm-x', now: () => 1000 });
    const r = await s.save({ ...emptyRunState(U, 1), phase: 'diagnostic' as const });
    expect(r.ok).toBe(true);
    expect(createLocalStorageCachePort(store).readOutbox().length).toBe(1);
  });

  it('flushOutbox: 復帰後に未送信分をサーバへ流す', async () => {
    const down = fakeServer({ tableExists: true, down: true });
    const store = memStorage();
    const s1 = createSyncedUnitStorage({ learnerId: L, supabase: down.client, localStore: store, newMutationId: () => 'm-q', now: () => 1000 });
    await s1.save({ ...emptyRunState(U, 1), phase: 'diagnostic' as const });
    // 復帰（同じstoreを使い、生きているサーバに差し替え）
    const up = fakeServer({ tableExists: true });
    const s2 = createSyncedUnitStorage({ learnerId: L, supabase: up.client, localStore: store, newMutationId: () => 'm-r', now: () => 2000 });
    const flushed = await s2.flushOutbox();
    expect(flushed.sent).toBe(1);
    expect(flushed.remaining).toBe(0);
    expect(up.rows.get(`${L}/${U}`)?.row_version).toBe(1);
  });
});

describe('createLocalStorageCachePort', () => {
  it('row/outboxの往復とlearner単位のclear', () => {
    const store = memStorage();
    const port = createLocalStorageCachePort(store);
    const p: StoredProgress = { learnerId: L, unitId: U, state: emptyRunState(U, 1), rowVersion: 2, updatedAtMs: 5 };
    port.write(p);
    expect(port.read(L, U)?.rowVersion).toBe(2);
    const entry: OutboxEntry = { mutationId: 'm', learnerId: L, unitId: U, state: emptyRunState(U, 1), expectedRowVersion: 0, queuedAtMs: 1, attempts: 1 };
    port.writeOutbox([entry, { ...entry, learnerId: 'other' }]);
    port.clear(L);
    expect(port.read(L, U)).toBeNull();
    expect(port.readOutbox().map(e => e.learnerId)).toEqual(['other']);
  });
  it('壊れたJSONは空扱いで止まらない', () => {
    const store = memStorage();
    store.setItem('kawabado.aiCourse.v1.unitSync.outbox', '{broken');
    const port = createLocalStorageCachePort(store);
    expect(port.readOutbox()).toEqual([]);
  });
});
