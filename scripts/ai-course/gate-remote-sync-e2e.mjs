// GATE① server sync E2E（本番Supabaseに対する実測）。
//
// gate-remote-rls-matrix.mjs と同じ安全方針（合成fixture・厳密ID撤去・key非表示）で、
// 本物の実装コード（probeUnitProgressSync / createSyncedUnitStorage / unitProgressRepository）
// をそのまま動かし、端末2台・オフライン・競合・冪等・復習予定の往復を実測する。
//
// 実行: ./node_modules/.bin/vite-node scripts/ai-course/gate-remote-sync-e2e.mjs -- --confirm-remote
//   （src配下のTSを実コードとしてimportするため vite-node で動かす）
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {
  probeUnitProgressSync, createSyncedUnitStorage,
} from '../../src/lib/aiLesson/course/persistence/syncedUnitStorage';
import { emptyRunState } from '../../src/lib/aiLesson/course/n3unit/unitRuntime';
import { N2_GRAMMAR_ALIASES } from '../../src/lib/aiLesson/course/n2GrammarAliases';

const REF = 'jdkwijdphlkrcoiggfqw';
const SYNTH_DOMAIN = 'kawabado-sync-test.invalid';
const UNIT = 'n3u-01-self';

if (!process.argv.includes('--confirm-remote')) {
  console.error('refuse: --confirm-remote が必要（本番プロジェクトに合成fixtureを作成します）');
  process.exit(2);
}

const ROOT = join(import.meta.dirname, '../..');
const env = readFileSync(join(ROOT, '.env'), 'utf8');
const envVal = (k) => (env.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim().replace(/^["']|["']$/g, '');
const API = envVal('VITE_SUPABASE_URL').replace(/\/$/, '');
const ANON = envVal('VITE_SUPABASE_ANON_KEY');
if (!API || /localhost|127\.0\.0\.1/.test(API)) { console.error(`refuse: not remote: ${API}`); process.exit(2); }

const token = process.env.SUPABASE_ACCESS_TOKEN
  || (existsSync(join(homedir(), '.supabase_backup_token'))
    ? readFileSync(join(homedir(), '.supabase_backup_token'), 'utf8').trim() : '');
if (!token) { console.error('refuse: no management token'); process.exit(2); }

const mgmtSql = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`mgmt sql: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.json();
};

const keysRes = await fetch(`https://api.supabase.com/v1/projects/${REF}/api-keys?reveal=true`, {
  headers: { Authorization: `Bearer ${token}` },
});
const SERVICE = (await keysRes.json()).find(k => k.name === 'service_role')?.api_key;
if (!SERVICE) { console.error('refuse: service_role key unavailable'); process.exit(2); }
console.log('keys loaded (not displayed)');

const results = [];
const check = (id, desc, expected, actual) => {
  const e = String(expected), a = String(actual);
  results.push({ id, desc, expected: e, actual: a, pass: e === a });
  console.log(`${e === a ? 'PASS' : 'FAIL'}  ${id}  ${desc}  expected=${e} actual=${a}`);
};

/** 端末ごとに独立したlocalStorage相当 */
const memStorage = () => {
  const m = new Map();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, v); },
  };
};

/** offline=true の間だけネットワーク層が落ちている状態を再現する */
const gate = { offline: false };
const wrap = (c) => ({
  from: (table) => {
    if (gate.offline) {
      const down = () => { throw new Error('network down'); };
      return { select: () => ({ limit: down, eq: () => ({ eq: () => ({ maybeSingle: down }) }) }) };
    }
    return c.from(table);
  },
  rpc: async (fn, args) => (gate.offline
    ? { data: null, error: { message: 'network down' } }
    : await c.rpc(fn, args)),
});

const fixture = {};
const PASSWORD = `sync-gate-${Math.random().toString(36).slice(2)}-Aa1!`;
const rest = (path, opts = {}) => fetch(`${API}/rest/v1/${path}`, {
  ...opts,
  headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
});

