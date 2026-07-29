// Repository / outbox / 楽観ロック / cross-device のガード（§14-§15）。
//
// 注意: ここで使うサーバはin-memoryの模擬実装であり、実Postgres/Supabaseの検証ではない。
// RLSの実証は local Supabase（Docker必要）で別途行う必要がある。
import { describe, it, expect } from 'vitest';
import {
  createUnitProgressRepository, mergeProgress,
  type ProgressServerPort, type LocalCachePort, type StoredProgress, type OutboxEntry,
} from './unitProgressRepository';
import { emptyRunState, type UnitRunState } from '../n3unit/unitRuntime';

const NOW = 1_800_000_000_000;
const UNIT = 'n3u-01-self';

/** learnerごとに分離し、rowVersionとmutationId冪等を模擬するサーバ */
const createFakeServer = (opts: { fail?: 'unavailable' | 'denied' | 'auth_expired' | null } = {}) => {
  const rows = new Map<string, StoredProgress>();
  const seenMutations = new Set<string>();
  let mode = opts.fail ?? null;
  const key = (l: string, u: string) => `${l}::${u}`;
  const server: ProgressServerPort = {
    async fetch(learnerId, unitId) {
      if (mode) return { ok: false, error: { kind: mode } };
      return { ok: true, value: rows.get(key(learnerId, unitId)) ?? null };
    },
    async upsert({ learnerId, unitId, state, expectedRowVersion, mutationId, nowMs }) {
      if (mode) return { ok: false, error: { kind: mode } };
      if (seenMutations.has(mutationId)) {
        return { ok: true, value: rows.get(key(learnerId, unitId))! }; // 冪等: 二重適用しない
      }
      const cur = rows.get(key(learnerId, unitId));
      const curVersion = cur?.rowVersion ?? 0;
      if (curVersion !== expectedRowVersion) return { ok: false, error: { kind: 'conflict', server: cur! } };
      const next: StoredProgress = { learnerId, unitId, state, rowVersion: curVersion + 1, updatedAtMs: nowMs };
      rows.set(key(learnerId, unitId), next);
      seenMutations.add(mutationId);
      return { ok: true, value: next };
    },
  };
  return {
    server, rows,
    setMode: (m: typeof mode) => { mode = m; },
    /** 別端末が先に書き込んだ状況を作る */
    seed: (p: StoredProgress) => rows.set(key(p.learnerId, p.unitId), p),
  };
};

const createFakeCache = (): LocalCachePort & { store: Map<string, StoredProgress>; outbox: OutboxEntry[] } => {
  const store = new Map<string, StoredProgress>();
  let outbox: OutboxEntry[] = [];
  return {
    store, get outbox() { return outbox; },
    read: (l, u) => store.get(`${l}::${u}`) ?? null,
    write: (p) => { store.set(`${p.learnerId}::${p.unitId}`, p); },
    readOutbox: () => outbox,
    writeOutbox: (e) => { outbox = e; },
    clear: (l) => { for (const k of [...store.keys()]) if (k.startsWith(l + '::')) store.delete(k);
      outbox = outbox.filter(e => e.learnerId !== l); },
  };
};

const makeRepo = (fail: 'unavailable' | 'denied' | 'auth_expired' | null = null) => {
  const fake = createFakeServer({ fail });
  const cache = createFakeCache();
  let n = 0;
  const repo = createUnitProgressRepository({
    server: fake.server, cache, newMutationId: () => `m${++n}`, now: () => NOW,
  });
  return { repo, fake, cache };
};

const stateAt = (phase: UnitRunState['phase'], cleared: string[] = []): UnitRunState =>
  ({ ...emptyRunState(UNIT, NOW), phase, clearedQuestionIds: cleared });

