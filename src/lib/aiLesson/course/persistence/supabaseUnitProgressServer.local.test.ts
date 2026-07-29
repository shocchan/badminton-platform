// @vitest-environment node
// H1: unitProgressRepository × 実Supabase(local) の cross-device 実証。
//
// 通常のテスト実行では skip される（Dockerを要求しない）。実行方法:
//   supabase status -o json > /tmp/local-status.json
//   H1_LOCAL_STATUS=/tmp/local-status.json npx vitest run src/lib/aiLesson/course/persistence/supabaseUnitProgressServer.local.test.ts
//
// ⚠️ local専用ガード: API_URLが127.0.0.1/localhost以外なら実行を拒否する（共有Supabaseへ向けない）。
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createUnitProgressRepository, type LocalCachePort, type OutboxEntry, type StoredProgress } from './unitProgressRepository';
import { createSupabaseProgressServer, type SupabaseLike } from './supabaseUnitProgressServer';
import { emptyRunState, type UnitRunState } from '../n3unit/unitRuntime';

const statusPath = process.env.H1_LOCAL_STATUS ?? '';
const enabled = statusPath.length > 0;

interface LocalStatus { API_URL: string; ANON_KEY: string; SERVICE_ROLE_KEY: string }
const readStatus = (): LocalStatus => JSON.parse(readFileSync(statusPath, 'utf8')) as LocalStatus;

/** 端末1台ぶんの in-memory cache（localStorage相当） */
const memCache = (): LocalCachePort => {
  const rows = new Map<string, StoredProgress>();
  let outbox: OutboxEntry[] = [];
  return {
    read: (l, u) => rows.get(`${l}/${u}`) ?? null,
    write: (p) => { rows.set(`${p.learnerId}/${p.unitId}`, p); },
    readOutbox: () => outbox,
    writeOutbox: (e) => { outbox = e; },
    clear: () => { rows.clear(); outbox = []; },
  };
};

describe.skipIf(!enabled)('H1: unitProgressRepository × local Supabase（cross-device）', () => {
  let st: LocalStatus;
  let admin: SupabaseClient;
  let learnerId = '';
  const unitId = 'n3u-01-self';
  const password = 'h1-local-pass-123';
  let email = '';

  beforeAll(async () => {
    st = readStatus();
    if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(st.API_URL)) {
      throw new Error(`refuse non-local URL: ${st.API_URL}`);
    }
    admin = createClient(st.API_URL, st.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    email = `h1-repo-${Date.now()}@local.test`;
    const { data: created, error: cErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (cErr) throw cErr;
    const { data: learner, error: lErr } = await admin.from('ai_learners')
      .insert({ user_id: created.user.id, display_name: 'H1 repo' }).select('id').single();
    if (lErr) throw lErr;
    learnerId = (learner as { id: string }).id;
  }, 30000);

  const deviceClient = async (): Promise<SupabaseClient> => {
    const c = createClient(st.API_URL, st.ANON_KEY, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return c;
  };

  it('端末A保存→端末B取得→両端末更新のconflictが決定的mergeで解決し、学習実績を失わない', async () => {
    const clientA = await deviceClient();
    const clientB = await deviceClient();
    const serverA = createSupabaseProgressServer(clientA as unknown as SupabaseLike);
    const serverB = createSupabaseProgressServer(clientB as unknown as SupabaseLike);
    let seq = 0;
    const repoA = createUnitProgressRepository({ server: serverA, cache: memCache(), newMutationId: () => `A-${Date.now()}-${seq++}`, now: () => Date.now() });
    const repoB = createUnitProgressRepository({ server: serverB, cache: memCache(), newMutationId: () => `B-${Date.now()}-${seq++}`, now: () => Date.now() });

    // 端末A: 新規保存（rowVersion 1）
    const base: UnitRunState = { ...emptyRunState(unitId, 1000), phase: 'diagnostic' };
    const loadA1 = await repoA.load(learnerId, unitId);
    expect(loadA1.status).toBe('synced');
    expect(loadA1.progress).toBeNull();
    const savedA1 = await repoA.save(learnerId, { ...base, clearedQuestionIds: ['qa1'] });
    expect(savedA1.persisted).toBe(true);
    expect(savedA1.progress.rowVersion).toBe(1);

    // 端末B: サーバから取得（v1が見える）→ 別の問題を解いて保存（v2）
    const loadB1 = await repoB.load(learnerId, unitId);
    expect(loadB1.progress?.rowVersion).toBe(1);
    expect(loadB1.progress?.state.clearedQuestionIds).toEqual(['qa1']);
    const savedB1 = await repoB.save(learnerId, { ...base, clearedQuestionIds: ['qa1', 'qb1'] });
    expect(savedB1.persisted).toBe(true);
    expect(savedB1.progress.rowVersion).toBe(2);

    // 端末A（staleなv1キャッシュのまま）: 別の実績を保存 → conflict → 決定的merge → v3
    const savedA2 = await repoA.save(learnerId, { ...base, clearedQuestionIds: ['qa1', 'qa2'] });
    expect(savedA2.persisted).toBe(true);
    expect(savedA2.status).toBe('synced');
    expect(savedA2.progress.rowVersion).toBe(3);
    // 両端末の実績が失われていない（和集合）
    expect([...savedA2.progress.state.clearedQuestionIds].sort()).toEqual(['qa1', 'qa2', 'qb1']);
    // conflict時はサーバ側の値も返している（黙って上書きしない）
    expect(savedA2.serverProgress?.rowVersion).toBe(2);
  }, 30000);

  it('同じmutationIdの再送はrow_versionを進めない（冪等）', async () => {
    const client = await deviceClient();
    const server = createSupabaseProgressServer(client as unknown as SupabaseLike);
    const cur = await server.fetch(learnerId, unitId);
    if (!cur.ok || !cur.value) throw new Error('fixture missing');
    const v = cur.value.rowVersion;
    const state: UnitRunState = { ...cur.value.state, cursor: 9 };
    const first = await server.upsert({ learnerId, unitId, state, expectedRowVersion: v, mutationId: 'idem-1', nowMs: Date.now() });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.rowVersion).toBe(v + 1);
    // 同じmutationIdを（stale expectedでも）再送 → 現行行がそのまま返る
    const replay = await server.upsert({ learnerId, unitId, state, expectedRowVersion: v, mutationId: 'idem-1', nowMs: Date.now() });
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.rowVersion).toBe(v + 1);
  }, 30000);

  it('他人のlearnerIdへのupsertはdeniedになり、「保存しました」と偽らない', async () => {
    const client = await deviceClient();
    const server = createSupabaseProgressServer(client as unknown as SupabaseLike);
    const { data: stranger, error } = await admin.auth.admin.createUser({
      email: `h1-stranger-${Date.now()}@local.test`, password, email_confirm: true,
    });
    if (error) throw error;
    const { data: otherLearner, error: lErr } = await admin.from('ai_learners')
      .insert({ user_id: stranger.user.id, display_name: 'H1 other' }).select('id').single();
    if (lErr) throw lErr;
    const otherId = (otherLearner as { id: string }).id;

    const repo = createUnitProgressRepository({ server, cache: memCache(), newMutationId: () => `X-${Date.now()}`, now: () => Date.now() });
    const outcome = await repo.save(otherId, { ...emptyRunState(unitId, 1000), phase: 'diagnostic' });
    expect(outcome.persisted).toBe(false);
    expect(outcome.status).toBe('denied');
  }, 30000);
});