try {
  const before = await mgmtSql(`select count(*)::text c from public.ai_learners`);
  console.log(`baseline learners=${before[0].c}`);

  const ts = Date.now();
  fixture.email = `gate-sync-${ts}@${SYNTH_DOMAIN}`;
  const uRes = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: fixture.email, password: PASSWORD, email_confirm: true }),
  });
  const uBody = await uRes.json();
  if (!uRes.ok) throw new Error(`createUser: ${uRes.status} ${JSON.stringify(uBody).slice(0, 200)}`);
  fixture.userId = uBody.id;

  const lRes = await rest('ai_learners', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: fixture.userId, display_name: 'SYNC GATE' }),
  });
  const lBody = await lRes.json();
  if (!lRes.ok) throw new Error(`mkLearner: ${lRes.status} ${JSON.stringify(lBody).slice(0, 200)}`);
  const L = lBody[0].id;
  fixture.learnerId = L;
  console.log(`fixture learner=${L.slice(0, 8)}***`);

  const mkDevice = async () => {
    const c = createClient(API, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await c.auth.signInWithPassword({ email: fixture.email, password: PASSWORD });
    if (error) throw new Error(`signIn: ${error.message}`);
    return { client: c, store: memStorage(), wrapped: wrap(c) };
  };
  const devA = await mkDevice();
  const devB = await mkDevice();

  // ── S01/S02: 完全probe ──
  const probe = await probeUnitProgressSync(devA.wrapped, L);
  check('S01', 'probeで同期が有効化される（本番実測）', 'true', probe.enabled);
  check('S02', 'probe 5項目すべて成立', 'table,columns,rls,rpc,version',
    Object.entries(probe.checks).filter(([, v]) => v).map(([k]) => k).join(','));

  const A = createSyncedUnitStorage({ learnerId: L, supabase: devA.wrapped, localStore: devA.store });
  const B = createSyncedUnitStorage({ learnerId: L, supabase: devB.wrapped, localStore: devB.store });

  // ── S03/S04: 端末Aで進捗 → サーバ行 ──
  const st1 = { ...emptyRunState(UNIT, Date.now()), phase: 'stage2', wrongItemIds: ['fi-namae'] };
  check('S03', '端末Aの保存が成功', 'true', (await A.save(st1)).ok);
  const r1 = await mgmtSql(`select count(*)::text c, coalesce(max(row_version)::text,'-') rv,
    coalesce(max(state->>'phase'),'-') phase from public.ai_course_unit_progress
    where learner_id = '${L}'::uuid and unit_id = '${UNIT}'`);
  check('S04', 'サーバ行1件・row_version 1・phase stage2', '1|1|stage2', `${r1[0].c}|${r1[0].rv}|${r1[0].phase}`);

  // ── S05: reload（同端末・新インスタンス） ──
  const reloadA = createSyncedUnitStorage({ learnerId: L, supabase: devA.wrapped, localStore: devA.store });
  check('S05', 'reload後も同じ位置から再開', 'stage2', (await reloadA.load(UNIT))?.phase);

  // ── S06/S07: 端末B（localStorage空）→ サーバから復元 ──
  const onB = await B.load(UNIT);
  check('S06', '端末Bがサーバから復元', 'stage2', onB?.phase);
  check('S07', '端末Bで誤答リストも復元', 'fi-namae', (onB?.wrongItemIds ?? []).join(','));

  // ── S08: localStorage全削除 → 復元 ──
  devB.store.clear();
  const B2 = createSyncedUnitStorage({ learnerId: L, supabase: devB.wrapped, localStore: devB.store });
  check('S08', 'localStorage削除後もサーバから復元', 'stage2', (await B2.load(UNIT))?.phase);

  // ── S09-S11: offline → outbox → 復帰flush ──
  gate.offline = true;
  const st2 = { ...st1, phase: 'stage3' };
  check('S09', 'offlineでも端末保存は成功（学習を止めない）', 'true', (await A.save(st2)).ok);
  check('S10', 'offline中はoutboxに未送信が残る', 'true', (await A.repository.flushOutbox()).remaining > 0);
  gate.offline = false;
  check('S11', '復帰でoutboxが流れ残0', '0', (await A.repository.flushOutbox()).remaining);

  // ── S12: 重複行なし ──
  const r2 = await mgmtSql(`select count(*)::text c, coalesce(max(state->>'phase'),'-') phase,
    coalesce(max(row_version)::text,'-') rv from public.ai_course_unit_progress
    where learner_id = '${L}'::uuid and unit_id = '${UNIT}'`);
  check('S12', 'flush後も行は1件でphaseが進む', '1|stage3', `${r2[0].c}|${r2[0].phase}`);

  // ── S13: 冪等（同一mutationIdの再送でrow_versionが進まない） ──
  const rv = Number(r2[0].rv);
  const c = devA.client;
  await c.rpc('ai_upsert_unit_progress', { p_learner_id: L, p_unit_id: UNIT, p_state: st2, p_expected_row_version: rv, p_mutation_id: 'e2e-idem' });
  const afterFirst = await mgmtSql(`select row_version::text rv from public.ai_course_unit_progress where learner_id='${L}'::uuid and unit_id='${UNIT}'`);
  await c.rpc('ai_upsert_unit_progress', { p_learner_id: L, p_unit_id: UNIT, p_state: st2, p_expected_row_version: rv, p_mutation_id: 'e2e-idem' });
  const afterSecond = await mgmtSql(`select row_version::text rv from public.ai_course_unit_progress where learner_id='${L}'::uuid and unit_id='${UNIT}'`);
  check('S13', '同一mutationId再送でrow_versionが進まない', afterFirst[0].rv, afterSecond[0].rv);

  // ── S14/S15: conflict（stale は黙って上書きしない） ──
  const stale = await c.rpc('ai_upsert_unit_progress', {
    p_learner_id: L, p_unit_id: UNIT, p_state: { ...st2, phase: 'intro' },
    p_expected_row_version: 1, p_mutation_id: 'e2e-stale',
  });
  check('S14', 'stale rowVersionはP0409で拒否', 'P0409', stale.error?.code);
  const afterStale = await mgmtSql(`select coalesce(state->>'phase','-') phase from public.ai_course_unit_progress where learner_id='${L}'::uuid and unit_id='${UNIT}'`);
  check('S15', 'conflict時にサーバstateが巻き戻らない', 'true', afterStale[0].phase !== 'intro');

  // ── S16: 復習予定が端末をまたいで保持される ──
  await A.save({ ...st2, phase: 'result', reviewItemIds: ['fi-namae', 'fi-sumu'] });
  const rt = await B2.load(UNIT);
  check('S16', '復習予定が端末をまたいで保持', 'fi-namae,fi-sumu', (rt?.reviewItemIds ?? []).join(','));

  // ── S17: 同期経路のselectでも他learnerは見えない ──
  const others = await c.from('ai_course_unit_progress').select('learner_id').neq('learner_id', L);
  check('S17', '同期経路のselectで他learner 0件', '0', (others.data ?? []).length);

  // ── S18/S19: N2恒等式 ──
  // 恒等式（n2GrammarAliases.ts の定義）: 原本180 = canonical 178 + 統合alias 2。
  // alias 2件は原本データ内に残したまま（保存済みprogressの互換のため）、表示・集計はcanonicalへ寄せる。
  const aliasN = Object.keys(N2_GRAMMAR_ALIASES).length;
  const { N2_GRAMMAR_ITEMS } = await import('../../src/lib/aiLesson/course/n2GrammarData');
  const raw = N2_GRAMMAR_ITEMS.length;
  check('S18', 'N2 aliasは2件', '2', aliasN);
  check('S19', 'N2 原本180 = canonical 178 + alias 2', '180|178', `${raw}|${raw - aliasN}`);
} finally {
  console.log('\n--- cleanup ---');
  if (fixture.userId && fixture.email?.endsWith(`@${SYNTH_DOMAIN}`)) {
    const v = await mgmtSql(`select email from auth.users where id = '${fixture.userId}'::uuid`);
    if (v[0]?.email === fixture.email) {
      const r = await fetch(`${API}/auth/v1/admin/users/${fixture.userId}`, {
        method: 'DELETE', headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
      });
      console.log(`removed fixture ${fixture.userId.slice(0, 8)}*** → http:${r.status}`);
    } else { console.log('SKIP cleanup: email mismatch'); }
  }
  const after = await mgmtSql(`select 'learners' k, count(*)::text v from public.ai_learners
    union all select 'unit_progress', count(*)::text from public.ai_course_unit_progress
    union all select 'auth_users', count(*)::text from auth.users order by 1`);
  console.log(`after: ${after.map(r => `${r.k}=${r.v}`).join(' ')}`);
}

const fails = results.filter(r => !r.pass);
console.log(`\nTOTAL ${results.length}  PASS ${results.length - fails.length}  FAIL ${fails.length}`);
process.exit(fails.length ? 1 : 0);