describe('Repository: 保存の確定表示（§14）', () => {
  it('サーバ確定でのみ persisted=true になる', async () => {
    const { repo } = makeRepo();
    const r = await repo.save('learner-a', stateAt('stage1'));
    expect(r.persisted).toBe(true);
    expect(r.status).toBe('synced');
    expect(r.progress.rowVersion).toBe(1);
  });
  it('通信不能なら persisted=false・未同期としてoutboxへ積む', async () => {
    const { repo, cache } = makeRepo('unavailable');
    const r = await repo.save('learner-a', stateAt('stage1'));
    expect(r.persisted).toBe(false);
    expect(r.status).toBe('pending');
    expect(cache.outbox.length).toBe(1);
    expect(repo.pendingCount()).toBe(1);
  });
  it('権限エラーは再送しない（outboxへ積まない）', async () => {
    const { repo, cache } = makeRepo('denied');
    const r = await repo.save('learner-a', stateAt('stage1'));
    expect(r.status).toBe('denied');
    expect(cache.outbox.length).toBe(0);
  });
  it('認証切れはauth_expiredとして返す', async () => {
    const { repo } = makeRepo('auth_expired');
    expect((await repo.save('learner-a', stateAt('stage1'))).status).toBe('auth_expired');
  });
});

describe('Repository: 冪等と楽観ロック', () => {
  it('同じmutationIdの二重送信で二重適用されない', async () => {
    const { fake } = makeRepo();
    const a = await fake.server.upsert({ learnerId: 'l', unitId: UNIT, state: stateAt('stage1'), expectedRowVersion: 0, mutationId: 'x', nowMs: NOW });
    const b = await fake.server.upsert({ learnerId: 'l', unitId: UNIT, state: stateAt('stage2'), expectedRowVersion: 0, mutationId: 'x', nowMs: NOW });
    expect(a.ok && b.ok).toBe(true);
    expect(a.ok && a.value.rowVersion).toBe(1);
    expect(b.ok && b.value.rowVersion).toBe(1); // 増えない
  });
  it('stale rowVersionはconflictになり、mergeして再送される', async () => {
    const { repo, fake, cache } = makeRepo();
    // 別端末が先に stage3 まで進めて保存済み
    fake.seed({ learnerId: 'l', unitId: UNIT, state: stateAt('stage3', ['q1']), rowVersion: 5, updatedAtMs: NOW });
    cache.write({ learnerId: 'l', unitId: UNIT, state: stateAt('stage1', ['q2']), rowVersion: 1, updatedAtMs: NOW });
    const r = await repo.save('l', stateAt('stage1', ['q2']));
    expect(r.persisted).toBe(true);
    expect(r.serverProgress?.rowVersion).toBe(5);
    // mergeで両端末の実績が残る
    expect(r.progress.state.clearedQuestionIds.sort()).toEqual(['q1', 'q2']);
    expect(r.progress.state.phase).toBe('stage3'); // 進んでいる方を採用
  });
});

describe('merge policy は決定的（§14）', () => {
  it('完了は未完了に勝つ', () => {
    const done = { ...stateAt('result'), completedAtMs: NOW, missionCleared: true };
    expect(mergeProgress(done, stateAt('stage2')).phase).toBe('result');
    expect(mergeProgress(stateAt('stage2'), done).phase).toBe('result');
  });
  it('両方完了なら先に完了した方を採る（新しい方ではない）', () => {
    const early = { ...stateAt('result'), completedAtMs: NOW, missionCleared: true };
    const late = { ...stateAt('result'), completedAtMs: NOW + 10_000, missionCleared: true };
    expect(mergeProgress(late, early).completedAtMs).toBe(NOW);
  });
  it('どの分岐でも解答実績は失われない', () => {
    const a = stateAt('stage1', ['q1', 'q2']);
    const b = stateAt('stage3', ['q3']);
    const m = mergeProgress(a, b);
    expect(m.clearedQuestionIds.sort()).toEqual(['q1', 'q2', 'q3']);
  });
  it('attemptsは多い方の回数を保つ（消失させない）', () => {
    const a: UnitRunState = { ...stateAt('stage1'), attempts: { x: { itemId: 'x', correctCount: 3, wrongCount: 1, lastCorrectAtMs: NOW } } };
    const b: UnitRunState = { ...stateAt('stage1'), attempts: { x: { itemId: 'x', correctCount: 1, wrongCount: 4, lastCorrectAtMs: NOW + 5 } } };
    const m = mergeProgress(a, b);
    expect(m.attempts.x.correctCount).toBe(3);
    expect(m.attempts.x.wrongCount).toBe(4);
  });
  it('mergeは順序に依存しない（可換）', () => {
    const a = stateAt('stage2', ['q1']);
    const b = stateAt('stage3', ['q2']);
    expect(mergeProgress(a, b).phase).toBe(mergeProgress(b, a).phase);
    expect(mergeProgress(a, b).clearedQuestionIds.sort()).toEqual(mergeProgress(b, a).clearedQuestionIds.sort());
  });
});

describe('Outbox: オフライン→復帰', () => {
  it('復帰時に順序どおり送られ、成功分だけ消える', async () => {
    const { repo, fake, cache } = makeRepo('unavailable');
    await repo.save('l', stateAt('stage1'));
    await repo.save('l', stateAt('stage2'));
    expect(cache.outbox.length).toBe(2);
    fake.setMode(null);
    const r = await repo.flushOutbox();
    expect(r.sent).toBeGreaterThanOrEqual(1);
    expect(r.remaining).toBe(0);
    expect(repo.pendingCount()).toBe(0);
  });
  it('途中で失敗したら以降は送らず順序を保って残す', async () => {
    const { repo, fake, cache } = makeRepo('unavailable');
    await repo.save('l', stateAt('stage1'));
    await repo.save('l', stateAt('stage2'));
    fake.setMode('denied'); // 復帰したが権限エラー
    const r = await repo.flushOutbox();
    expect(r.sent).toBe(0);
    expect(r.remaining).toBe(2);
    expect(cache.outbox[0].attempts).toBe(2);
  });
});

describe('cross-device（模擬サーバでの往復・§15）', () => {
  it('Device A の進捗を Device B が復元し、続きから進める', async () => {
    const fake = createFakeServer();
    const cacheA = createFakeCache(), cacheB = createFakeCache();
    let n = 0;
    const mk = (c: LocalCachePort) => createUnitProgressRepository({
      server: fake.server, cache: c, newMutationId: () => `m${++n}`, now: () => NOW });
    const repoA = mk(cacheA), repoB = mk(cacheB);

    // A: stage1完了まで進めて保存 → logout
    const a1 = await repoA.save('l', stateAt('stage1', ['q1', 'q2']));
    expect(a1.persisted).toBe(true);
    expect(repoA.onLogout('l').discardedPending).toBe(0);
    expect(cacheA.store.size).toBe(0); // 端末に学習記録を残さない

    // B: login → 位置と実績が復元される
    const loaded = await repoB.load('l', UNIT);
    expect(loaded.status).toBe('synced');
    expect(loaded.progress?.state.phase).toBe('stage1');
    expect(loaded.progress?.state.clearedQuestionIds.sort()).toEqual(['q1', 'q2']);

    // B: stage2へ進めて保存（rowVersionは引き継がれている）
    const b1 = await repoB.save('l', stateAt('stage2', ['q1', 'q2', 'q3']));
    expect(b1.persisted).toBe(true);
    expect(b1.progress.rowVersion).toBe(2);
  });
  it('別learnerのデータは混ざらない', async () => {
    const { repo } = makeRepo();
    await repo.save('learner-a', stateAt('stage3', ['qa']));
    const other = await repo.load('learner-b', UNIT);
    expect(other.progress).toBeNull();
  });
  it('同時更新（両方stale）でも実績が消えない', async () => {
    const fake = createFakeServer();
    const cacheA = createFakeCache(), cacheB = createFakeCache();
    let n = 0;
    const mk = (c: LocalCachePort) => createUnitProgressRepository({
      server: fake.server, cache: c, newMutationId: () => `m${++n}`, now: () => NOW });
    const repoA = mk(cacheA), repoB = mk(cacheB);
    await repoA.save('l', stateAt('stage1', ['q1']));      // rowVersion 1
    await repoB.load('l', UNIT);                            // B が v1 を取得
    await repoA.save('l', stateAt('stage2', ['q1', 'q2'])); // A が v2 へ
    const bSave = await repoB.save('l', stateAt('stage1', ['q1', 'q3'])); // B は v1 前提 → conflict
    expect(bSave.persisted).toBe(true);
    expect(bSave.progress.state.clearedQuestionIds.sort()).toEqual(['q1', 'q2', 'q3']);
  });
});
